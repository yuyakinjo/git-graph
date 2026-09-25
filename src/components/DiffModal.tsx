import { useMemo } from "react";
import { useWindowEvent } from "../lib/effects";
import { basename, dirname } from "../lib/format";
import { useActions } from "../state/actions";
import type { FileTarget } from "../state/store";
import { useStore } from "../state/store";
import { DiffView } from "./DiffView";
import { FSTATUS_COLOR, btn, fstatAdd, fstatDel, fstats, iconBtn } from "./classes";
import { Icon } from "./ui";

interface Entry {
  target: FileTarget;
  status: string;
  origPath?: string | null;
  stats?: { additions: number; deletions: number };
  /** WIP のときだけ付く。一覧を「変更」「ステージ済み」の見出しで区切るのに使う。 */
  group?: "unstaged" | "staged";
}

const GROUP_LABEL = { unstaged: "変更", staged: "ステージ済み" } as const;

const GROUP_HEAD =
  "sticky top-0 z-1 flex h-6 items-center border-b border-line-soft bg-bg-1 px-2.5 text-[11px] font-semibold text-fg-dim";

const ROW_BASE = "flex h-6 w-full cursor-default items-center gap-[7px] px-2.5 text-[12px]";
const ROW_SELECTED = `${ROW_BASE} bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]`;
const ROW_PLAIN = `${ROW_BASE} hover:bg-bg-hover`;

/** 詳細ペインと同じ並びで「いま見ている選択のファイル一覧」を作る。↑↓ の順序もこれ。 */
function useEntries(): Entry[] {
  const s = useStore();
  const sel = s.selection;
  const { status, commit, stashFiles } = s;

  return useMemo(() => {
    if (sel.kind === "wip") {
      if (!status) return [];
      return [
        ...status.conflicts.map((f) => ({
          target: { source: "unstaged" as const, path: f.path },
          status: "U",
          group: "unstaged" as const,
        })),
        ...status.unstaged.map((f) => ({
          target: {
            source: f.untracked ? ("untracked" as const) : ("unstaged" as const),
            path: f.path,
          },
          status: f.untracked ? "?" : f.workStatus,
          origPath: f.origPath,
          group: "unstaged" as const,
        })),
        ...status.staged.map((f) => ({
          target: { source: "staged" as const, path: f.path },
          status: f.indexStatus,
          origPath: f.origPath,
          group: "staged" as const,
        })),
      ];
    }
    if (sel.kind === "commit") {
      return (commit?.files ?? []).map((f) => ({
        target: { source: "commit" as const, path: f.path, ref: sel.sha },
        status: f.status,
        origPath: f.origPath,
        stats: { additions: f.additions, deletions: f.deletions },
      }));
    }
    return stashFiles.map((f) => ({
      target: { source: "stash" as const, path: f.path, ref: sel.refname },
      status: f.status,
      stats: { additions: f.additions, deletions: f.deletions },
    }));
  }, [sel, status, commit, stashFiles]);
}

/**
 * 差分を画面いっぱいで見るダイアログ。
 * ↑↓ (j/k) で同じ選択内のファイルを切り替える (グラフ側の移動はダイアログ中は止まる)。
 */
export function DiffModal() {
  const s = useStore();
  const act = useActions();
  const entries = useEntries();
  const cur = s.file;
  const index = cur
    ? entries.findIndex((e) => e.target.source === cur.source && e.target.path === cur.path)
    : -1;

  const close = () => s.setDiffModal(false);

  // WIP のファイルだけはダイアログから直接ステージ / アンステージできる。
  // 実行後は refresh がこのパスを新しい source で選び直すので、選択はそのまま残る。
  // ステージしたときは、まだ未ステージのファイルが残っていればそちらへ移る
  // (いまの位置より後ろを優先し、なければ先頭側へ回り込む)。
  const staged = cur?.source === "staged";
  const canStage =
    cur?.source === "staged" || cur?.source === "unstaged" || cur?.source === "untracked";
  const toggleStage = async () => {
    if (!cur) return;
    if (staged) {
      void act.unstage([cur.path]);
      return;
    }
    const rest = entries.filter((e) => e.group === "unstaged" && e.target.path !== cur.path);
    const next = rest.find((e) => entries.indexOf(e) > index) ?? rest.at(0);
    const ok = await act.stage([cur.path]);
    if (ok && next) await s.openFile(next.target);
  };

  const go = (delta: number) => {
    if (!entries.length) return;
    const next = index < 0 ? 0 : index + delta;
    if (next < 0 || next >= entries.length) return;
    void s.openFile(entries[next].target);
  };

  useWindowEvent("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      go(1);
      return;
    }
    if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      go(-1);
    }
  });

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col bg-scrim p-[3vh] backdrop-blur-[2px]"
      onMouseDown={close}
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-bg-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={cur ? cur.path : "差分"}
      >
        <header className="grid flex-none grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2.5 border-b border-line px-3.5 py-2.5">
          <div className="flex min-w-0 items-center">
            {canStage ? (
              <button
                className={btn(staged ? "default" : "primary", "tiny")}
                title={staged ? "このファイルをアンステージ" : "このファイルを git add"}
                disabled={!!s.busy}
                onClick={() => void toggleStage()}
              >
                <Icon name={staged ? "minus" : "plus"} size={12} />
                {staged ? "アンステージ" : "ステージ"}
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center justify-center gap-2.5">
            <span
              className={`w-3.5 flex-none text-center font-mono text-[11px] font-bold ${
                FSTATUS_COLOR[entries[index]?.status ?? ""] ?? "text-fg-faint"
              }`}
            >
              {entries[index]?.status ?? ""}
            </span>
            <h2 className="m-0 min-w-0 overflow-hidden text-[13.5px] font-[650] text-ellipsis whitespace-nowrap">
              {cur ? basename(cur.path) : "差分"}
            </h2>
            <span className="min-w-0 overflow-hidden font-mono text-[11.5px] text-ellipsis whitespace-nowrap text-fg-faint">
              {cur ? dirname(cur.path) : ""}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2.5">
            {entries[index]?.stats ? (
              <span className={fstats}>
                <em className={fstatAdd}>+{entries[index].stats.additions}</em>
                <em className={fstatDel}>-{entries[index].stats.deletions}</em>
              </span>
            ) : null}
            <span className="flex-none font-mono text-[11.5px] text-fg-dim">
              {index < 0 ? "-" : index + 1} / {entries.length}
            </span>
            <button
              className={iconBtn({ tiny: true })}
              title="前のファイル (↑)"
              disabled={index <= 0}
              onClick={() => go(-1)}
            >
              <Icon name="chevronUp" size={13} />
            </button>
            <button
              className={iconBtn({ tiny: true })}
              title="次のファイル (↓)"
              disabled={index >= entries.length - 1}
              onClick={() => go(1)}
            >
              <Icon name="chevronDown" size={13} />
            </button>
            <button className={iconBtn()} title="閉じる (Esc)" onClick={close}>
              <Icon name="x" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div
            className={`w-65 flex-none overflow-y-auto border-r border-line bg-bg-1 pb-1 ${
              entries[0]?.group ? "" : "pt-1"
            }`}
          >
            {entries.map((e, i) => [
              e.group && e.group !== entries[i - 1]?.group ? (
                <div key={`group:${e.group}`} className={GROUP_HEAD}>
                  {GROUP_LABEL[e.group]} ({entries.filter((x) => x.group === e.group).length})
                </div>
              ) : null,
              <button
                key={`${e.target.source}:${e.target.path}`}
                className={index >= 0 && entries[index] === e ? ROW_SELECTED : ROW_PLAIN}
                title={e.origPath ? `${e.origPath} → ${e.target.path}` : e.target.path}
                onClick={() => void s.openFile(e.target)}
              >
                <span
                  className={`w-3.5 flex-none text-center font-mono text-[10.5px] font-bold ${
                    FSTATUS_COLOR[e.status] ?? "text-fg-faint"
                  }`}
                >
                  {e.status}
                </span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {basename(e.target.path)}
                </span>
                <span className="lrm flex-auto overflow-hidden text-left text-[11px] text-ellipsis whitespace-nowrap text-fg-faint [direction:rtl]">
                  {dirname(e.target.path)}
                </span>
              </button>,
            ])}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-1">
            <DiffView
              text={s.diff.text}
              lines={s.diff.lines}
              tokens={s.diff.tokens}
              loading={s.diff.loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
