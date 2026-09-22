import { useMemo, useState } from "react";
import type { ProjectEntry } from "../lib/types";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { Icon, Spinner } from "./ui";
import { ctxBackdrop } from "./classes";

const PICKER_ACTION =
  "flex cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-[12px] text-fg hover:bg-bg-hover";
/** 「開いています」「最近」の小さなラベル */
const PICKER_TAG = "flex-none rounded-full bg-bg-3 px-1.5 py-px text-[10px] text-fg-dim";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

/** 開いたときに検索欄へ focus する ref コールバック (同一性を固定するためモジュール階層に置く)。 */
function focusInput(el: HTMLInputElement | null) {
  el?.focus();
}

/** キーボード移動で選択行を見える位置に保つ。 */
function keepVisible(el: HTMLElement | null) {
  el?.scrollIntoView({ block: "nearest" });
}

interface Candidate {
  path: string;
  name: string;
  /** 一覧に出す説明 (プロジェクト置き場からの相対パス、なければフルパス) */
  detail: string;
  /** 設定のプロジェクト置き場から見つかったものか */
  known: boolean;
}

function toCandidates(projects: ProjectEntry[], recent: string[]): Candidate[] {
  const out: Candidate[] = projects.map((p) => ({
    path: p.path,
    name: p.name,
    detail: p.rel && p.rel !== p.name ? p.rel : shortPath(p.path),
    known: true,
  }));
  const seen = new Set(out.map((c) => c.path));
  // 設定の外にあるリポジトリも最近開いたものなら拾えるようにする
  for (const p of recent) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({
      path: p,
      name: p.split("/").filter(Boolean).pop() ?? p,
      detail: shortPath(p),
      known: false,
    });
  }
  return out;
}

/** 空白区切りの全語を含むものだけを残し、名前の一致が強い順に並べる。 */
function filterCandidates(all: Candidate[], query: string): Candidate[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return all;
  const scored: { c: Candidate; score: number }[] = [];
  for (const c of all) {
    const name = c.name.toLowerCase();
    const hay = `${name} ${c.path.toLowerCase()}`;
    if (!terms.every((t) => hay.includes(t))) continue;
    const first = terms[0];
    const score = name.startsWith(first) ? 0 : name.includes(first) ? 1 : 2;
    scored.push({ c, score });
  }
  scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name));
  return scored.map((s) => s.c);
}

/**
 * タブの「+」から開くリポジトリ選択。設定したプロジェクト置き場の一覧を
 * 検索で絞り込んで開く。Finder から選ぶ従来の導線も残す。
 */
export function RepoPicker({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const s = useStore();
  const act = useActions();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const all = useMemo(() => toCandidates(s.projects, s.recent), [s.projects, s.recent]);
  const items = useMemo(() => filterCandidates(all, query), [all, query]);
  const index = Math.min(active, Math.max(0, items.length - 1));

  const choose = (path: string) => {
    onClose();
    void s.openRepo(path);
  };

  // ここで処理したキーは stopPropagation して、背後のグラフ (GraphPane の ↑↓)
  // やアプリ全体の Escape に届かないようにする。
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setActive(items.length ? (index + 1) % items.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActive(items.length ? (index - 1 + items.length) % items.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const target = items[index];
      if (target) choose(target.path);
    }
  };

  /**
   * 検索欄から focus が外れるとキー操作が効かなくなるので、パネル内の mousedown は
   * 既定動作 (focus 移動) を止めて検索欄に focus を残す。click は別途飛ぶのでボタンは動く。
   */
  const keepFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  };

  const left = Math.min(x, window.innerWidth - 380);
  const top = Math.min(y, window.innerHeight - 420);

  return (
    <div className={ctxBackdrop} onMouseDown={onClose}>
      <div
        className="fixed z-81 flex max-h-105 w-90 flex-col overflow-hidden rounded-[10px] border border-line bg-bg-2 shadow-[0_18px_44px_rgba(0,0,0,0.5)]"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
        tabIndex={-1}
        onMouseDown={keepFocus}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-label="リポジトリを選択"
      >
        <div className="flex items-center gap-1.75 border-b border-line-soft px-2.5 py-2 text-fg-dim">
          <Icon name="search" size={14} />
          <input
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-fg outline-none"
            ref={focusInput}
            value={query}
            placeholder="プロジェクトを検索"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          {s.scanning ? <Spinner /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {items.map((c, i) => {
            const open = s.tabs.includes(c.path);
            return (
              <button
                key={c.path}
                ref={i === index ? keepVisible : undefined}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md border-none px-2 py-1.25 text-left text-[13px] text-fg ${
                  i === index ? "bg-accent-soft" : "bg-transparent"
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c.path)}
                title={c.path}
              >
                <Icon name="repo" size={14} />
                <span className="max-w-[45%] flex-none overflow-hidden text-ellipsis whitespace-nowrap">
                  {c.name}
                </span>
                <span className="min-w-0 flex-1 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap text-fg-faint">
                  {c.detail}
                </span>
                {open ? <span className={PICKER_TAG}>開いています</span> : null}
                {!c.known ? <span className={PICKER_TAG}>最近</span> : null}
              </button>
            );
          })}
          {!items.length ? (
            <div className="px-3 py-3.5 text-[12px] leading-[1.6] text-fg-dim">
              {s.projectRoots.length
                ? s.scanning
                  ? "検索中..."
                  : "該当するリポジトリがありません"
                : "プロジェクトの場所が未設定です。下の「プロジェクトの場所を設定」から追加してください。"}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col border-t border-line-soft p-1">
          <button
            className={PICKER_ACTION}
            onClick={() => {
              onClose();
              void act.openFolder();
            }}
          >
            <Icon name="folder" size={14} /> Finder から開く...
          </button>
          <button
            className={PICKER_ACTION}
            onClick={() => {
              onClose();
              s.openSettings();
            }}
          >
            <Icon name="worktree" size={14} /> プロジェクトの場所を設定
            <span className="ml-auto text-[11px] text-fg-faint">⌘,</span>
          </button>
        </div>
      </div>
    </div>
  );
}
