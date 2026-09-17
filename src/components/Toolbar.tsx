import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { Icon, Spinner, useMenu } from "./ui";

export function Toolbar() {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const head = s.headBranch;

  const pullMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: "プル (merge)", icon: "pull", onClick: () => act.pull(false) },
      { label: "プル (rebase)", icon: "pull", onClick: () => act.pull(true) },
      { separator: true },
      { label: "フェッチ (--prune)", icon: "fetch", onClick: () => act.fetch() },
    ]);

  const pushMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: "プッシュ", icon: "push", onClick: () => act.push() },
      {
        label: "強制プッシュ (--force-with-lease)",
        icon: "push",
        danger: true,
        onClick: () => act.forcePush(),
      },
    ]);

  const stashMenu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: "変更をスタッシュ", icon: "stash", onClick: () => act.stashPush() },
      {
        label: "最新のスタッシュをポップ",
        icon: "pull",
        disabled: s.stashes.length === 0,
        onClick: () => s.stashes[0] && act.stashApply(s.stashes[0], true),
      },
      {
        label: "最新のスタッシュを適用",
        icon: "check",
        disabled: s.stashes.length === 0,
        onClick: () => s.stashes[0] && act.stashApply(s.stashes[0], false),
      },
    ]);

  const disabled = !s.repo || Boolean(s.busy);

  return (
    <header className="toolbar">
      <div className="tool-group">
        <button className="tool" disabled={disabled} onClick={() => act.fetch()} title="git fetch --all --prune">
          <Icon name="fetch" />
          <span>フェッチ</span>
        </button>
        <div className="split">
          <button className="tool" disabled={disabled} onClick={() => act.pull(false)} title="git pull">
            <Icon name="pull" />
            <span>プル</span>
            {head?.behind ? <em className="tool-badge">{head.behind}</em> : null}
          </button>
          <button className="caret" disabled={disabled} onClick={pullMenu}>
            <Icon name="chevronDown" size={11} />
          </button>
        </div>
        <div className="split">
          <button className="tool" disabled={disabled} onClick={() => act.push()} title="git push">
            <Icon name="push" />
            <span>プッシュ</span>
            {head?.ahead ? <em className="tool-badge accent">{head.ahead}</em> : null}
          </button>
          <button className="caret" disabled={disabled} onClick={pushMenu}>
            <Icon name="chevronDown" size={11} />
          </button>
        </div>
      </div>

      <div className="tool-group">
        <button className="tool" disabled={disabled} onClick={() => act.createBranch()} title="ブランチを作成">
          <Icon name="branch" />
          <span>ブランチ</span>
        </button>
        <div className="split">
          <button className="tool" disabled={disabled} onClick={() => act.stashPush()} title="git stash push">
            <Icon name="stash" />
            <span>スタッシュ</span>
            {s.stashes.length ? <em className="tool-badge">{s.stashes.length}</em> : null}
          </button>
          <button className="caret" disabled={disabled} onClick={stashMenu}>
            <Icon name="chevronDown" size={11} />
          </button>
        </div>
        <button className="tool" disabled={disabled} onClick={() => act.worktreeAdd()} title="git worktree add">
          <Icon name="worktree" />
          <span>worktree</span>
        </button>
        <button className="tool" disabled={disabled} onClick={() => act.prCreate()} title="gh pr create">
          <Icon name="pr" />
          <span>PR 作成</span>
        </button>
      </div>

      <div className="toolbar-right">
        {s.busy ? (
          <span className="busy">
            <Spinner /> {s.busy}
          </span>
        ) : null}
        <button
          className={`icon-btn ${s.autoFetch ? "active" : ""}`}
          title={`自動フェッチ: ${s.autoFetch ? "ON (3分間隔)" : "OFF"}`}
          onClick={s.toggleAutoFetch}
        >
          <Icon name="clock" size={15} />
        </button>
        <button
          className="icon-btn"
          title="再読み込み"
          disabled={!s.repo}
          onClick={() => s.refresh({ withGh: true })}
        >
          {s.loading ? <Spinner size={15} /> : <Icon name="fetch" size={15} />}
        </button>
      </div>
    </header>
  );
}

export function StatusBar() {
  const s = useStore();
  return (
    <footer className="statusbar">
      <span className="mono">{s.repo?.root ?? ""}</span>
      <span className="grow-space" />
      {s.gh?.repo ? (
        <span title={s.gh.url ?? undefined}>
          <Icon name="pr" size={12} /> {s.gh.repo}
          {s.gh.login ? ` (${s.gh.login})` : ""}
        </span>
      ) : s.gh && !s.gh.installed ? (
        <span className="warn-text">gh CLI 未検出</span>
      ) : null}
      {s.graph ? <span>{s.graph.commits.length} コミット</span> : null}
      {s.stashes.length ? <span>スタッシュ {s.stashes.length}</span> : null}
      {s.repo?.headHash ? (
        <span className="mono" title="HEAD">
          {s.repo.headHash.slice(0, 7)}
        </span>
      ) : null}
      {s.status ? (
        <span>
          {s.dirty ? `変更 ${s.status.staged.length + s.status.unstaged.length}` : "クリーン"}
          {s.status.conflicts.length ? ` / 衝突 ${s.status.conflicts.length}` : ""}
        </span>
      ) : null}
    </footer>
  );
}
