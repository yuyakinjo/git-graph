import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { absoluteTime, avatarColor, basename, dirname, initials, relativeTime } from "../lib/format";
import type { CommitDetail, DiffFile, FileEntry } from "../lib/types";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { DiffView } from "./DiffView";
import { Icon, useMenu } from "./ui";

function FileRow({
  path,
  origPath,
  status,
  selected,
  onClick,
  onContextMenu,
  right,
  stats,
}: {
  path: string;
  origPath?: string | null;
  status: string;
  selected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  right?: React.ReactNode;
  stats?: { additions: number; deletions: number };
}) {
  const dir = dirname(origPath ? `${origPath} → ${path}` : path);
  return (
    <div
      className={`file-row ${selected ? "selected" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={origPath ? `${origPath} → ${path}` : path}
    >
      <span className={`fstatus s-${status}`}>{status}</span>
      <span className="fname">{basename(path)}</span>
      <span className="fdir">{dir}</span>
      {stats && (stats.additions || stats.deletions) ? (
        <span className="fstats">
          <em className="add">+{stats.additions}</em>
          <em className="del">-{stats.deletions}</em>
        </span>
      ) : null}
      {right ? <span className="frow-actions">{right}</span> : null}
    </div>
  );
}

// ------------------------------------------------------------------ WIP (add / commit)

function WipPanel() {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [sel, setSel] = useState<{ kind: "staged" | "unstaged" | "untracked"; path: string } | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const status = s.status;
  const stagedCount = status?.staged.length ?? 0;
  const changedCount = (status?.unstaged.length ?? 0) + (status?.conflicts.length ?? 0);

  useEffect(() => {
    if (!sel) {
      setDiff(null);
      return;
    }
    let alive = true;
    setLoadingDiff(true);
    api
      .diffText(s.dir, sel.kind === "untracked" ? "untracked" : sel.kind, sel.path)
      .then((d) => alive && setDiff(d))
      .catch(() => alive && setDiff(""))
      .finally(() => alive && setLoadingDiff(false));
    return () => {
      alive = false;
    };
  }, [sel, s.dir, status]);

  useEffect(() => {
    if (amend) {
      api.lastCommitMessage(s.dir).then((m) => setMessage((cur) => cur || m)).catch(() => undefined);
    }
  }, [amend, s.dir]);

  const fileMenu = (f: FileEntry, staged: boolean) => (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e, [
      staged
        ? { label: "アンステージ", icon: "minus", onClick: () => act.unstage([f.path]) }
        : { label: "ステージ", icon: "plus", onClick: () => act.stage([f.path]) },
      { separator: true },
      { label: "変更を破棄", icon: "trash", danger: true, onClick: () => act.discard([f.path]) },
      {
        label: "パスをコピー",
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(f.path).catch(() => undefined),
      },
    ]);
  };

  const canCommit = (stagedCount > 0 || changedCount > 0 || amend) && !s.busy;

  return (
    <div className="detail wip-panel">
      <header className="detail-head">
        <div className="detail-title">
          <Icon name="commit" size={15} />
          <h3>未コミットの変更</h3>
        </div>
        <div className="detail-sub">
          {s.repo?.state !== "clean" ? (
            <span className="state-pill">{s.repo?.state}</span>
          ) : null}
          <span>{changedCount + stagedCount} ファイル</span>
        </div>
      </header>

      <div className="wip-lists">
        <section className="file-section">
          <div className="section-head">
            <span>変更 ({changedCount})</span>
            <button className="btn tiny" disabled={changedCount === 0} onClick={() => act.stageAll()}>
              <Icon name="plus" size={12} /> すべてステージ
            </button>
          </div>
          <div className="file-list">
            {status?.conflicts.map((f) => (
              <FileRow
                key={`c-${f.path}`}
                path={f.path}
                status="U"
                selected={sel?.kind === "unstaged" && sel.path === f.path}
                onClick={() => setSel({ kind: "unstaged", path: f.path })}
                onContextMenu={fileMenu(f, false)}
                right={
                  <button
                    className="icon-btn tiny"
                    title="解決済みとしてステージ"
                    onClick={(e) => {
                      e.stopPropagation();
                      act.stage([f.path]);
                    }}
                  >
                    <Icon name="check" size={13} />
                  </button>
                }
              />
            ))}
            {status?.unstaged.map((f) => (
              <FileRow
                key={`u-${f.path}`}
                path={f.path}
                origPath={f.origPath}
                status={f.untracked ? "?" : f.workStatus}
                selected={sel?.kind !== "staged" && sel?.path === f.path}
                onClick={() =>
                  setSel({ kind: f.untracked ? "untracked" : "unstaged", path: f.path })
                }
                onContextMenu={fileMenu(f, false)}
                right={
                  <>
                    <button
                      className="icon-btn tiny"
                      title="変更を破棄"
                      onClick={(e) => {
                        e.stopPropagation();
                        act.discard([f.path]);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                    <button
                      className="icon-btn tiny"
                      title="ステージ"
                      onClick={(e) => {
                        e.stopPropagation();
                        act.stage([f.path]);
                      }}
                    >
                      <Icon name="plus" size={13} />
                    </button>
                  </>
                }
              />
            ))}
            {changedCount === 0 ? <div className="list-empty">変更はありません</div> : null}
          </div>
        </section>

        <section className="file-section">
          <div className="section-head">
            <span>ステージ済み ({stagedCount})</span>
            <button className="btn tiny" disabled={stagedCount === 0} onClick={() => act.unstageAll()}>
              <Icon name="minus" size={12} /> すべて解除
            </button>
          </div>
          <div className="file-list">
            {status?.staged.map((f) => (
              <FileRow
                key={`s-${f.path}`}
                path={f.path}
                origPath={f.origPath}
                status={f.indexStatus}
                selected={sel?.kind === "staged" && sel.path === f.path}
                onClick={() => setSel({ kind: "staged", path: f.path })}
                onContextMenu={fileMenu(f, true)}
                right={
                  <button
                    className="icon-btn tiny"
                    title="アンステージ"
                    onClick={(e) => {
                      e.stopPropagation();
                      act.unstage([f.path]);
                    }}
                  >
                    <Icon name="minus" size={13} />
                  </button>
                }
              />
            ))}
            {stagedCount === 0 ? <div className="list-empty">ステージ済みのファイルはありません</div> : null}
          </div>
        </section>
      </div>

      <div className="diff-wrap">
        {sel ? <div className="diff-head mono">{sel.path}</div> : null}
        <DiffView raw={diff} loading={loadingDiff} />
      </div>

      <div className="commit-box">
        <textarea
          placeholder={
            stagedCount === 0 && changedCount > 0
              ? "コミットメッセージ (ステージ済みが無い場合はすべてステージしてコミットします)"
              : "コミットメッセージ"
          }
          value={message}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCommit) {
              act.commit(message, amend).then((ok) => ok && setMessage(""));
            }
          }}
        />
        <div className="commit-actions">
          <label className="check small">
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
            <span>直前のコミットを修正 (amend)</span>
          </label>
          <button
            className="btn primary"
            disabled={!canCommit || (!message.trim() && !amend)}
            onClick={() => act.commit(message, amend).then((ok) => ok && setMessage(""))}
          >
            <Icon name="check" size={14} />
            {amend ? "コミットを修正" : stagedCount === 0 ? "すべてコミット" : `${stagedCount} 件をコミット`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ コミット詳細

function CommitPanel({ sha }: { sha: string }) {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setSel(null);
    setDiff(null);
    api
      .commitDetail(s.dir, sha)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        if (d.files.length) setSel(d.files[0].path);
      })
      .catch((e) => s.toast({ kind: "error", title: "コミットを読み込めません", detail: String(e) }));
    return () => {
      alive = false;
    };
  }, [sha, s.dir]);

  useEffect(() => {
    if (!sel) {
      setDiff(null);
      return;
    }
    let alive = true;
    setLoadingDiff(true);
    api
      .diffText(s.dir, "commit", sel, sha)
      .then((d) => alive && setDiff(d))
      .catch(() => alive && setDiff(""))
      .finally(() => alive && setLoadingDiff(false));
    return () => {
      alive = false;
    };
  }, [sel, sha, s.dir]);

  const totals = useMemo(() => {
    const files = detail?.files ?? [];
    return files.reduce(
      (acc, f) => ({ a: acc.a + f.additions, d: acc.d + f.deletions }),
      { a: 0, d: 0 },
    );
  }, [detail]);

  if (!detail) return <div className="detail loading">読み込み中...</div>;

  const fileMenu = (f: DiffFile) => (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e, [
      {
        label: "パスをコピー",
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(f.path).catch(() => undefined),
      },
    ]);
  };

  return (
    <div className="detail">
      <header className="detail-head">
        <div className="detail-title">
          <span
            className="avatar big"
            style={{ background: avatarColor(detail.authorEmail || detail.authorName) }}
          >
            {initials(detail.authorName)}
          </span>
          <div>
            <h3>{detail.subject}</h3>
            <div className="detail-sub">
              <strong>{detail.authorName}</strong>
              <span title={absoluteTime(detail.authorAt)}>{relativeTime(detail.authorAt)}</span>
              <button
                className="sha-btn mono"
                title="SHA をコピー"
                onClick={() => navigator.clipboard.writeText(detail.hash).catch(() => undefined)}
              >
                {detail.short} <Icon name="copy" size={11} />
              </button>
            </div>
          </div>
        </div>
        <div className="detail-tools">
          <button className="btn tiny" onClick={() => act.checkout(detail.hash, detail.short)}>
            <Icon name="commit" size={12} /> チェックアウト
          </button>
          <button className="btn tiny" onClick={() => act.createBranch(detail.hash)}>
            <Icon name="branch" size={12} /> ブランチ作成
          </button>
        </div>
      </header>

      {detail.body ? <pre className="commit-body">{detail.body}</pre> : null}

      <div className="section-head">
        <span>
          {detail.files.length} ファイル変更
          {detail.parents.length > 1 ? " (第一親との差分)" : ""}
        </span>
        <span className="fstats">
          <em className="add">+{totals.a}</em>
          <em className="del">-{totals.d}</em>
        </span>
      </div>
      <div className="file-list grow-list">
        {detail.files.map((f) => (
          <FileRow
            key={f.path}
            path={f.path}
            origPath={f.origPath}
            status={f.status}
            selected={sel === f.path}
            onClick={() => setSel(f.path)}
            onContextMenu={fileMenu(f)}
            stats={{ additions: f.additions, deletions: f.deletions }}
          />
        ))}
        {detail.files.length === 0 ? <div className="list-empty">差分はありません</div> : null}
      </div>

      <div className="diff-wrap">
        {sel ? <div className="diff-head mono">{sel}</div> : null}
        <DiffView raw={diff} loading={loadingDiff} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stash 詳細

function StashPanel({ refname, message }: { refname: string; message: string }) {
  const s = useStore();
  const act = useActions();
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .stashFiles(s.dir, refname)
      .then((f) => {
        if (!alive) return;
        setFiles(f);
        setSel(f[0]?.path ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refname, s.dir]);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    api
      .diffText(s.dir, "stash", sel, refname)
      .then((d) => alive && setDiff(d))
      .catch(() => alive && setDiff(""));
    return () => {
      alive = false;
    };
  }, [sel, refname, s.dir]);

  const stash = s.stashes.find((x) => x.name === refname);

  return (
    <div className="detail">
      <header className="detail-head">
        <div className="detail-title">
          <Icon name="stash" size={15} />
          <div>
            <h3>{message}</h3>
            <div className="detail-sub mono">{refname}</div>
          </div>
        </div>
        <div className="detail-tools">
          <button className="btn tiny" disabled={!stash} onClick={() => stash && act.stashApply(stash, false)}>
            適用
          </button>
          <button className="btn tiny" disabled={!stash} onClick={() => stash && act.stashApply(stash, true)}>
            ポップ
          </button>
          <button className="btn tiny danger" disabled={!stash} onClick={() => stash && act.stashDrop(stash)}>
            破棄
          </button>
        </div>
      </header>
      <div className="file-list grow-list">
        {files.map((f) => (
          <FileRow
            key={f.path}
            path={f.path}
            status={f.status}
            selected={sel === f.path}
            onClick={() => setSel(f.path)}
            stats={{ additions: f.additions, deletions: f.deletions }}
          />
        ))}
      </div>
      <div className="diff-wrap">
        {sel ? <div className="diff-head mono">{sel}</div> : null}
        <DiffView raw={diff} />
      </div>
    </div>
  );
}

export function DetailPane() {
  const s = useStore();
  const sel = s.selection;

  const content = useCallback(() => {
    if (sel.kind === "wip") return <WipPanel />;
    if (sel.kind === "commit") return <CommitPanel sha={sel.sha} />;
    return <StashPanel refname={sel.refname} message={sel.message} />;
  }, [sel]);

  return <div className="pane detail-pane">{content()}</div>;
}
