import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { generatePrDescription } from "../lib/ai";
import { api } from "../lib/api";
import { useDialogs } from "../components/ui-context";
import { useStore } from "./store";
import type { FormField } from "../components/ui";
import type {
  BranchInfo,
  PullRequest,
  StashInfo,
  TidyItem,
  TidyPlan,
  TidyResult,
  WorktreeInfo,
} from "../lib/types";

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
      s.run(`${label} をチェックアウト`, () => api.checkout(dir, target), { successDetail: false });

    const checkoutRemote = (remoteBranch: string) =>
      s.run(`${remoteBranch} をチェックアウト`, () => api.checkoutRemote(dir, remoteBranch), {
        successDetail: false,
      });

    const createBranch = async (startPoint?: string) => {
      const res = await dialogs.form({
        title: "ブランチを作成",
        description: startPoint ? `分岐元: ${startPoint}` : undefined,
        fields: [
          {
            name: "name",
            label: "ブランチ名",
            type: "text",
            required: true,
            mono: true,
            placeholder: "feature/awesome",
          },
          { name: "checkout", label: "作成後にチェックアウトする", type: "checkbox", value: true },
        ],
        submitLabel: "作成",
      });
      if (!res) return;
      await s.run(
        `ブランチ ${res.name} を作成`,
        () => api.createBranch(dir, String(res.name).trim(), startPoint, Boolean(res.checkout)),
        { successDetail: false },
      );
    };

    const deleteBranch = async (b: BranchInfo) => {
      if (b.kind === "remote") {
        const ok = await dialogs.confirm({
          title: "リモートブランチを削除",
          message: `${b.name} をリモートから削除します。元に戻せません。`,
          confirmLabel: "削除",
          danger: true,
        });
        if (!ok) return;
        await s.run(`${b.name} を削除`, () => api.deleteRemoteBranch(dir, b.name));
        return;
      }
      const ok = await dialogs.confirm({
        title: "ブランチを削除",
        message: `ローカルブランチ ${b.name} を削除します。`,
        confirmLabel: "削除",
        danger: true,
      });
      if (!ok) return;
      const done = await s.run(`${b.name} を削除`, () => api.deleteBranch(dir, b.name, false), {
        successDetail: false,
      });
      if (!done) {
        const force = await dialogs.confirm({
          title: "強制削除しますか?",
          message: `${b.name} は未マージのコミットを含んでいる可能性があります。-D で強制削除します。`,
          confirmLabel: "強制削除",
          danger: true,
        });
        if (force) await s.run(`${b.name} を強制削除`, () => api.deleteBranch(dir, b.name, true));
      }
    };

    const deleteTag = async (name: string) => {
      const remote = s.repo?.remotes[0];
      const res = await dialogs.form({
        title: "タグを削除",
        description: `タグ ${name} を削除します。`,
        fields: remote
          ? [
              {
                name: "remote",
                label: `リモート (${remote}) からも削除する`,
                type: "checkbox",
                value: false,
              },
            ]
          : [],
        submitLabel: "削除",
        danger: true,
      });
      if (!res) return;
      const done = await s.run(`タグ ${name} を削除`, () => api.deleteTag(dir, name), {
        successDetail: false,
      });
      if (done && remote && res.remote) {
        await s.run(`タグ ${name} を ${remote} から削除`, () =>
          api.deleteRemoteTag(dir, remote, name),
        );
      }
    };

    // ---------------------------------------------------------- 2. stash
    const stashPush = async () => {
      if (!s.dirty) {
        s.toast({ kind: "info", title: "スタッシュする変更がありません" });
        return;
      }
      const res = await dialogs.form({
        title: "変更をスタッシュ",
        fields: [
          {
            name: "message",
            label: "メッセージ (任意)",
            type: "text",
            placeholder: "作業中の変更",
          },
          { name: "untracked", label: "未追跡ファイルも含める", type: "checkbox", value: true },
          {
            name: "keepIndex",
            label: "ステージした変更は残す (--keep-index)",
            type: "checkbox",
            value: false,
          },
        ],
        submitLabel: "スタッシュ",
      });
      if (!res) return;
      await s.run("スタッシュ", () =>
        api.stashPush(
          dir,
          String(res.message ?? ""),
          Boolean(res.untracked),
          Boolean(res.keepIndex),
        ),
      );
    };

    const stashApply = (st: StashInfo, pop: boolean) =>
      s.run(`${st.name} を${pop ? "ポップ" : "適用"}`, () => api.stashApply(dir, st.name, pop));

    const stashDrop = async (st: StashInfo) => {
      const ok = await dialogs.confirm({
        title: "スタッシュを破棄",
        message: `${st.name} (${st.message}) を削除します。元に戻せません。`,
        confirmLabel: "破棄",
        danger: true,
      });
      if (ok) await s.run(`${st.name} を破棄`, () => api.stashDrop(dir, st.name));
    };

    // ---------------------------------------------------------- 3. pull / fetch
    const fetch = () => s.run("フェッチ", () => api.fetch(dir, true), { silentSuccess: true });

    const pull = async (rebase = false) => {
      await s.run(rebase ? "リベースして pull" : "プル", () => api.pull(dir, rebase, s.dirty));
    };

    /**
     * ブランチ一覧から pull する。
     * HEAD なら通常の pull、それ以外は checkout せずに upstream へ早送りする。
     */
    const pullBranch = async (b: BranchInfo, rebase = false) => {
      if (b.isHead) return pull(rebase);
      await s.run(`${b.name} を ${b.upstream} に早送り`, () => api.fastForward(dir, b.name));
    };

    // ---------------------------------------------------------- 4-5. add / commit
    const stage = (paths: string[]) =>
      s.run("ステージ", () => api.stage(dir, paths), { silentSuccess: true });
    const stageAll = () =>
      s.run("すべてステージ", () => api.stageAll(dir), { silentSuccess: true });
    const unstage = (paths: string[]) =>
      s.run("アンステージ", () => api.unstage(dir, paths), { silentSuccess: true });
    const unstageAll = () =>
      s.run("すべてアンステージ", () => api.unstageAll(dir), { silentSuccess: true });

    const discard = async (paths: string[]) => {
      const ok = await dialogs.confirm({
        title: "変更を破棄",
        message:
          paths.length === 1
            ? `${paths[0]} の変更を破棄します。元に戻せません。`
            : `${paths.length} 件のファイルの変更を破棄します。元に戻せません。`,
        confirmLabel: "破棄",
        danger: true,
      });
      if (ok) await s.run("変更を破棄", () => api.discard(dir, paths), { successDetail: false });
    };

    const commit = async (message: string, amend: boolean) => {
      const staged = s.status?.staged.length ?? 0;
      if (staged === 0 && !amend) {
        await api.stageAll(dir).catch(() => undefined);
      }
      return s.run(amend ? "コミットを修正" : "コミット", () => api.commit(dir, message, amend), {
        successDetail: false,
      });
    };

    // ---------------------------------------------------------- 6. push
    const push = async (opts: { force?: boolean } = {}) => {
      const head = s.headBranch;
      if (!head) {
        s.toast({ kind: "error", title: "detached HEAD のためプッシュできません" });
        return;
      }
      const remote = s.repo?.remotes[0] ?? "origin";
      if (!head.upstream) {
        const ok = await dialogs.confirm({
          title: "上流ブランチを設定してプッシュ",
          message: `${head.name} の上流が未設定です。${remote} に -u 付きでプッシュします。`,
          confirmLabel: "プッシュ",
        });
        if (!ok) return;
        await s.run("プッシュ", () =>
          api.push(dir, { remote, branch: head.name, setUpstream: true }),
        );
        return;
      }
      if (head.behind > 0 && !opts.force) {
        const res = await dialogs.form({
          title: "リモートに新しいコミットがあります",
          description: `${head.name} は ${head.behind} コミット遅れています。どうしますか?`,
          fields: [
            {
              name: "how",
              label: "操作",
              type: "select",
              value: "pull",
              options: [
                { value: "pull", label: "先に pull してからプッシュ" },
                { value: "force", label: "強制プッシュ (--force-with-lease)" },
              ],
            },
          ],
          submitLabel: "続行",
        });
        if (!res) return;
        if (res.how === "pull") {
          const ok = await s.run("プル", () => api.pull(dir, false, s.dirty));
          if (!ok) return;
          await s.run("プッシュ", () => api.push(dir, { remote, branch: head.name }));
          return;
        }
        await s.run("強制プッシュ", () =>
          api.push(dir, { remote, branch: head.name, forceWithLease: true }),
        );
        return;
      }
      await s.run("プッシュ", () =>
        api.push(dir, { remote, branch: head.name, forceWithLease: opts.force }),
      );
    };

    const forcePush = async () => {
      const head = s.headBranch;
      const ok = await dialogs.confirm({
        title: "強制プッシュ",
        message: `${head?.name ?? "HEAD"} を --force-with-lease でプッシュします。リモートの履歴が書き換わります。`,
        confirmLabel: "強制プッシュ",
        danger: true,
      });
      if (ok) await push({ force: true });
    };

    // ---------------------------------------------------------- 7. worktree
    const worktreeAdd = async () => {
      const home = await api.homeDir().catch(() => "");
      const parent = s.repo ? s.repo.root.slice(0, s.repo.root.lastIndexOf("/")) : home;
      const res = await dialogs.form({
        title: "worktree を追加",
        description:
          "別ディレクトリに作業ツリーを作り、同じリポジトリの別ブランチを並行して扱えます。",
        width: 560,
        fields: [
          {
            name: "mode",
            label: "ブランチ",
            type: "select",
            value: "new",
            options: [
              { value: "new", label: "新しいブランチを作成する" },
              { value: "existing", label: "既存のブランチを使う" },
            ],
          },
          {
            name: "branch",
            label: "ブランチ名",
            type: "text",
            required: true,
            mono: true,
            placeholder: "feature/awesome",
          },
          {
            name: "base",
            label: "分岐元 (新規作成時)",
            type: "select",
            value: s.repo?.headBranch ?? "",
            options: localBranchOptions(),
          },
          {
            name: "path",
            label: "作成先ディレクトリ",
            type: "dirpath",
            required: true,
            value: `${parent}/${s.repo?.name ?? "repo"}-worktree`,
            hint: "存在しないパスを指定してください",
          },
          { name: "open", label: "作成後にこの worktree を開く", type: "checkbox", value: true },
        ],
        submitLabel: "追加",
      });
      if (!res) return;
      const isNew = res.mode === "new";
      const path = String(res.path).trim();
      const ok = await s.run("worktree を追加", () =>
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
        title: "worktree を削除",
        message: `${wt.path} を削除します。未コミットの変更がある場合は強制削除が必要です。`,
        confirmLabel: "削除",
        danger: true,
      });
      if (!ok) return;
      const done = await s.run("worktree を削除", () => api.worktreeRemove(dir, wt.path, false), {
        successDetail: false,
      });
      if (!done) {
        const force = await dialogs.confirm({
          title: "強制削除しますか?",
          message: `${wt.path} に未コミットの変更が残っています。--force で削除します。`,
          confirmLabel: "強制削除",
          danger: true,
        });
        if (force) await s.run("worktree を強制削除", () => api.worktreeRemove(dir, wt.path, true));
      }
    };

    const worktreePrune = () => s.run("worktree を整理", () => api.worktreePrune(dir));

    // ---------------------------------------------------------- 6.5. tidy
    /**
     * `my git tidy` 相当。origin を fetch --prune してから、マージ済みのブランチと
     * worktree を判定してダイアログに出す。消すのはダイアログで選んだものだけ。
     */
    const tidy = async () => {
      const got: { plan?: TidyPlan } = {};
      const ok = await s.run(
        "整理対象を確認",
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
        ? `${r.target} を早送り`
        : r.kind === "branch"
          ? `ブランチ ${r.target}`
          : `worktree ${r.target}`;

    const tidyApply = async (target: string, items: TidyItem[]) => {
      s.setTidy(null);
      if (!items.length) return;
      await s.run(`${items.length} 件を整理`, async () => {
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
          title: "リモートは設定済みです",
          detail: s.repo.remotes.join(", "),
        });
        return;
      }
      if (!s.gh?.installed) {
        s.toast({
          kind: "error",
          title: "gh CLI が見つかりません",
          detail: "brew install gh でインストールしてください",
        });
        return;
      }
      if (!s.gh.authenticated) {
        s.toast({
          kind: "error",
          title: "gh CLI が未認証です",
          detail: "gh auth login を実行してください",
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
              label: "オーナー",
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
          label: "リポジトリ名",
          type: "text",
          required: true,
          mono: true,
          value: s.repo.name,
        },
        {
          name: "visibility",
          label: "公開範囲",
          type: "select",
          value: "private",
          options: [
            { value: "private", label: "Private" },
            { value: "public", label: "Public" },
            { value: "internal", label: "Internal (org のみ)" },
          ],
        },
        { name: "description", label: "説明 (任意)", type: "text" },
        {
          name: "push",
          label: "作成後に現在のブランチをプッシュする",
          type: "checkbox",
          value: hasCommits,
          hint: hasCommits ? undefined : "コミットが無いためプッシュできません",
        },
      ];

      const res = await dialogs.form({
        title: "GitHub にリポジトリを作成",
        description: "作成した GitHub リポジトリを origin として登録します。",
        width: 560,
        fields,
        submitLabel: "作成",
      });
      if (!res) return;

      const owner = String(res.owner ?? "").trim();
      const name = String(res.name).trim();
      const full = owner ? `${owner}/${name}` : name;
      await s.run("GitHub リポジトリを作成", () =>
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
    const prCreate = async () => {
      const head = s.headBranch;
      if (!head) {
        s.toast({ kind: "error", title: "detached HEAD では PR を作成できません" });
        return;
      }
      if (!s.gh?.installed) {
        s.toast({
          kind: "error",
          title: "gh CLI が見つかりません",
          detail: "brew install gh でインストールしてください",
        });
        return;
      }
      if (!s.gh.authenticated) {
        s.toast({
          kind: "error",
          title: "gh CLI が未認証です",
          detail: "gh auth login を実行してください",
        });
        return;
      }
      if (!head.upstream) {
        const ok = await dialogs.confirm({
          title: "ブランチをプッシュします",
          message: `${head.name} はまだリモートにありません。先に push -u してから PR を作成します。`,
          confirmLabel: "プッシュして続行",
        });
        if (!ok) return;
        const pushed = await s.run("プッシュ", () =>
          api.push(dir, {
            remote: s.repo?.remotes[0] ?? "origin",
            branch: head.name,
            setUpstream: true,
          }),
        );
        if (!pushed) return;
      } else if (head.ahead > 0) {
        const ok = await dialogs.confirm({
          title: "未プッシュのコミットがあります",
          message: `${head.name} に ${head.ahead} 件の未プッシュコミットがあります。先にプッシュしますか?`,
          confirmLabel: "プッシュして続行",
        });
        if (ok) {
          const pushed = await s.run("プッシュ", () =>
            api.push(dir, { remote: s.repo?.remotes[0] ?? "origin", branch: head.name }),
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
        title: "プルリクエストを作成",
        description: `${s.gh.repo ?? ""} — ${head.name} → ${s.gh.defaultBranch ?? "base"}`,
        width: 640,
        action: {
          label: "AI で生成",
          busyLabel: "生成中…",
          icon: "sparkle",
          title: template
            ? "PR テンプレートに沿って、差分から Claude Code でタイトルと本文を生成"
            : "差分とコミットから Claude Code でタイトルと本文を生成",
          run: async (values) => {
            try {
              const ctx = await api.prContext(dir, {
                remote: s.repo?.remotes[0] ?? "origin",
                base: String(values.base || s.gh?.defaultBranch || ""),
                head: head.name,
              });
              if (!ctx.diff.trim()) {
                s.toast({ kind: "info", title: "マージ先との差分がありません" });
                return;
              }
              return await generatePrDescription(s.aiCliModel, ctx);
            } catch (e) {
              s.toast({
                kind: "error",
                title: "PR の説明を生成できませんでした",
                detail: String(e),
              });
            }
          },
        },
        fields: [
          { name: "title", label: "タイトル", type: "text", required: true, value: defaultTitle },
          { name: "body", label: "本文", type: "textarea", rows: 10, value: defaultBody },
          {
            name: "base",
            label: "マージ先 (base)",
            type: "select",
            value: s.gh.defaultBranch ?? baseOptions[0]?.value ?? "",
            options: baseOptions,
          },
          { name: "draft", label: "ドラフトとして作成", type: "checkbox", value: false },
        ],
        submitLabel: "作成",
      });
      if (!res) return;

      s.toast({ kind: "info", title: "PR を作成しています..." });
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
        s.toast({ kind: "success", title: "PR を作成しました", detail: url ?? out });
        await s.refresh({ silent: true });
        await s.refreshPrs();
        if (url) await openUrl(url).catch(() => undefined);
      } catch (e) {
        s.toast({ kind: "error", title: "PR の作成に失敗しました", detail: String(e) });
      }
    };

    const prCheckout = (pr: PullRequest) =>
      s.run(`PR #${pr.number} をチェックアウト`, () => api.prCheckout(dir, pr.number));

    const prOpen = (pr: PullRequest) => openUrl(pr.url).catch(() => undefined);

    /** 既定のブラウザで URL を開く (GitHub リンク用) */
    const webOpen = (url: string) => openUrl(url).catch(() => undefined);

    const prMerge = async (pr: PullRequest) => {
      const res = await dialogs.form({
        title: `PR #${pr.number} をマージ`,
        description: pr.title,
        fields: [
          {
            name: "method",
            label: "マージ方法",
            type: "select",
            value: "squash",
            options: [
              { value: "squash", label: "Squash and merge" },
              { value: "merge", label: "Create a merge commit" },
              { value: "rebase", label: "Rebase and merge" },
            ],
          },
          {
            name: "deleteBranch",
            label: "マージ後にブランチを削除",
            type: "checkbox",
            value: true,
          },
        ],
        submitLabel: "マージ",
        danger: true,
      });
      if (!res) return;
      const ok = await s.run(`PR #${pr.number} をマージ`, () =>
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
      push,
      forcePush,
      worktreeAdd,
      worktreeRemove,
      worktreePrune,
      tidy,
      tidyApply,
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
