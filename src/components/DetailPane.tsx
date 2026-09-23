import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { absoluteTime, basename, dirname, relativeTime } from "../lib/format";
import type { DiffFile, FileEntry } from "../lib/types";
import { useActions } from "../state/actions";
import type { FileTarget } from "../state/store";
import { useStore } from "../state/store";
import { Avatar } from "./Avatar";
import { FSTATUS_COLOR, btn, fstatAdd, fstatDel, fstats, iconBtn } from "./classes";
import { Icon } from "./ui";
import { useMenu } from "./ui-context";

const DETAIL = "flex h-full min-w-0 flex-col";
const DETAIL_HEAD = "flex-none border-b border-line px-3 py-2.5";
const DETAIL_TITLE = "flex min-w-0 items-start gap-[9px]";
const DETAIL_H3 = "m-0 text-[13.5px] font-[650] leading-[1.35] break-words";
const DETAIL_SUB = "mt-[3px] flex flex-wrap items-center gap-2 text-[11.5px] text-fg-dim";
const DETAIL_TOOLS = "mt-[9px] flex gap-1.5";

const SECTION_HEAD =
  "flex h-7 flex-none items-center justify-between gap-2 border-b border-line-soft bg-bg-1 px-2.5 text-[11.5px] font-semibold text-fg-dim";
/** wip 側の「変更」と「ステージ済み」を仕切る上下方向のスプリッタ */
const ROW_SPLITTER =
  "h-1 flex-none cursor-row-resize bg-line-soft transition-[background] duration-150 ease-[ease] hover:bg-accent";
/** 分割時に「変更」側へ最低限残す高さ (見出し + 1 行分) */
const WIP_LIST_MIN = 56;
/** 「ステージ済み」セクションの最小高さ (見出しのみ) */
const SECTION_MIN = 28;

const LIST_EMPTY = "px-3 py-2 text-[11.5px] text-fg-faint";

const FILE_ROW_BASE = "group flex h-6 cursor-default items-center gap-[7px] px-2.5 text-[12px]";
const FILE_ROW_SELECTED = `${FILE_ROW_BASE} bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]`;
const FILE_ROW_PLAIN = `${FILE_ROW_BASE} hover:bg-bg-hover`;

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
      className={selected ? FILE_ROW_SELECTED : FILE_ROW_PLAIN}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={origPath ? `${origPath} → ${path}` : path}
    >
      <span
        className={`w-3.5 flex-none text-center font-mono text-[10.5px] font-bold ${
          FSTATUS_COLOR[status] ?? "text-fg-faint"
        }`}
      >
        {status}
      </span>
      <span className="max-w-[55%] flex-none overflow-hidden text-ellipsis whitespace-nowrap">
        {basename(path)}
      </span>
      <span className="lrm flex-auto overflow-hidden text-left text-[11px] text-ellipsis whitespace-nowrap text-fg-faint [direction:rtl]">
        {dir}
      </span>
      {stats && (stats.additions || stats.deletions) ? (
        <span className={fstats}>
          <em className={fstatAdd}>+{stats.additions}</em>
          <em className={fstatDel}>-{stats.deletions}</em>
        </span>
      ) : null}
      {right ? <span className="hidden flex-none gap-0.5 group-hover:flex">{right}</span> : null}
    </div>
  );
}

// ------------------------------------------------------------------ WIP (add / commit)

const STAGED_KEY = "gitgraph.stagedH";

/**
 * 「ステージ済み」セクションの高さ。App.tsx の usePaneWidth と同じくポインタキャプチャで追従し、
 * 高さはコンテナ下端からポインタまでの距離で決める。
 */
function useStagedHeight(initial: number) {
  const [height, setHeight] = useState(() => Number(localStorage.getItem(STAGED_KEY)) || initial);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.classList.add("dragging-row");
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!dragging.current || !box) return;
    const max = box.height - WIP_LIST_MIN;
    setHeight(Math.max(SECTION_MIN, Math.min(max, box.bottom - e.clientY)));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove("dragging-row");
      e.currentTarget.releasePointerCapture(e.pointerId);
      localStorage.setItem(STAGED_KEY, String(height));
    },
    [height],
  );

  return {
    height,
    containerRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

function WipPanel() {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const sel = s.file;
  const { height: stagedH, containerRef, handlers: splitter } = useStagedHeight(200);

  /** ファイル行のクリックは差分ダイアログを開く */
  const open = (target: FileTarget) => {
    void s.openFile(target);
    s.setDiffModal(true);
  };

  const status = s.status;
  const stagedCount = status?.staged.length ?? 0;
  const changedCount = (status?.unstaged.length ?? 0) + (status?.conflicts.length ?? 0);

  // amend を入れた瞬間に直前のメッセージを取りに行く (state を effect で追従させない)
  const toggleAmend = async (next: boolean) => {
    setAmend(next);
    if (!next) return;
    const last = await api.lastCommitMessage(s.dir).catch(() => "");
    if (last) setMessage((cur) => cur || last);
  };

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
    <div className={DETAIL}>
      <header className={DETAIL_HEAD}>
        <div className={DETAIL_TITLE}>
          <Icon name="commit" size={15} />
          <h3 className={DETAIL_H3}>未コミットの変更</h3>
        </div>
        <div className={DETAIL_SUB}>
          {s.repo?.state !== "clean" ? (
            <span className="rounded-lg bg-amber-16 px-1.5 py-px font-bold text-amber">
              {s.repo?.state}
            </span>
          ) : null}
          <span>{changedCount + stagedCount} ファイル</span>
        </div>
      </header>

      <div ref={containerRef} className="flex min-h-0 flex-auto flex-col">
        <section className="flex min-h-0 flex-auto flex-col">
          <div className={SECTION_HEAD}>
            <span>変更 ({changedCount})</span>
            <button
              className={btn("default", "tiny")}
              disabled={changedCount === 0}
              onClick={() => act.stageAll()}
            >
              <Icon name="plus" size={12} /> すべてステージ
            </button>
          </div>
          <div className="min-h-0 flex-auto overflow-y-auto">
            {status?.conflicts.map((f) => (
              <FileRow
                key={`c-${f.path}`}
                path={f.path}
                status="U"
                selected={sel?.source === "unstaged" && sel.path === f.path}
                onClick={() => open({ source: "unstaged", path: f.path })}
                onContextMenu={fileMenu(f, false)}
                right={
                  <button
                    className={iconBtn({ tiny: true })}
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
                selected={sel?.source !== "staged" && sel?.path === f.path}
                onClick={() =>
                  open({ source: f.untracked ? "untracked" : "unstaged", path: f.path })
                }
                onContextMenu={fileMenu(f, false)}
                right={
                  <>
                    <button
                      className={iconBtn({ tiny: true })}
                      title="変更を破棄"
                      onClick={(e) => {
                        e.stopPropagation();
                        act.discard([f.path]);
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                    <button
                      className={iconBtn({ tiny: true })}
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
            {changedCount === 0 ? <div className={LIST_EMPTY}>変更はありません</div> : null}
          </div>
        </section>

        <div className={ROW_SPLITTER} {...splitter} />

        <section
          className="flex min-h-0 flex-none flex-col"
          style={{ height: stagedH, maxHeight: `calc(100% - ${WIP_LIST_MIN}px)` }}
        >
          <div className={SECTION_HEAD}>
            <span>ステージ済み ({stagedCount})</span>
            <button
              className={btn("default", "tiny")}
              disabled={stagedCount === 0}
              onClick={() => act.unstageAll()}
            >
              <Icon name="minus" size={12} /> すべて解除
            </button>
          </div>
          <div className="min-h-0 flex-auto overflow-y-auto">
            {status?.staged.map((f) => (
              <FileRow
                key={`s-${f.path}`}
                path={f.path}
                origPath={f.origPath}
                status={f.indexStatus}
                selected={sel?.source === "staged" && sel.path === f.path}
                onClick={() => open({ source: "staged", path: f.path })}
                onContextMenu={fileMenu(f, true)}
                right={
                  <button
                    className={iconBtn({ tiny: true })}
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
            {stagedCount === 0 ? (
              <div className={LIST_EMPTY}>ステージ済みのファイルはありません</div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="flex-none border-t border-line bg-bg-2 px-2.5 pt-2 pb-2.5">
        <textarea
          className="w-full resize-y rounded-md border border-line bg-bg-1 px-2.25 py-1.75 font-[inherit] text-[12.5px] text-fg outline-none focus:border-accent"
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
        <div className="mt-2 flex items-center justify-between gap-2.5">
          <label className="flex cursor-pointer items-center gap-1.75 text-[11.5px] text-fg-dim">
            <input
              className="h-3.5 w-3.5 accent-accent"
              type="checkbox"
              checked={amend}
              onChange={(e) => toggleAmend(e.target.checked)}
            />
            <span>直前のコミットを修正 (amend)</span>
          </label>
          <button
            className={btn("primary")}
            disabled={!canCommit || (!message.trim() && !amend)}
            onClick={() => act.commit(message, amend).then((ok) => ok && setMessage(""))}
          >
            <Icon name="check" size={14} />
            {amend
              ? "コミットを修正"
              : stagedCount === 0
                ? "すべてコミット"
                : `${stagedCount} 件をコミット`}
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
  // 中身は選択時に store がまとめて読み込む。ここは受け取って描くだけ。
  const detail = s.commit;
  const sel = s.file?.source === "commit" ? s.file.path : null;

  const totals = useMemo(() => {
    const files = detail?.files ?? [];
    return files.reduce((acc, f) => ({ a: acc.a + f.additions, d: acc.d + f.deletions }), {
      a: 0,
      d: 0,
    });
  }, [detail]);

  if (!detail) return <div className={`${DETAIL} p-4 text-fg-dim`}>読み込み中...</div>;

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
    <div className={DETAIL}>
      <header className={DETAIL_HEAD}>
        <div className={DETAIL_TITLE}>
          <Avatar name={detail.authorName} email={detail.authorEmail} big />
          <div className="min-w-0">
            <h3 className={DETAIL_H3}>{detail.subject}</h3>
            <div className={DETAIL_SUB}>
              <strong>{detail.authorName}</strong>
              <span title={absoluteTime(detail.authorAt)}>{relativeTime(detail.authorAt)}</span>
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-[5px] border-0 bg-bg-3 px-1.5 py-px font-mono text-[12px] text-fg-dim hover:text-fg"
                title="SHA をコピー"
                onClick={() => navigator.clipboard.writeText(detail.hash).catch(() => undefined)}
              >
                {detail.short} <Icon name="copy" size={11} />
              </button>
            </div>
          </div>
        </div>
        <div className={DETAIL_TOOLS}>
          <button
            className={btn("default", "tiny")}
            onClick={() => act.checkout(detail.hash, detail.short)}
          >
            <Icon name="commit" size={12} /> チェックアウト
          </button>
          <button className={btn("default", "tiny")} onClick={() => act.createBranch(detail.hash)}>
            <Icon name="branch" size={12} /> ブランチ作成
          </button>
        </div>
      </header>

      {detail.body ? (
        <pre className="m-0 max-h-35 flex-none overflow-auto border-b border-line px-3 py-2.5 font-[inherit] text-[12px] whitespace-pre-wrap text-fg-dim">
          {detail.body}
        </pre>
      ) : null}

      <div className={SECTION_HEAD}>
        <span>
          {detail.files.length} ファイル変更
          {detail.parents.length > 1 ? " (第一親との差分)" : ""}
        </span>
        <span className={fstats}>
          <em className={fstatAdd}>+{totals.a}</em>
          <em className={fstatDel}>-{totals.d}</em>
        </span>
      </div>
      <div className="min-h-20 flex-auto overflow-y-auto">
        {detail.files.map((f) => (
          <FileRow
            key={f.path}
            path={f.path}
            origPath={f.origPath}
            status={f.status}
            selected={sel === f.path}
            onClick={() => {
              void s.openFile({ source: "commit", path: f.path, ref: sha });
              s.setDiffModal(true);
            }}
            onContextMenu={fileMenu(f)}
            stats={{ additions: f.additions, deletions: f.deletions }}
          />
        ))}
        {detail.files.length === 0 ? <div className={LIST_EMPTY}>差分はありません</div> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stash 詳細

function StashPanel({ refname, message }: { refname: string; message: string }) {
  const s = useStore();
  const act = useActions();
  const files = s.stashFiles;
  const sel = s.file?.source === "stash" ? s.file.path : null;

  const stash = s.stashes.find((x) => x.name === refname);

  return (
    <div className={DETAIL}>
      <header className={DETAIL_HEAD}>
        <div className={DETAIL_TITLE}>
          <Icon name="stash" size={15} />
          <div className="min-w-0">
            <h3 className={DETAIL_H3}>{message}</h3>
            <div className={`${DETAIL_SUB} font-mono text-[11.5px]`}>{refname}</div>
          </div>
        </div>
        <div className={DETAIL_TOOLS}>
          <button
            className={btn("default", "tiny")}
            disabled={!stash}
            onClick={() => stash && act.stashApply(stash, false)}
          >
            適用
          </button>
          <button
            className={btn("default", "tiny")}
            disabled={!stash}
            onClick={() => stash && act.stashApply(stash, true)}
          >
            ポップ
          </button>
          <button
            className={btn("outlineDanger", "tiny")}
            disabled={!stash}
            onClick={() => stash && act.stashDrop(stash)}
          >
            破棄
          </button>
        </div>
      </header>
      <div className="min-h-20 flex-auto overflow-y-auto">
        {files.map((f) => (
          <FileRow
            key={f.path}
            path={f.path}
            status={f.status}
            selected={sel === f.path}
            onClick={() => {
              void s.openFile({ source: "stash", path: f.path, ref: refname });
              s.setDiffModal(true);
            }}
            stats={{ additions: f.additions, deletions: f.deletions }}
          />
        ))}
      </div>{" "}
    </div>
  );
}

export function DetailPane() {
  const s = useStore();
  const sel = s.selection;

  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-line bg-bg-2">
      {sel.kind === "wip" ? (
        <WipPanel />
      ) : sel.kind === "commit" ? (
        <CommitPanel sha={sel.sha} />
      ) : (
        <StashPanel refname={sel.refname} message={sel.message} />
      )}
    </div>
  );
}
