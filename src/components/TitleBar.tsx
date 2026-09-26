import { useMemo, useState } from "react";
import { useT } from "../i18n";
import { useStore } from "../state/store";
import { RepoPicker } from "./RepoPicker";
import { miniPill } from "./classes";
import { Icon, Spinner } from "./ui";
import { useMenu } from "./ui-context";

/** タイトルバー右側のアイコンボタン */
const TITLE_BTN =
  "mr-1 mb-0.5 flex h-6.5 w-6.5 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-fg-dim not-disabled:hover:bg-bg-3 not-disabled:hover:text-fg disabled:cursor-default disabled:opacity-40";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

/**
 * 同名リポジトリ (worktree など) が並んだときだけ親ディレクトリを足す。
 * 常に足すとタブが長くなるので、衝突したものだけ。
 */
function tabLabels(tabs: string[]): Record<string, string> {
  const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const count = new Map<string, number>();
  for (const p of tabs) count.set(base(p), (count.get(base(p)) ?? 0) + 1);
  const out: Record<string, string> = {};
  for (const p of tabs) {
    const parts = p.split("/").filter(Boolean);
    const name = parts.at(-1) ?? p;
    out[p] = (count.get(name) ?? 0) > 1 && parts.length > 1 ? `${parts.at(-2)}/${name}` : name;
  }
  return out;
}

/**
 * macOS のタイトルバー領域 (titleBarStyle: Overlay) に重ねて描くタブ。
 * 信号機ボタンのぶんだけ左を空け、余白は data-tauri-drag-region でドラッグ可能にする。
 */
export function TitleBar({
  dashOpen,
  onToggleDash,
}: {
  dashOpen: boolean;
  onToggleDash: () => void;
}) {
  const s = useStore();
  const openMenu = useMenu();
  const t = useT();
  const m = t.titleBar;
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  // 新しいリポジトリを開いている間は、読み込みが終わる前から仮のタブを並べる
  const tabs = useMemo(
    () => (s.opening && !s.tabs.includes(s.opening) ? [...s.tabs, s.opening] : s.tabs),
    [s.opening, s.tabs],
  );
  const labels = useMemo(() => tabLabels(tabs), [tabs]);

  /** 「+」: プロジェクト一覧を開きつつ、最新の状態を裏で取り直す。 */
  const openPicker = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicker({ x: r.left, y: r.bottom + 4 });
    void s.scanProjects();
  };

  const head = s.headBranch;
  const headLabel = s.repo?.detached
    ? `detached @ ${s.repo.headHash?.slice(0, 7) ?? ""}`
    : (head?.name ?? s.repo?.headBranch ?? "");
  const headTitle = [
    headLabel,
    head?.ahead ? `↑${head.ahead}` : "",
    head?.behind ? `↓${head.behind}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tabMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    openMenu(e, [
      {
        label: m.copyPath,
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(path).catch(() => undefined),
      },
      { separator: true },
      { label: m.closeTab, icon: "x", onClick: () => s.closeTab(path) },
      {
        label: m.closeOtherTabs,
        icon: "x",
        disabled: s.tabs.length < 2,
        onClick: () => s.closeTabs(s.tabs.filter((p) => p !== path)),
      },
    ]);
  };

  return (
    <header
      className="flex h-10 flex-none items-end border-b border-line bg-bg-0 pl-24.5 select-none"
      data-tauri-drag-region
    >
      <div className="flex min-w-0 items-end gap-0.5 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:h-0">
        {tabs.map((path) => {
          // 読み込み中はその行き先を選択中として見せる (実際の切り替えは読み込み後)
          const loading = path === s.opening;
          const active = s.opening ? loading : path === s.dir;
          return (
            <div
              key={path}
              className={`group flex h-7.5 min-w-24 flex-initial cursor-default items-center gap-1.5 rounded-t-lg border border-transparent border-b-0 py-0 pr-1.5 pl-2.5 text-[12.5px] ${
                active
                  ? "max-w-105 border-line bg-bg-1 font-semibold text-fg"
                  : "max-w-47.5 text-fg-dim hover:bg-bg-hover hover:text-fg"
              }`}
              title={shortPath(path)}
              onClick={() => !active && !s.opening && s.openRepo(path)}
              onContextMenu={(e) => tabMenu(e, path)}
              onAuxClick={(e) => e.button === 1 && s.closeTab(path)}
            >
              {loading ? <Spinner size={12} /> : <Icon name="repo" size={13} />}
              <span
                className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
                  loading ? "text-fg-dim" : ""
                }`}
              >
                {labels[path]}
              </span>
              {/* チェックアウト中のブランチはアクティブなタブのリポジトリ名の横に出す */}
              {active && !loading && s.repo ? (
                <span
                  className="flex h-5 max-w-55 min-w-0 flex-initial items-center gap-1 rounded-[10px] border border-line bg-bg-2 px-1.75 text-[11.5px] font-medium text-fg-dim"
                  title={headTitle}
                >
                  <Icon name={s.repo.detached ? "commit" : "branch"} size={11} />
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {headLabel}
                  </span>
                  {s.repo.isLinkedWorktree ? (
                    <span className={miniPill()}>{m.worktree}</span>
                  ) : null}
                </span>
              ) : null}
              {s.tabDirty[path] ? (
                <span
                  className="h-1.5 w-1.5 flex-none rounded-full bg-amber"
                  title={m.uncommittedChanges}
                />
              ) : null}
              <button
                className={`flex h-4.5 w-4.5 flex-none cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent p-0 text-fg-faint group-hover:opacity-100 hover:bg-bg-3 hover:text-fg ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                title={m.closeTab}
                onClick={(e) => {
                  e.stopPropagation();
                  s.closeTab(path);
                }}
              >
                <Icon name="x" size={10} />
              </button>
            </div>
          );
        })}
        <button
          className="mx-0.5 mt-0 mb-0.5 flex h-6.5 w-6.5 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-fg-dim hover:bg-bg-3 hover:text-fg"
          title={m.openRepo}
          onClick={openPicker}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="min-w-6 flex-1 self-stretch" data-tauri-drag-region />
      <button
        className={`${TITLE_BTN} ${dashOpen ? "bg-bg-3" : ""}`}
        title={t.toolbar.dashPanel(dashOpen)}
        onClick={onToggleDash}
      >
        <Icon name="bolt" size={14} className={dashOpen ? "text-bolt" : undefined} />
      </button>
      <button
        className={TITLE_BTN}
        title={t.toolbar.reload}
        disabled={!s.repo}
        onClick={() => s.refresh({ withGh: true })}
      >
        {s.loading ? <Spinner size={14} /> : <Icon name="fetch" size={14} />}
      </button>
      <button
        className="mr-1 mb-0.5 flex h-6.5 w-6.5 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-fg-dim hover:bg-bg-3 hover:text-fg"
        title={m.logs}
        onClick={s.openLogs}
      >
        <Icon name="log" size={14} />
      </button>
      {/* 右端のロゴは設定の入口を兼ねる */}
      <button
        className="mr-2.5 mb-0.5 flex h-6.5 flex-none cursor-pointer items-center rounded-md border-0 bg-transparent px-1.5 hover:bg-bg-3"
        title={m.settings}
        onClick={s.openSettings}
      >
        <img className="block h-5.5 w-auto" src="/logo-long.svg" alt="" draggable={false} />
      </button>
      {picker ? <RepoPicker x={picker.x} y={picker.y} onClose={() => setPicker(null)} /> : null}
    </header>
  );
}
