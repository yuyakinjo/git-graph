import { useMemo, useState, type ReactNode } from "react";
import { relativeTime } from "../lib/format";
import type { BranchInfo, PullRequest } from "../lib/types";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { checkDot, dim, iconBtn, miniPill } from "./classes";
import { Icon, useMenu, type MenuItem } from "./ui";

const SIDE_HEADER =
  "group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-[10.5px] font-bold tracking-[0.06em] text-fg-dim uppercase select-none hover:text-fg";

const SIDE_ITEM = "flex h-[26px] cursor-default items-center gap-1.5 py-0 pr-2 pl-3.5 select-none";
/** 選択中の行。ホバーの上書きが効かないよう、状態ごとに背景を出し分ける */
const SIDE_ITEM_CURRENT = `${SIDE_ITEM} bg-accent-soft`;
const SIDE_ITEM_PLAIN = `${SIDE_ITEM} hover:bg-bg-hover`;

const sideIcon = (current = false) => `flex flex-none ${current ? "text-accent" : "text-fg-faint"}`;
const sideLabel = (current = false) =>
  `flex-1 overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap ${
    current ? "font-bold text-white" : ""
  }`;

const SIDE_NOTE = "pt-1 pr-3.5 pb-2 pl-3.5 text-[11.5px] text-fg-faint";

const OPEN_KEY = "gitgraph.sections";
/** 件数が多くなりがちなセクションは初期状態を閉じておく */
const DEFAULT_CLOSED = new Set(["tag"]);

function useSections() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const toggle = (k: string) =>
    setOpen((prev) => {
      const cur = prev[k] ?? !DEFAULT_CLOSED.has(k);
      const next = { ...prev, [k]: !cur };
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      return next;
    });
  const isOpen = (k: string) => open[k] ?? !DEFAULT_CLOSED.has(k);
  return { isOpen, toggle };
}

function Section({
  id,
  title,
  icon,
  count,
  children,
  action,
  isOpen,
  toggle,
}: {
  id: string;
  title: string;
  icon: string;
  count?: number;
  children: ReactNode;
  action?: ReactNode;
  isOpen: (k: string) => boolean;
  toggle: (k: string) => void;
}) {
  const open = isOpen(id);
  return (
    <section className={`flex flex-col first:mt-auto ${open ? "min-h-7 flex-1" : "shrink-0"}`}>
      <header className={SIDE_HEADER} onClick={() => toggle(id)}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
        <Icon name={icon} size={13} />
        <span className="flex-1 overflow-hidden text-ellipsis">{title}</span>
        {count !== undefined ? <span className="text-[10px] text-fg-faint">{count}</span> : null}
        <span
          className="flex opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {action}
        </span>
      </header>
      {open ? <div className="min-h-0 overflow-y-auto pb-1.5">{children}</div> : null}
    </section>
  );
}

function BranchItem({ b }: { b: BranchInfo }) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const last = b.name.split("/").slice(-1)[0];
  const prefix = b.name.slice(0, b.name.length - last.length);

  /** upstream に追いついていないローカルブランチだけ pull を出す */
  const behind = b.kind === "local" && b.upstream ? b.behind : 0;
  /** HEAD 以外は fast-forward しかできないので、分岐していたら諦めてもらう */
  const diverged = !b.isHead && b.ahead > 0;
  const pullItems: MenuItem[] = !behind
    ? []
    : [
        {
          label: b.isHead
            ? `プル (↓${behind})`
            : diverged
              ? `早送りできません (↑${b.ahead} ↓${behind})`
              : `upstream へ早送り (↓${behind})`,
          icon: "pull",
          disabled: diverged,
          onClick: () => act.pullBranch(b),
        },
        ...(b.isHead
          ? [{ label: "リベースして pull", icon: "pull", onClick: () => act.pullBranch(b, true) }]
          : []),
        { separator: true },
      ];

  const menu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e, [
      ...pullItems,
      {
        label: "チェックアウト",
        icon: "branch",
        disabled: b.isHead,
        onClick: () => (b.kind === "remote" ? act.checkoutRemote(b.name) : act.checkout(b.name)),
      },
      { label: "ここからブランチを作成", icon: "plus", onClick: () => act.createBranch(b.name) },
      {
        label: "worktree を追加",
        icon: "worktree",
        onClick: () => act.worktreeAdd(),
      },
      { separator: true },
      {
        label: "名前をコピー",
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(b.name).catch(() => undefined),
      },
      {
        label: b.kind === "remote" ? "リモートブランチを削除" : "ブランチを削除",
        icon: "trash",
        danger: true,
        disabled: b.isHead,
        onClick: () => act.deleteBranch(b),
      },
    ]);
  };

  return (
    <div
      className={b.isHead ? SIDE_ITEM_CURRENT : SIDE_ITEM_PLAIN}
      title={`${b.name}${b.upstream ? ` → ${b.upstream}` : ""}\n${b.subject}`}
      onClick={() => s.select({ kind: "commit", sha: b.hash })}
      onDoubleClick={() =>
        b.kind === "remote" ? act.checkoutRemote(b.name) : act.checkout(b.name)
      }
      onContextMenu={menu}
    >
      <span className={sideIcon(b.isHead)}>
        <Icon name={b.kind === "remote" ? "remote" : "branch"} size={13} />
      </span>
      <span className={sideLabel(b.isHead)}>
        {prefix ? <em className={dim}>{prefix}</em> : null}
        {last}
      </span>
      {b.worktreePath && !b.isHead ? (
        <span className={miniPill()} title={`worktree: ${b.worktreePath}`}>
          <Icon name="worktree" size={10} />
        </span>
      ) : null}
      {b.gone ? <span className={miniPill("warn")}>gone</span> : null}
      {b.ahead ? <span className={miniPill("ahead")}>↑{b.ahead}</span> : null}
      {b.behind ? <span className={miniPill("behind")}>↓{b.behind}</span> : null}
    </div>
  );
}

function PrItem({ pr, onOpen }: { pr: PullRequest; onOpen: (pr: PullRequest) => void }) {
  const act = useActions();
  const openMenu = useMenu();
  const checks = pr.statusCheckRollup ?? [];
  const failed = checks.some((c) => c.conclusion === "FAILURE" || c.state === "FAILURE");
  const pending = checks.some(
    (c) => c.status === "IN_PROGRESS" || c.status === "QUEUED" || c.state === "PENDING",
  );
  const dot = failed ? "fail" : pending ? "pending" : checks.length ? "pass" : "none";
  return (
    <div
      className={SIDE_ITEM_PLAIN}
      title={`#${pr.number} ${pr.title}\n${pr.headRefName} → ${pr.baseRefName}`}
      onClick={() => onOpen(pr)}
      onDoubleClick={() => act.prCheckout(pr)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, [
          { label: "詳細を表示", icon: "pr", onClick: () => onOpen(pr) },
          { label: "ブラウザで開く", icon: "external", onClick: () => act.prOpen(pr) },
          { label: "チェックアウト", icon: "branch", onClick: () => act.prCheckout(pr) },
          { separator: true },
          { label: "マージ", icon: "merge", danger: true, onClick: () => act.prMerge(pr) },
        ]);
      }}
    >
      <span className={sideIcon()}>
        <Icon name="pr" size={13} />
      </span>
      <span className={sideLabel()}>
        <em className={dim}>#{pr.number}</em> {pr.title}
      </span>
      {pr.isDraft ? <span className={miniPill()}>draft</span> : null}
      <span className={checkDot(dot)} />
    </div>
  );
}

export function Sidebar({ onOpenPr }: { onOpenPr: (pr: PullRequest) => void }) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const { isOpen, toggle } = useSections();

  const locals = useMemo(() => s.branches.filter((b) => b.kind === "local"), [s.branches]);
  const remotes = useMemo(() => s.branches.filter((b) => b.kind === "remote"), [s.branches]);

  return (
    <aside className="flex h-full flex-col overflow-y-auto bg-bg-2 pt-1.5 pb-5">
      <Section
        id="local"
        title="ローカル"
        icon="branch"
        count={locals.length}
        isOpen={isOpen}
        toggle={toggle}
        action={
          <button
            className={iconBtn({ tiny: true })}
            title="ブランチを作成"
            onClick={() => act.createBranch()}
          >
            <Icon name="plus" size={13} />
          </button>
        }
      >
        {locals.map((b) => (
          <BranchItem key={b.full} b={b} />
        ))}
      </Section>

      <Section
        id="remote"
        title="リモート"
        icon="remote"
        count={remotes.length}
        isOpen={isOpen}
        toggle={toggle}
        action={
          <button className={iconBtn({ tiny: true })} title="フェッチ" onClick={() => act.fetch()}>
            <Icon name="fetch" size={13} />
          </button>
        }
      >
        {remotes.map((b) => (
          <BranchItem key={b.full} b={b} />
        ))}
      </Section>

      <Section
        id="pr"
        title="プルリクエスト"
        icon="pr"
        count={s.prs.length}
        isOpen={isOpen}
        toggle={toggle}
        action={
          <button
            className={iconBtn({ tiny: true })}
            title="PR を作成"
            onClick={() => act.prCreate()}
          >
            <Icon name="plus" size={13} />
          </button>
        }
      >
        {!s.gh?.installed ? (
          <div className={SIDE_NOTE}>gh CLI が未インストールです</div>
        ) : !s.gh.authenticated ? (
          <div className={SIDE_NOTE}>gh auth login が必要です</div>
        ) : !s.gh.repo ? (
          <div className={SIDE_NOTE}>GitHub リポジトリではありません</div>
        ) : s.prs.length === 0 ? (
          <div className={SIDE_NOTE}>オープンな PR はありません</div>
        ) : (
          s.prs.map((pr) => <PrItem key={pr.number} pr={pr} onOpen={onOpenPr} />)
        )}
      </Section>

      <Section
        id="stash"
        title="スタッシュ"
        icon="stash"
        count={s.stashes.length}
        isOpen={isOpen}
        toggle={toggle}
        action={
          <button
            className={iconBtn({ tiny: true })}
            title="変更をスタッシュ"
            onClick={() => act.stashPush()}
          >
            <Icon name="plus" size={13} />
          </button>
        }
      >
        {s.stashes.length === 0 ? (
          <div className={SIDE_NOTE}>スタッシュはありません</div>
        ) : (
          s.stashes.map((st) => {
            const current = s.selection.kind === "stash" && s.selection.refname === st.name;
            return (
              <div
                key={st.name}
                className={current ? SIDE_ITEM_CURRENT : SIDE_ITEM_PLAIN}
                title={`${st.name}\n${st.message}`}
                onClick={() => s.select({ kind: "stash", refname: st.name, message: st.message })}
                onDoubleClick={() => act.stashApply(st, false)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e, [
                    {
                      label: "適用 (apply)",
                      icon: "check",
                      onClick: () => act.stashApply(st, false),
                    },
                    {
                      label: "ポップ (pop)",
                      icon: "stash",
                      onClick: () => act.stashApply(st, true),
                    },
                    { separator: true },
                    {
                      label: "破棄 (drop)",
                      icon: "trash",
                      danger: true,
                      onClick: () => act.stashDrop(st),
                    },
                  ]);
                }}
              >
                <span className={sideIcon(current)}>
                  <Icon name="stash" size={13} />
                </span>
                <span className={sideLabel(current)}>{st.message}</span>
                <span className="flex-none text-[10.5px] text-fg-faint">
                  {relativeTime(st.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </Section>

      <Section
        id="worktree"
        title="worktree"
        icon="worktree"
        count={s.worktrees.length}
        isOpen={isOpen}
        toggle={toggle}
        action={
          <button
            className={iconBtn({ tiny: true })}
            title="worktree を追加"
            onClick={() => act.worktreeAdd()}
          >
            <Icon name="plus" size={13} />
          </button>
        }
      >
        {s.worktrees.map((wt) => (
          <div
            key={wt.path}
            className={wt.isCurrent ? SIDE_ITEM_CURRENT : SIDE_ITEM_PLAIN}
            title={wt.path}
            onClick={() => !wt.isCurrent && s.openRepo(wt.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(e, [
                {
                  label: "この worktree を開く",
                  icon: "folder",
                  disabled: wt.isCurrent,
                  onClick: () => s.openRepo(wt.path),
                },
                {
                  label: "パスをコピー",
                  icon: "copy",
                  onClick: () => navigator.clipboard.writeText(wt.path).catch(() => undefined),
                },
                { separator: true },
                {
                  label: "worktree を削除",
                  icon: "trash",
                  danger: true,
                  disabled: wt.isMain || wt.isCurrent,
                  onClick: () => act.worktreeRemove(wt),
                },
              ]);
            }}
          >
            <span className={sideIcon(wt.isCurrent)}>
              <Icon name="worktree" size={13} />
            </span>
            <span className={sideLabel(wt.isCurrent)}>
              {wt.branch ?? wt.head.slice(0, 7)}
              {wt.isMain ? <em className={dim}> (main)</em> : null}
            </span>
            {wt.prunable ? <span className={miniPill("warn")}>prunable</span> : null}
          </div>
        ))}
        {s.worktrees.some((w) => w.prunable) ? (
          <button
            className={`${SIDE_NOTE} block w-full cursor-pointer border-0 bg-none text-left text-accent`}
            onClick={() => act.worktreePrune()}
          >
            使われていない worktree を整理する
          </button>
        ) : null}
      </Section>

      <Section
        id="tag"
        title="タグ"
        icon="tag"
        count={s.tags.length}
        isOpen={isOpen}
        toggle={toggle}
      >
        {s.tags.slice(0, 50).map((t) => (
          <div
            key={t.name}
            className={SIDE_ITEM_PLAIN}
            title={t.name}
            onClick={() => s.select({ kind: "commit", sha: t.hash })}
            onDoubleClick={() => act.checkout(t.name)}
          >
            <span className={sideIcon()}>
              <Icon name="tag" size={13} />
            </span>
            <span className={sideLabel()}>{t.name}</span>
          </div>
        ))}
        {s.tags.length === 0 ? <div className={SIDE_NOTE}>タグはありません</div> : null}
      </Section>
    </aside>
  );
}
