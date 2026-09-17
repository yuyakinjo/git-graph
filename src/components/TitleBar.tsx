import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { RepoPicker } from "./RepoPicker";
import { Icon, Spinner, useMenu } from "./ui";

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
export function TitleBar() {
  const s = useStore();
  const openMenu = useMenu();
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

  const tabMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    openMenu(e, [
      {
        label: "パスをコピー",
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(path).catch(() => undefined),
      },
      { separator: true },
      { label: "タブを閉じる", icon: "x", onClick: () => s.closeTab(path) },
      {
        label: "他のタブを閉じる",
        icon: "x",
        disabled: s.tabs.length < 2,
        onClick: () => s.closeTabs(s.tabs.filter((p) => p !== path)),
      },
    ]);
  };

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-tabs">
        {tabs.map((path) => {
          // 読み込み中はその行き先を選択中として見せる (実際の切り替えは読み込み後)
          const loading = path === s.opening;
          const active = s.opening ? loading : path === s.dir;
          return (
            <div
              key={path}
              className={`rtab ${active ? "active" : ""} ${loading ? "loading" : ""}`}
              title={shortPath(path)}
              onClick={() => !active && !s.opening && s.openRepo(path)}
              onContextMenu={(e) => tabMenu(e, path)}
              onAuxClick={(e) => e.button === 1 && s.closeTab(path)}
            >
              {loading ? <Spinner size={12} /> : <Icon name="repo" size={13} />}
              <span className="rtab-name">{labels[path]}</span>
              {s.tabDirty[path] ? <span className="rtab-dot" title="未コミットの変更あり" /> : null}
              <button
                className="rtab-close"
                title="タブを閉じる"
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
        <button className="rtab-add" title="リポジトリを開く" onClick={openPicker}>
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region />
      {picker ? (
        <RepoPicker x={picker.x} y={picker.y} onClose={() => setPicker(null)} />
      ) : null}
    </header>
  );
}
