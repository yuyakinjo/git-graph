import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { generateCommitMessage, generatePrDescription, generateStashName } from "../lib/ai";
import { api } from "../lib/api";
import { renamedStashMessage, splitStashMessage, uniqueStashName } from "../lib/stash";
import { useDialogs } from "../components/ui-context";
import type { RecomposeMode } from "../lib/recompose";
import { useStore } from "./store";
import { t } from "../i18n";
import type { FormField } from "../components/ui";
import type {
  BranchInfo,
  PullRequest,
  RecomposeOp,
  StashInfo,
  TidyItem,
  TidyPlan,
  TidyResult,
  WorktreeInfo,
} from "../lib/types";

/** 呼んだ時点の言語の文言 (useMemo の外で言語が変わっても追従する) */
const msg = () => t().actions;

export function useActions() {
  const s = useStore();
  const dialogs = useDialogs();

  return useMemo(() => {
    const dir = s.dir;
    const localBranchOptions = () =>
      s.branches.filter((b) => b.kind === "local").map((b) => ({ value: b.name, label: b.name }));

    // ---------------------------------------------------------- repo
    const openFolder = async () => {
      const picked = await openFileDialog({ directory: true, multiple: false });
      if (typeof picked === "string") await s.openRepo(picked);
    };

    // ---------------------------------------------------------- 1. checkout
    const checkout = (target: string, label = target) =>
      s.run(msg().run.checkout(label), () => api.checkout(dir, target), {
        successDetail: false,
      });

    const checkoutRemote = (remoteBranch: string) =>
      s.run(msg().run.checkout(remoteBranch), () => api.checkoutRemote(dir, remoteBranch), {
        successDetail: false,
      });

    const createBranch = async (startPoint?: string) => {
      const res = await dialogs.form({
        title: msg().createBranch.title,
        description: startPoint ? msg().createBranch.startPoint(startPoint) : undefined,
        fields: [
          {
            name: "name",
            label: msg().common.branchName,
            type: "text",
            required: true,
            mono: true,
            placeholder: "feature/awesome",
          },
          {
            name: "checkout",
            label: msg().createBranch.checkout,
            type: "checkbox",
            value: true,
          },
        ],
        submitLabel: msg().common.create,
      });
      if (!res) return;
      await s.run(
        msg().run.createBranch(String(res.name)),
        () => api.createBranch(dir, String(res.name).trim(), startPoint, Boolean(res.checkout)),
        { successDetail: false },
      );
    };

    const deleteBranch = async (b: BranchInfo) => {
      if (b.kind === "remote") {
        const ok = await dialogs.confirm({
          title: msg().deleteBranch.remoteTitle,
          message: msg().deleteBranch.remoteMessage(b.name),
          confirmLabel: msg().common.delete,
          danger: true,
        });
        if (!ok) return;
        await s.run(msg().run.deleteBranch(b.name), () => api.deleteRemoteBranch(dir, b.name));
        return;
      }
      const ok = await dialogs.confirm({
        title: msg().deleteBranch.title,
        message: msg().deleteBranch.message(b.name),
        confirmLabel: msg().common.delete,
        danger: true,
      });
      if (!ok) return;
      const done = await s.run(
        msg().run.deleteBranch(b.name),
        () => api.deleteBranch(dir, b.name, false),
        {
          successDetail: false,
        },
      );
      if (!done) {
        const force = await dialogs.confirm({
          title: msg().common.forceDeleteTitle,
          message: msg().deleteBranch.forceMessage(b.name),
          confirmLabel: msg().common.forceDelete,
          danger: true,
        });
        if (force)
          await s.run(msg().run.forceDeleteBranch(b.name), () =>
            api.deleteBranch(dir, b.name, true),
          );
      }
    };

    const deleteTag = async (name: string) => {
      const remote = s.repo?.remotes[0];
      const res = await dialogs.form({
        title: msg().deleteTag.title,
        description: msg().deleteTag.description(name),
        fields: remote
          ? [
              {
                name: "remote",
                label: msg().deleteTag.alsoRemote(remote),
                type: "checkbox",
                value: false,
              },
            ]
          : [],
        submitLabel: msg().common.delete,
        danger: true,
      });
      if (!res) return;
      const done = await s.run(msg().run.deleteTag(name), () => api.deleteTag(dir, name), {
        successDetail: false,
      });
      if (done && remote && res.remote) {
        await s.run(msg().run.deleteRemoteTag(name, remote), () =>
          api.deleteRemoteTag(dir, remote, name),
        );
      }
    };

    // ---------------------------------------------------------- 2. stash
    /** 確認せずにすぐスタッシュする。名前は日時から重ならないように付ける (あとで変更できる) */
    const stashPush = async () => {
      if (!s.dirty) {
        s.toast({ kind: "info", title: msg().stash.nothingToStash });
        return;
      }
      const name = uniqueStashName(s.stashes.map((st) => st.message));
      await s.run(msg().run.stashPush(name), () => api.stashPush(dir, name, true), {
        successDetail: false,
      });
    };

    const stashRename = async (st: StashInfo) => {
      const res = await dialogs.form({
        title: msg().stash.renameTitle,
        description: st.name,
        width: 480,
        action: {
          label: msg().common.aiGenerate,
          busyLabel: msg().common.aiGenerating,
          icon: "sparkle",
          title: msg().stash.aiTitle,
          run: async (values) => {
            try {
              const ctx = await api.stashContext(dir, st.name);
              if (!ctx.diff.trim()) {
                s.toast({ kind: "info", title: msg().stash.noDiff });
                return;
              }
              return { name: await generateStashName(s.aiCliModel, ctx, String(values.name)) };
            } catch (e) {
              s.toast({
                kind: "error",
                title: msg().stash.aiFailed,
                detail: String(e),
              });
            }
          },
        },
        fields: [
          {
            name: "name",
            label: msg().stash.name,
            type: "text",
            required: true,
            value: splitStashMessage(st.message).name,
          },
        ],
        submitLabel: msg().stash.rename,
      });
      if (!res) return;
      const message = renamedStashMessage(st.message, String(res.name));
      if (message === st.message) return;
      await s.run(msg().run.stashRename(st.name), () => api.stashRename(dir, st.name, message), {
        successDetail: false,
      });
    };

    const stashApply = (st: StashInfo, pop: boolean) =>
      s.run(pop ? msg().run.stashPop(st.name) : msg().run.stashApply(st.name), () =>
        api.stashApply(dir, st.name, pop),
      );

    const stashDrop = async (st: StashInfo) => {
      const ok = await dialogs.confirm({
        title: msg().stash.dropTitle,
        message: msg().stash.dropMessage(st.name, st.message),
        confirmLabel: msg().stash.drop,
        danger: true,
      });
      if (ok) await s.run(msg().run.stashDrop(st.name), () => api.stashDrop(dir, st.name));
    };

    // ---------------------------------------------------------- 3. pull / fetch
    const fetch = () => s.run(msg().run.fetch, () => api.fetch(dir, true), { silentSuccess: true });

    const pull = async (rebase = false) => {
      await s.run(rebase ? msg().run.pullRebase : msg().run.pull, () =>
        api.pull(dir, rebase, s.dirty),
      );
    };

    /**
     * ブランチ一覧から pull する。
     * HEAD なら通常の pull、それ以外は checkout せずに upstream へ早送りする。
     */
    const pullBranch = async (b: BranchInfo, rebase = false) => {
      if (b.isHead) return pull(rebase);
      await s.run(msg().run.fastForward(b.name, b.upstream), () => api.fastForward(dir, b.name));
    };

    // ---------------------------------------------------------- 4-5. add / commit
    const stage = (paths: string[]) =>
      s.run(msg().run.stage, () => api.stage(dir, paths), { silentSuccess: true });
    const stageAll = () =>
      s.run(msg().run.stageAll, () => api.stageAll(dir), { silentSuccess: true });
    const unstage = (paths: string[]) =>
      s.run(msg().run.unstage, () => api.unstage(dir, paths), {
        silentSuccess: true,
      });
    const unstageAll = () =>
      s.run(msg().run.unstageAll, () => api.unstageAll(dir), {
        silentSuccess: true,
      });

    const discard = async (paths: string[]) => {
      const ok = await dialogs.confirm({
        title: msg().discard.title,
        message:
          paths.length === 1
            ? msg().discard.messageOne(paths[0])
            : msg().discard.messageMany(paths.length),
        confirmLabel: msg().discard.confirm,
        danger: true,
      });
      if (ok)
        await s.run(msg().run.discard, () => api.discard(dir, paths), {
          successDetail: false,
        });
    };

    const commit = async (message: string, amend: boolean) => {
      const staged = s.status?.staged.length ?? 0;
      if (staged === 0 && !amend) {
        await api.stageAll(dir).catch(() => undefined);
      }
      return s.run(
        amend ? msg().run.amend : msg().run.commit,
        () => api.commit(dir, message, amend),
        {
          successDetail: false,
        },
      );
    };

    /**
     * メッセージをダイアログで聞いてコミットする (ダッシュボタン用)。
     * `ai` なら開いた直後に Claude Code でメッセージを生成する。`amend` は --amend の初期値。
     */
    const commitPrompt = async (opts: { ai?: boolean; amend?: boolean } = {}) => {
      const staged = s.status?.staged.length ?? 0;
      const res = await dialogs.form({
        title: opts.amend ? msg().commit.amendTitle : msg().commit.title,
        description: opts.amend
          ? staged > 0
            ? msg().commit.amendWithStaged(staged)
            : msg().commit.amendMessageOnly
          : staged > 0
            ? msg().commit.commitStaged(staged)
            : msg().commit.commitAll,
        width: 560,
        action: {
          label: msg().common.aiGenerate,
          busyLabel: msg().common.aiGenerating,
          icon: "sparkle",
          title: msg().commit.aiTitle,
          autoRun: opts.ai,
          run: async (values) => {
            try {
              const ctx = await api.commitContext(dir, Boolean(values.amend));
              if (!ctx.diff.trim()) {
                s.toast({
                  kind: "info",
                  title: msg().commit.noDiff,
                });
                return;
              }
              return {
                message: await generateCommitMessage(s.aiCliModel, ctx),
              };
            } catch (e) {
              s.toast({
                kind: "error",
                title: msg().commit.aiFailed,
                detail: String(e),
              });
            }
          },
        },
        fields: [
          {
            name: "message",
            label: msg().commit.message,
            type: "textarea",
            rows: 5,
            required: true,
          },
          {
            name: "amend",
            label: msg().commit.amend,
            type: "checkbox",
            value: Boolean(opts.amend),
          },
        ],
        submitLabel: msg().commit.submit,
      });
      if (!res) return;
      await commit(String(res.message), Boolean(res.amend));
    };

    // ---------------------------------------------------------- 6. push
    const push = async (opts: { force?: boolean } = {}) => {
      const head = s.headBranch;
      if (!head) {
        s.toast({
          kind: "error",
          title: msg().push.detached,
        });
        return;
      }
      const remote = s.repo?.remotes[0] ?? "origin";
      if (!head.upstream) {
        const ok = await dialogs.confirm({
          title: msg().push.setUpstreamTitle,
          message: msg().push.setUpstreamMessage(head.name, remote),
          confirmLabel: msg().push.submit,
        });
        if (!ok) return;
        await s.run(msg().run.push, () =>
          api.push(dir, { remote, branch: head.name, setUpstream: true }),
        );
        return;
      }
      if (head.behind > 0 && !opts.force) {
        const res = await dialogs.form({
          title: msg().push.behindTitle,
          description: msg().push.behindDescription(head.name, head.behind),
          fields: [
            {
              name: "how",
              label: msg().push.how,
              type: "select",
              value: "pull",
              options: [
                { value: "pull", label: msg().push.pullFirst },
                { value: "force", label: msg().push.forceWithLease },
              ],
            },
          ],
          submitLabel: msg().push.continue,
        });
        if (!res) return;
        if (res.how === "pull") {
          const ok = await s.run(msg().run.pull, () => api.pull(dir, false, s.dirty));
          if (!ok) return;
          await s.run(msg().run.push, () => api.push(dir, { remote, branch: head.name }));
          return;
        }
        await s.run(msg().run.forcePush, () =>
          api.push(dir, { remote, branch: head.name, forceWithLease: true }),
        );
        return;
      }
      await s.run(msg().run.push, () =>
        api.push(dir, {
          remote,
          branch: head.name,
          forceWithLease: opts.force,
        }),
      );
    };

    const forcePush = async () => {
      const head = s.headBranch;
      const ok = await dialogs.confirm({
        title: msg().push.forceTitle,
        message: msg().push.forceMessage(head?.name ?? "HEAD"),
        confirmLabel: msg().push.forceConfirm,
        danger: true,
      });
      if (ok) await push({ force: true });
    };

    // ---------------------------------------------------------- 7. worktree
    const worktreeAdd = async () => {
      const home = await api.homeDir().catch(() => "");
      const parent = s.repo ? s.repo.root.slice(0, s.repo.root.lastIndexOf("/")) : home;
      const res = await dialogs.form({
        title: msg().worktree.addTitle,
        description: msg().worktree.addDescription,
        width: 560,
        fields: [
          {
            name: "mode",
            label: msg().worktree.branch,
            type: "select",
            value: "new",
            options: [
              { value: "new", label: msg().worktree.newBranch },
              { value: "existing", label: msg().worktree.existingBranch },
            ],
          },
          {
            name: "branch",
            label: msg().common.branchName,
            type: "text",
            required: true,
            mono: true,
            placeholder: "feature/awesome",
          },
          {
            name: "base",
            label: msg().worktree.base,
            type: "select",
            value: s.repo?.headBranch ?? "",
            options: localBranchOptions(),
          },
          {
            name: "path",
            label: msg().worktree.path,
            type: "dirpath",
            required: true,
            value: `${parent}/${s.repo?.name ?? "repo"}-worktree`,
            hint: msg().worktree.pathHint,
          },
          {
            name: "open",
            label: msg().worktree.open,
            type: "checkbox",
            value: true,
          },
        ],
        submitLabel: msg().worktree.add,
      });
      if (!res) return;
      const isNew = res.mode === "new";
      const path = String(res.path).trim();
      const ok = await s.run(msg().run.worktreeAdd, () =>
        api.worktreeAdd(
          dir,
          path,
          String(res.branch).trim(),
          isNew,
          isNew ? String(res.base ?? "") : undefined,
        ),
      );
      if (ok && res.open) await s.openRepo(path);
    };

    const worktreeRemove = async (wt: WorktreeInfo) => {
      const ok = await dialogs.confirm({
        title: msg().worktree.removeTitle,
        message: msg().worktree.removeMessage(wt.path),
        confirmLabel: msg().common.delete,
        danger: true,
      });
      if (!ok) return;
      const done = await s.run(
        msg().run.worktreeRemove,
        () => api.worktreeRemove(dir, wt.path, false),
        {
          successDetail: false,
        },
      );
      if (!done) {
        const force = await dialogs.confirm({
          title: msg().common.forceDeleteTitle,
          message: msg().worktree.forceMessage(wt.path),
          confirmLabel: msg().common.forceDelete,
          danger: true,
        });
        if (force)
          await s.run(msg().run.worktreeForceRemove, () => api.worktreeRemove(dir, wt.path, true));
      }
    };

    const worktreePrune = () => s.run(msg().run.worktreePrune, () => api.worktreePrune(dir));

    // ---------------------------------------------------------- 6.5. tidy
    /**
     * `my git tidy` 相当。origin を fetch --prune してから、マージ済みのブランチと
     * worktree を判定してダイアログに出す。消すのはダイアログで選んだものだけ。
     */
    const tidy = async () => {
      const got: { plan?: TidyPlan } = {};
      const ok = await s.run(
        msg().run.tidyPlan,
        async () => {
          got.plan = await api.tidyPlan(dir);
          return "";
        },
        { silentSuccess: true },
      );
      if (ok && got.plan) s.setTidy({ dir, plan: got.plan });
    };

    const tidyLabel = (r: Pick<TidyResult, "kind" | "target">) =>
      r.kind === "fastForward"
        ? msg().tidyResult.fastForward(r.target)
        : r.kind === "branch"
          ? msg().tidyResult.branch(r.target)
          : msg().tidyResult.worktree(r.target);

    const tidyApply = async (target: string, items: TidyItem[]) => {
      s.setTidy(null);
      if (!items.length) return;
      await s.run(msg().run.tidyApply(items.length), async () => {
        const results = await api.tidyApply(
          target,
          items.map(({ kind, target, sha }) => ({ kind, target, sha })),
        );
        const lines = results.map((r) =>
          r.ok ? `✓ ${tidyLabel(r)}` : `✗ ${tidyLabel(r)}: ${r.message}`,
        );
        if (results.some((r) => !r.ok)) throw lines.join("\n");
        return lines.join("\n");
      });
    };

    // ---------------------------------------------------------- 6.6. recompose
    /** recompose / compose のダイアログを開く。ブランチの既定はチェックアウト中のもの */
    const recompose = (branch?: string) => {
      const target = branch ?? s.repo?.headBranch;
      if (target) s.setRecompose({ dir, branch: target });
    };

    const recomposeApply = async (target: string, mode: RecomposeMode, op: RecomposeOp) => {
      s.setRecompose(null);
      await s.run(
        mode === "compose" ? msg().run.compose(op.newBranch) : msg().run.recompose(op.newBranch),
        () => api.recomposeApply(target, op),
      );
    };

    // ---------------------------------------------------------- 7.5. remote
    /**
     * リモート未設定のリポジトリに GitHub の新規リポジトリを作って origin に登録する。
     * gh repo create --source が前提なので、既にリモートがある場合は何もしない。
     */
    const remoteCreate = async () => {
      if (!s.repo) return;
      if (s.repo.remotes.length > 0) {
        s.toast({
          kind: "info",
          title: msg().remote.alreadySet,
          detail: s.repo.remotes.join(", "),
        });
        return;
      }
      if (!s.gh?.installed) {
        s.toast({
          kind: "error",
          title: msg().common.ghMissing,
          detail: msg().common.ghMissingDetail,
        });
        return;
      }
      if (!s.gh.authenticated) {
        s.toast({
          kind: "error",
          title: msg().common.ghUnauthenticated,
          detail: msg().common.ghUnauthenticatedDetail,
        });
        return;
      }

      // オーナー候補 (自分 + 所属 org)。read:org が無いと自分だけになる。
      const fetched = await api.ghOwners(dir).catch(() => [] as string[]);
      const owners = fetched.length ? fetched : s.gh.login ? [s.gh.login] : [];
      /** 空リポジトリはプッシュするものが無い */
      const hasCommits = Boolean(s.repo.headHash);

      const ownerField: FormField[] = owners.length
        ? [
            {
              name: "owner",
              label: msg().remote.owner,
              type: "select",
              value: owners[0],
              options: owners.map((o) => ({ value: o, label: o })),
            },
          ]
        : [];
      const fields: FormField[] = [
        ...ownerField,
        {
          name: "name",
          label: msg().remote.repoName,
          type: "text",
          required: true,
          mono: true,
          value: s.repo.name,
        },
        {
          name: "visibility",
          label: msg().remote.visibility,
          type: "select",
          value: "private",
          options: [
            { value: "private", label: msg().remote.private },
            { value: "public", label: msg().remote.public },
            { value: "internal", label: msg().remote.internal },
          ],
        },
        { name: "description", label: msg().remote.description, type: "text" },
        {
          name: "push",
          label: msg().remote.pushAfter,
          type: "checkbox",
          value: hasCommits,
          hint: hasCommits ? undefined : msg().remote.noCommits,
        },
      ];

      const res = await dialogs.form({
        title: msg().remote.title,
        description: msg().remote.formDescription,
        width: 560,
        fields,
        submitLabel: msg().common.create,
      });
      if (!res) return;

      const owner = String(res.owner ?? "").trim();
      const name = String(res.name).trim();
      const full = owner ? `${owner}/${name}` : name;
      await s.run(msg().run.ghRepoCreate, () =>
        api.ghRepoCreate(dir, {
          name: full,
          visibility: String(res.visibility ?? "private"),
          description: String(res.description ?? ""),
          remote: "origin",
          push: hasCommits && Boolean(res.push),
        }),
      );
    };

    // ---------------------------------------------------------- 8. pull request
    /** `ai` なら作成ダイアログを開いた直後に Claude Code でタイトルと本文を生成する */
    const prCreate = async (opts: { ai?: boolean } = {}) => {
      const head = s.headBranch;
      if (!head) {
        s.toast({
          kind: "error",
          title: msg().pr.detached,
        });
        return;
      }
      if (!s.gh?.installed) {
        s.toast({
          kind: "error",
          title: msg().common.ghMissing,
          detail: msg().common.ghMissingDetail,
        });
        return;
      }
      if (!s.gh.authenticated) {
        s.toast({
          kind: "error",
          title: msg().common.ghUnauthenticated,
          detail: msg().common.ghUnauthenticatedDetail,
        });
        return;
      }
      if (!head.upstream) {
        const ok = await dialogs.confirm({
          title: msg().pr.pushTitle,
          message: msg().pr.pushMessage(head.name),
          confirmLabel: msg().common.pushAndContinue,
        });
        if (!ok) return;
        const pushed = await s.run(msg().run.push, () =>
          api.push(dir, {
            remote: s.repo?.remotes[0] ?? "origin",
            branch: head.name,
            setUpstream: true,
          }),
        );
        if (!pushed) return;
      } else if (head.ahead > 0) {
        const ok = await dialogs.confirm({
          title: msg().pr.unpushedTitle,
          message: msg().pr.unpushedMessage(head.name, head.ahead),
          confirmLabel: msg().common.pushAndContinue,
        });
        if (ok) {
          const pushed = await s.run(msg().run.push, () =>
            api.push(dir, {
              remote: s.repo?.remotes[0] ?? "origin",
              branch: head.name,
            }),
          );
          if (!pushed) return;
        }
      }

      const [template, lastMessage] = await Promise.all([
        api.prTemplate(dir).catch(() => null),
        api.lastCommitMessage(dir).catch(() => ""),
      ]);
      const lines = (lastMessage ?? "").split("\n");
      const defaultTitle = lines[0] ?? head.name;
      const defaultBody = template ?? lines.slice(1).join("\n").trim();
      const baseOptions = [
        ...new Set(
          [
            s.gh.defaultBranch ?? "",
            ...s.branches
              .filter((b) => b.kind === "remote")
              .map((b) => b.name.split("/").slice(1).join("/")),
          ].filter(Boolean),
        ),
      ].map((v) => ({ value: v, label: v }));

      const res = await dialogs.form({
        title: msg().pr.createTitle,
        description: `${s.gh.repo ?? ""} — ${head.name} → ${s.gh.defaultBranch ?? "base"}`,
        width: 640,
        action: {
          label: msg().common.aiGenerate,
          busyLabel: msg().common.aiGenerating,
          icon: "sparkle",
          title: template ? msg().pr.aiTitleTemplate : msg().pr.aiTitle,
          autoRun: opts.ai,
          run: async (values) => {
            try {
              const ctx = await api.prContext(dir, {
                remote: s.repo?.remotes[0] ?? "origin",
                base: String(values.base || s.gh?.defaultBranch || ""),
                head: head.name,
              });
              if (!ctx.diff.trim()) {
                s.toast({
                  kind: "info",
                  title: msg().pr.noDiff,
                });
                return;
              }
              return await generatePrDescription(s.aiCliModel, ctx);
            } catch (e) {
              s.toast({
                kind: "error",
                title: msg().pr.aiFailed,
                detail: String(e),
              });
            }
          },
        },
        fields: [
          {
            name: "title",
            label: msg().pr.title,
            type: "text",
            required: true,
            value: defaultTitle,
          },
          {
            name: "body",
            label: msg().pr.body,
            type: "textarea",
            rows: 10,
            markdown: true,
            value: defaultBody,
          },
          {
            name: "base",
            label: msg().pr.base,
            type: "select",
            value: s.gh.defaultBranch ?? baseOptions[0]?.value ?? "",
            options: baseOptions,
          },
          {
            name: "draft",
            label: msg().pr.draft,
            type: "checkbox",
            value: false,
          },
        ],
        submitLabel: msg().common.create,
      });
      if (!res) return;

      s.toast({ kind: "info", title: msg().pr.creating });
      try {
        const out = await api.prCreate(dir, {
          title: String(res.title),
          body: String(res.body ?? ""),
          base: String(res.base ?? ""),
          head: head.name,
          draft: Boolean(res.draft),
          web: false,
        });
        const url = out.match(/https?:\/\/\S+/)?.[0];
        s.toast({
          kind: "success",
          title: msg().pr.created,
          detail: url ?? out,
        });
        await s.refresh({ silent: true });
        await s.refreshPrs();
        if (url) await openUrl(url).catch(() => undefined);
      } catch (e) {
        s.toast({
          kind: "error",
          title: msg().pr.createFailed,
          detail: String(e),
        });
      }
    };

    const prCheckout = (pr: PullRequest) =>
      s.run(msg().run.prCheckout(pr.number), () => api.prCheckout(dir, pr.number));

    const prOpen = (pr: PullRequest) => openUrl(pr.url).catch(() => undefined);

    /** 既定のブラウザで URL を開く (GitHub リンク用) */
    const webOpen = (url: string) => openUrl(url).catch(() => undefined);

    const prMerge = async (pr: PullRequest) => {
      const res = await dialogs.form({
        title: msg().pr.mergeTitle(pr.number),
        description: pr.title,
        fields: [
          {
            name: "method",
            label: msg().pr.mergeMethod,
            type: "select",
            value: "squash",
            options: [
              { value: "squash", label: msg().pr.squash },
              { value: "merge", label: msg().pr.mergeCommit },
              { value: "rebase", label: msg().pr.rebase },
            ],
          },
          {
            name: "deleteBranch",
            label: msg().pr.deleteBranch,
            type: "checkbox",
            value: true,
          },
        ],
        submitLabel: msg().pr.merge,
        danger: true,
      });
      if (!res) return;
      const ok = await s.run(msg().run.prMerge(pr.number), () =>
        api.prMerge(dir, pr.number, String(res.method), Boolean(res.deleteBranch)),
      );
      if (ok) await s.refreshPrs();
    };

    return {
      openFolder,
      checkout,
      checkoutRemote,
      createBranch,
      deleteBranch,
      deleteTag,
      stashPush,
      stashApply,
      stashRename,
      stashDrop,
      fetch,
      pull,
      pullBranch,
      stage,
      stageAll,
      unstage,
      unstageAll,
      discard,
      commit,
      commitPrompt,
      push,
      forcePush,
      worktreeAdd,
      worktreeRemove,
      worktreePrune,
      tidy,
      tidyApply,
      recompose,
      recomposeApply,
      remoteCreate,
      prCreate,
      prCheckout,
      prOpen,
      prMerge,
      webOpen,
    };
  }, [s, dialogs]);
}

export type Actions = ReturnType<typeof useActions>;
