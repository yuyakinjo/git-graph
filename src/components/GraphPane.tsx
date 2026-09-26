import { useCallback, useMemo, useRef, useState } from "react";
import { useWindowEvent } from "../lib/effects";
import { absoluteTime, avatarColor, initials, laneColor, relativeTime } from "../lib/format";
import type { GraphCommit, GraphEdge, RefDeco, StashInfo } from "../lib/types";
import { groupRefs } from "../lib/graphRefs";
import { useActions } from "../state/actions";
import {
  DEFAULT_COLUMN_WIDTHS,
  type GraphColumnKey,
  type GraphColumnWidthKey,
  GRAPH_COLUMNS,
  useStore,
} from "../state/store";
import { Avatar } from "./Avatar";
import { btn, ctxBackdrop, ctxIconGap, ctxItem, ctxSep, iconBtn, popMenu } from "./classes";
import { Icon, type MenuItem } from "./ui";
import { useMenu } from "./ui-context";
import { useT } from "../i18n";

/** 行と見出しで同じ幅を使うため、列のクラスは 1 か所にまとめる */
/** ブランチ列 (タグも並べる)。見出しと同じ左揃えにし、右端はグラフの線と少し間を空ける */
const COL_REFS = "flex flex-none items-center justify-start overflow-hidden pr-1 pl-1.5";
const COL_MSG = "flex min-w-0 flex-auto items-center gap-[5px] overflow-hidden pl-1.5";
const COL_AUTHOR = "flex flex-none items-center gap-1.5 overflow-hidden text-[12px] text-fg-dim";
const COL_SHA = "flex-none overflow-hidden px-1.5 text-ellipsis whitespace-nowrap text-fg-faint";
const COL_DATE = "flex-none overflow-hidden text-right text-[11.5px] text-fg-dim";

/** 列見出しの行。行と同じ列構成・同じ幅を使って位置を揃える */
const HEADER_ROW =
  "relative flex h-5.5 flex-none items-center border-b border-line bg-bg-1 pr-2.5 text-[10.5px] tracking-wider text-fg-faint uppercase select-none";
/** 見出しの並び。行の列順に合わせる。col が無い列 (メッセージ) は幅を変えられない */
const HEADER_CELLS: {
  key: Exclude<GraphColumnKey, "nodeAvatar" | "tags">;
  col: GraphColumnWidthKey | null;
}[] = [
  { key: "refs", col: "refs" },
  { key: "graph", col: "graph" },
  { key: "subject", col: null },
  { key: "author", col: "author" },
  { key: "sha", col: "sha" },
  { key: "date", col: "date" },
];

/** 見出しのセル。区切り線を右端に引き、文字は左揃えにする */
const HEADER_CELL = "relative flex h-full items-center border-r border-line px-1.5 text-left";
/** 列の境目。掴みやすいよう線より広く取り、はみ出しぶんは隣の列に重ねる */
const HEADER_GRIP =
  "absolute top-0 -right-[3px] z-10 h-full w-[7px] cursor-col-resize hover:bg-accent/40 active:bg-accent/60";

const PANE = "flex min-w-0 flex-auto flex-col bg-bg-1";

const ROW_BASE =
  "absolute right-0 left-0 flex h-[30px] cursor-default items-center border-b border-transparent pr-2.5 select-none";
/** .grow.selected は .grow:hover より後に定義されていたので、選択中はホバーで色が変わらない */
const ROW_SELECTED = `${ROW_BASE} focus-within:z-[3] bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]`;
const ROW_PLAIN = `${ROW_BASE} focus-within:z-[3] hover:z-[2] hover:bg-row-hover`;

const REF_BADGE_BASE =
  "inline-flex cursor-default items-center gap-[3px] overflow-hidden rounded-[10px] border py-px pl-[5px] text-[11px] font-semibold whitespace-nowrap [&>svg]:flex-none";
const REF_BADGE_KIND: Record<string, string> = {
  head: "bg-accent-14 border-accent-35 text-accent",
  remote: "bg-violet-12 border-violet-30 text-violet",
  tag: "bg-amber-12 border-amber-30 text-amber",
  commit: "bg-bg-3 border-transparent text-fg-dim",
};
/** 名前付きは列に合わせて縮めて省略する。アイコンだけのときは縮めず、アイコンが潰れないようにする */
const REF_BADGE_FULL = "min-w-0 max-w-full shrink pr-[7px]";
const REF_BADGE_COMPACT = "flex-none pr-[5px]";
/** チェックアウト中のブランチだけ塗りつぶす */
const REF_BADGE_IS_HEAD = "bg-accent border-accent text-on-accent";

const ROW_H = 30;
const LANE_W = 16;
// アバターを出すときはノードが太るぶんレーンも広げる
const LANE_W_AVATAR = 32;
const PAD_X = 14;
const OVERSCAN = 12;
/** 下端からこの行数まで近づいたら次のページを読む */
const LOAD_MORE_ROWS = 24;
/** 通常ノードの半径 */
const NODE_R = 5.5;
/** アバターノードの半径。行の高さ (30px) に上下 3px の余白を残す */
const AVATAR_R = 11;
// 路線図では線幅 (8px) と駅の外径 (10px) を近づける。
const RAILWAY_LINE_W = 8;
const RAILWAY_NODE_R = 4;
const NO_COMMITS: GraphCommit[] = [];
const NO_EDGES: GraphEdge[] = [];

/** レーン位置 → x 座標 */
const cxOf = (col: number, laneW: number) => PAD_X + col * laneW;
const cy = (row: number) => row * ROW_H + ROW_H / 2;

/**
 * レーンをまたぐ線の描き方は 2 通り。
 * - マージ (第二親以降): 子のすぐ下で取り込み元のレーンへ寄せ、そこを真下に下る。
 *   親が子より左にいても、子のレーン (第一親がそのまま下る) と重ならない。
 * - 枝が閉じる (第一親が別レーンで待っている): 自レーンを下り、親の直前で寄せる。
 */
function edgePath(x1: number, y1: number, x2: number, y2: number, isMerge: boolean): string {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const r = Math.min(ROW_H * 0.9, Math.abs(y2 - y1));
  if (isMerge) {
    const yc = y1 + r;
    return `M ${x1} ${y1} C ${x1} ${y1 + r * 0.55}, ${x2} ${yc - r * 0.55}, ${x2} ${yc} L ${x2} ${y2}`;
  }
  const ys = y2 - r;
  return `M ${x1} ${y1} L ${x1} ${ys} C ${x1} ${ys + r * 0.55}, ${x2} ${y2 - r * 0.55}, ${x2} ${y2}`;
}

/** 検索にヒットするコミットの集合。クエリが空なら null (絞り込みなし)。 */
function findMatches(commits: GraphCommit[], query: string): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const set = new Set<string>();
  for (const c of commits) {
    if (
      c.subject.toLowerCase().includes(q) ||
      c.authorName.toLowerCase().includes(q) ||
      c.hash.startsWith(q) ||
      c.refs.some((r) => r.name.toLowerCase().includes(q))
    ) {
      set.add(c.hash);
    }
  }
  return set;
}

function RefBadge({
  deco,
  onCheckout,
  onMenu,
  tracking,
  compact,
  minNameWidth,
}: {
  tracking?: RefDeco;
  deco: RefDeco;
  /** 幅が足りないときは名前を隠してアイコンだけにする (名前は title で見られる) */
  compact?: boolean;
  /** 名前を … で縮めるとき、これより狭くしない (px) */
  minNameWidth?: number;
  onCheckout: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const m = useT();
  const icon =
    deco.kind === "tag"
      ? "tag"
      : deco.kind === "remote"
        ? "remote"
        : deco.kind === "head"
          ? "branch"
          : deco.kind === "stash"
            ? "stash"
            : "commit";
  return (
    <span
      className={`${REF_BADGE_BASE} ${compact ? REF_BADGE_COMPACT : REF_BADGE_FULL} ${
        deco.kind === "head" && deco.isHead
          ? REF_BADGE_IS_HEAD
          : (REF_BADGE_KIND[deco.kind] ?? REF_BADGE_KIND.commit)
      }`}
      style={minNameWidth === undefined ? undefined : { minWidth: minNameWidth + REF_BADGE_FRAME }}
      title={tracking ? m.graphPane.refTracking(deco.full, tracking.full) : deco.full}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onCheckout();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu(e);
      }}
    >
      {deco.isHead && deco.kind === "head" ? (
        <span className="h-1.25 w-1.25 flex-none rounded-full bg-current" />
      ) : null}
      <Icon name={icon} size={11} />
      {tracking ? <Icon name="remote" size={11} /> : null}
      {compact ? null : <span className="truncate">{deco.name}</span>}
    </span>
  );
}

/** 先頭の参照を優先し、残りは操作可能な一覧にまとめる。 */
function CommitRefs({
  refs,
  upstreams,
  compact,
  fixed,
  onCheckout,
  onMenu,
}: {
  refs: RefDeco[];
  upstreams: Map<string, string>;
  compact?: boolean;
  /** 縮めずに名前を全部見せる (タグのほうを縮めるとき) */
  fixed?: boolean;
  onCheckout: (d: RefDeco) => void;
  onMenu: (d: RefDeco) => (e: React.MouseEvent) => void;
}) {
  const m = useT();
  const [open, setOpen] = useState(false);
  const { primary, tracking, others } = groupRefs(refs, upstreams);
  if (!primary) return null;
  return (
    <div
      className={`relative flex min-w-0 max-w-full items-center gap-1 ${fixed ? "flex-none" : "shrink"}`}
    >
      <RefBadge
        deco={primary}
        tracking={tracking}
        compact={compact}
        onCheckout={() => onCheckout(primary)}
        onMenu={onMenu(primary)}
      />
      {others.length ? (
        <>
          <button
            className="flex-none rounded px-1 text-[11px] text-fg-dim hover:bg-bg-3"
            aria-label={m.graphPane.otherRefs(others.length)}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            +{others.length}
          </button>
          {open ? (
            <>
              <div
                className={ctxBackdrop}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
              />
              <div
                className={`${popMenu} max-w-100`}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setOpen(false);
                }}
              >
                {others.map((d) => (
                  <div key={d.full} className="flex px-2 py-1">
                    <RefBadge deco={d} onCheckout={() => onCheckout(d)} onMenu={onMenu(d)} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * 幅が足りない行のタグ。アイコン (と件数) だけを置き、ホバーで中身 (タグのバッジ) を開く。
 * ブランチ列は overflow-hidden なので、一覧は行を基準にしてブランチ列の右隣へ出す。
 */
function TagChip({
  tags,
  columnWidth,
  onCheckout,
  onMenu,
}: {
  tags: RefDeco[];
  columnWidth: number;
  onCheckout: (d: RefDeco) => void;
  onMenu: (d: RefDeco) => (e: React.MouseEvent) => void;
}) {
  return (
    <span className="group/tags flex flex-none items-center">
      <span
        className="inline-flex h-4.5 cursor-default items-center gap-0.5 rounded-[9px] border border-amber-30 bg-amber-12 px-1 text-amber [&>svg]:flex-none"
        title={tags.map((t) => t.name).join("\n")}
      >
        <Icon name="tag" size={12} />
        {tags.length > 1 ? <span className="text-[10px] font-bold">{tags.length}</span> : null}
        <span
          className="absolute top-1/2 z-10 hidden max-w-115 -translate-y-1/2 items-center gap-1.25 overflow-hidden rounded-lg border border-line bg-bg-3 px-1.5 py-1 whitespace-nowrap shadow-[0_6px_18px_rgba(0,0,0,0.45)] group-hover/tags:flex"
          style={{ left: columnWidth + 6 }}
        >
          {tags.map((d) => (
            <RefBadge key={d.full} deco={d} onCheckout={() => onCheckout(d)} onMenu={onMenu(d)} />
          ))}
        </span>
      </span>
    </span>
  );
}

/**
 * ブランチ列の中身。ブランチの右にタグを並べる。
 * 収まらない行では、まずタグ名を … で縮め、次にタグをアイコンにまとめ、
 * さらにブランチ名を … で縮め、それでも足りなければブランチもアイコンだけにする。
 */
function RefsCell({
  refs,
  showTags,
  width,
  upstreams,
  onCheckout,
  onMenu,
}: {
  refs: RefDeco[];
  showTags: boolean;
  width: number;
  upstreams: Map<string, string>;
  onCheckout: (d: RefDeco) => void;
  onMenu: (d: RefDeco) => (e: React.MouseEvent) => void;
}) {
  const branches = refs.filter((d) => d.kind !== "tag");
  const tags = showTags ? refs.filter((d) => d.kind === "tag") : [];
  const fit = refsFit(branches, tags, upstreams, width - REFS_CELL_PAD);
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1">
      <CommitRefs
        refs={branches}
        upstreams={upstreams}
        compact={fit === "icons"}
        fixed={fit === "tagsShort"}
        onCheckout={onCheckout}
        onMenu={onMenu}
      />
      {tags.length === 0 ? null : fit === "full" || fit === "tagsShort" ? (
        tags.map((d) => (
          <RefBadge
            key={d.full}
            deco={d}
            minNameWidth={fit === "tagsShort" ? nameWidths(d.name).min : undefined}
            onCheckout={() => onCheckout(d)}
            onMenu={onMenu(d)}
          />
        ))
      ) : (
        <TagChip tags={tags} columnWidth={width} onCheckout={onCheckout} onMenu={onMenu} />
      )}
    </div>
  );
}

function ColumnMenu() {
  const s = useStore();
  const m = useT();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        className={iconBtn({ tiny: true })}
        title={m.graphPane.visibleColumns}
        onClick={() => setOpen(true)}
      >
        <Icon name="columns" size={14} />
      </button>
    );
  }
  return (
    <span className="relative inline-flex">
      <button
        className={iconBtn({ tiny: true, on: true })}
        title={m.graphPane.visibleColumns}
        onClick={() => setOpen(false)}
      >
        <Icon name="columns" size={14} />
      </button>
      <div className={ctxBackdrop} onMouseDown={() => setOpen(false)} />
      <div className={popMenu} onMouseDown={(e) => e.stopPropagation()}>
        {GRAPH_COLUMNS.map((c) => (
          <button key={c.key} className={ctxItem()} onClick={() => s.toggleColumn(c.key)}>
            {s.columns[c.key] ? <Icon name="check" size={14} /> : <span className={ctxIconGap} />}
            <span>{m.store.graphColumns[c.key]}</span>
          </button>
        ))}
        <div className={ctxSep} />
        <button className={ctxItem()} onClick={s.resetColumns}>
          <span className={ctxIconGap} />
          <span>{m.graphPane.resetColumns}</span>
        </button>
      </div>
    </span>
  );
}

const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** バッジの枠・アイコン・余白ぶん。見出しのダブルクリックで幅を測るときに足す */
const REF_BADGE_CHROME = 34;
/** バッジの名前以外の実寸 (枠・左右余白・アイコン・隙間)。名前を縮めるときの最小幅に足す */
const REF_BADGE_FRAME = 28;
/** セルの左右余白 + 少しの余裕 */
const FIT_PAD = 14;
/** ブランチ列の左右余白 (pl-1.5 + pr-1) */
const REFS_CELL_PAD = 10;
/** バッジ同士の隙間 (gap-1) */
const REFS_GAP = 4;
/** 追跡リモートのアイコンと隙間 */
const TRACKING_ICON_W = 14;
/** まとめたタグのチップ (枠・余白・アイコン)。件数の文字幅は別に足す */
const TAG_CHIP_W = 22;
/** ブランチ名・タグ名を … で縮めるとき、最低限見せる先頭の文字数。これも入らなければアイコンにする */
const MIN_NAME_CHARS = 4;

let measureCtx: CanvasRenderingContext2D | null = null;
/** canvas で文字幅を測る。DOM を作らずに済むので行数が多くても軽い */
function textWidth(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function uiFont(size: number, weight = 400): string {
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  return `${weight} ${size}px ${family}`;
}

/** バッジの名前の幅。min は先頭の数文字 + … に縮めたときの幅 (短い名前はそのまま) */
function nameWidths(name: string): { full: number; min: number } {
  const font = uiFont(11, 600);
  const full = textWidth(name, font);
  return { full, min: Math.min(full, textWidth(`${name.slice(0, MIN_NAME_CHARS)}…`, font)) };
}

/**
 * ブランチ列の 1 行をどこまで縮めれば収まるか。名前は CSS で … に縮むので、
 * 先頭の数文字が見えるうちはアイコンにしない。
 * - full: ブランチもタグも名前付き
 * - tagsShort: ブランチ名はそのままで、タグ名を … で縮める
 * - tags: タグをアイコンにまとめ、ブランチ名は足りなければ … で縮める
 * - icons: ブランチもアイコンだけにする (これでも足りなければはみ出たぶんは切れる)
 */
function refsFit(
  branches: RefDeco[],
  tags: RefDeco[],
  upstreams: Map<string, string>,
  avail: number,
): "full" | "tagsShort" | "tags" | "icons" {
  const { primary, tracking, others } = groupRefs(branches, upstreams);
  let branchFull = 0;
  let branchMin = 0;
  if (primary) {
    let extra = tracking ? TRACKING_ICON_W : 0;
    if (others.length) extra += REFS_GAP + textWidth(`+${others.length}`, uiFont(11)) + 8;
    const name = nameWidths(primary.name);
    branchFull = name.full + REF_BADGE_CHROME + extra;
    branchMin = name.min + REF_BADGE_CHROME + extra;
  }
  let tagsFull = 0;
  let tagsMin = 0;
  for (const t of tags) {
    const name = nameWidths(t.name);
    const gap = tagsFull ? REFS_GAP : 0;
    tagsFull += gap + name.full + REF_BADGE_CHROME;
    tagsMin += gap + name.min + REF_BADGE_CHROME;
  }
  const tagsChip = tags.length
    ? TAG_CHIP_W + (tags.length > 1 ? textWidth(String(tags.length), uiFont(10, 700)) + 2 : 0)
    : 0;
  const gap = primary && tags.length ? REFS_GAP : 0;
  if (branchFull + gap + tagsFull <= avail) return "full";
  if (branchFull + gap + tagsMin <= avail) return "tagsShort";
  if (branchMin + gap + tagsChip <= avail) return "tags";
  return "icons";
}

/** 列の境目。ドラッグで幅を変え、ダブルクリックで内容に合わせる。 */
function ColumnGrip({
  col,
  width,
  onResize,
  onAutoFit,
}: {
  col: GraphColumnWidthKey;
  width: number;
  onResize: (col: GraphColumnWidthKey, px: number) => void;
  onAutoFit: (col: GraphColumnWidthKey) => void;
}) {
  const m = useT();
  return (
    <span
      className={HEADER_GRIP}
      role="separator"
      aria-orientation="vertical"
      title={m.graphPane.columnGrip}
      onDoubleClick={() => onAutoFit(col)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        const startX = e.clientX;
        const startW = width;
        el.setPointerCapture(e.pointerId);
        const prevCursor = document.body.style.cursor;
        document.body.style.cursor = "col-resize";
        const move = (ev: PointerEvent) => onResize(col, startW + (ev.clientX - startX));
        const end = () => {
          document.body.style.cursor = prevCursor;
          el.releasePointerCapture?.(e.pointerId);
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", end);
          el.removeEventListener("pointercancel", end);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
      }}
    />
  );
}

export function GraphPane({ onOpenDetail }: { onOpenDetail: () => void }) {
  const s = useStore();
  const act = useActions();
  const m = useT();
  const openMenu = useMenu();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  /** 本体側の縦スクロールバーの幅。見出しにも同じだけ右余白を足して列位置を揃える */
  const [gutter, setGutter] = useState(0);
  const [query, setQuery] = useState("");
  const loadMoreGraph = s.loadMoreGraph;

  /** 下端に近づいたら続きを読む (無限スクロール)。store 側で二重実行は弾く。 */
  const onScroll = useCallback(
    (el: HTMLDivElement) => {
      setScrollTop(el.scrollTop);
      const rest = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (rest < ROW_H * LOAD_MORE_ROWS) void loadMoreGraph();
    },
    [loadMoreGraph],
  );

  const commits = s.graph?.commits ?? NO_COMMITS;
  const edges = s.graph?.edges ?? NO_EDGES;
  const hasWip = s.dirty;
  const rowOffset = hasWip ? 1 : 0;
  const totalRows = commits.length + rowOffset;
  const cols = s.columns;
  const upstreams = useMemo(
    () =>
      new Map(
        s.branches
          .filter((b) => b.kind === "local" && b.upstream && !b.gone)
          .map((b) => [b.name, b.upstream!]),
      ),
    [s.branches],
  );
  const isRailway = s.graphStyle === "japanese-railway";
  const showNodeAvatar = cols.nodeAvatar;
  const lineWidth = isRailway ? RAILWAY_LINE_W : 1.8;
  const laneW = showNodeAvatar ? LANE_W_AVATAR : LANE_W;
  const cx = (col: number) => cxOf(col, laneW);
  const w = s.columnWidths;
  /** レーン数から決まるグラフ列の幅。ユーザーが掴んで広げていなければこれを使う */
  const graphAutoW = Math.min(Math.max(cx((s.graph?.maxColumn ?? 0) + 1) + 6, 56), 360);
  const graphW = cols.graph ? (w.graph > 0 ? w.graph : graphAutoW) : 0;
  // グラフはブランチ／タグ列の右に来るので、SVG も同じぶんだけ右へずらす
  const graphX = cols.refs ? w.refs : 0;

  const setColumnWidth = s.setColumnWidth;
  /** 見出しのダブルクリック。読み込み済みのコミットから必要な幅を測って合わせる */
  const autoFitColumn = useCallback(
    (key: GraphColumnWidthKey) => {
      // グラフ列は 0 = レーン数に合わせる (自動) に戻す
      if (key === "graph") {
        setColumnWidth("graph", 0);
        return;
      }
      let content = 0;
      if (key === "author") {
        const font = uiFont(12);
        for (const c of commits) content = Math.max(content, textWidth(c.authorName, font));
        // アバターとその右の隙間
        if (content) content += 22;
      } else if (key === "sha") {
        const font = `12px ${MONO_FONT}`;
        for (const c of commits) content = Math.max(content, textWidth(c.short, font));
      } else if (key === "date") {
        const font = uiFont(11.5);
        for (const c of commits)
          content = Math.max(content, textWidth(relativeTime(c.timestamp), font));
      } else if (key === "refs") {
        const font = uiFont(11, 600);
        for (const c of commits) {
          let row = 0;
          for (const d of c.refs) {
            if (d.kind === "tag" && !cols.tags) continue;
            row += textWidth(d.name, font) + REF_BADGE_CHROME;
          }
          content = Math.max(content, row);
        }
      }
      setColumnWidth(key, content ? content + FIT_PAD : DEFAULT_COLUMN_WIDTHS[key]);
    },
    [commits, cols.tags, setColumnWidth],
  );

  // ref コールバックで購読し、クリーンアップも同じ場所で返す (useEffect 不要)
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    if (!el) return;
    const measure = () => {
      setViewH(el.clientHeight);
      setGutter(el.offsetWidth - el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      scrollRef.current = null;
    };
  }, []);

  /** 指定行が画面外なら見える位置までスクロールする。 */
  const revealRow = useCallback((row: number, smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const y = row * ROW_H;
    if (y >= el.scrollTop && y <= el.scrollTop + el.clientHeight - ROW_H * 2) return;
    el.scrollTo({
      top: Math.max(0, y - el.clientHeight / (smooth ? 3 : 2)),
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const headHash = s.repo?.headHash;
  const headRow = useMemo(() => {
    if (!headHash) return -1;
    return commits.findIndex((c) => c.hash === headHash);
  }, [commits, headHash]);

  const matches = useMemo(() => findMatches(commits, query), [commits, query]);

  const stashHashes = useMemo(() => new Set(s.stashes.map((st) => st.hash)), [s.stashes]);

  // 入力イベントを起点に「絞り込み + 最初のヒットへスクロール」をまとめて行う
  const onQueryChange = (next: string) => {
    setQuery(next);
    const hits = findMatches(commits, next);
    if (!hits?.size) return;
    const idx = commits.findIndex((c) => hits.has(c.hash));
    if (idx >= 0) revealRow(idx + rowOffset, true);
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(totalRows, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);

  const visibleEdges = useMemo(() => {
    const lo = start - rowOffset;
    const hi = end - rowOffset;
    return edges.filter((e) => {
      const to = e.toRow < 0 ? commits.length : e.toRow;
      return e.fromRow <= hi && to >= lo;
    });
  }, [edges, start, end, rowOffset, commits.length]);

  const sel = s.selection;
  const selectedSha =
    sel.kind === "commit"
      ? sel.sha
      : sel.kind === "stash"
        ? (s.stashes.find((st) => st.name === sel.refname)?.hash ?? null)
        : null;

  /** stash の行は詳細ペインも stash 用 (未追跡ファイル込みの一覧) に切り替える */
  const selectRow = (c: GraphCommit) => {
    const stash = s.stashes.find((st) => st.hash === c.hash);
    s.select(
      stash
        ? { kind: "stash", refname: stash.name, message: stash.message }
        : { kind: "commit", sha: c.hash },
    );
  };

  const stashMenuItems = (stash: StashInfo): MenuItem[] => [
    { label: m.graphPane.stash.apply, icon: "check", onClick: () => act.stashApply(stash, false) },
    { label: m.graphPane.stash.pop, icon: "stash", onClick: () => act.stashApply(stash, true) },
    { label: m.graphPane.stash.rename, icon: "pencil", onClick: () => act.stashRename(stash) },
  ];
  const stashDropItem = (stash: StashInfo): MenuItem => ({
    label: m.graphPane.stash.drop,
    icon: "trash",
    danger: true,
    onClick: () => act.stashDrop(stash),
  });

  const commitMenu = (c: GraphCommit) => (e: React.MouseEvent) => {
    const stash = s.stashes.find((st) => st.hash === c.hash);
    if (stash) {
      openMenu(e, [
        ...stashMenuItems(stash),
        { separator: true },
        {
          label: m.graphPane.copyName(stash.name),
          icon: "copy",
          onClick: () => navigator.clipboard.writeText(stash.name).catch(() => undefined),
        },
        {
          label: m.graphPane.copySha,
          icon: "copy",
          onClick: () => navigator.clipboard.writeText(c.hash).catch(() => undefined),
        },
        stashDropItem(stash),
      ]);
      return;
    }
    openMenu(e, [
      {
        label: m.graphPane.checkoutName(c.short),
        icon: "commit",
        onClick: () => act.checkout(c.hash, c.short),
      },
      {
        label: m.graphPane.createBranchHere,
        icon: "branch",
        onClick: () => act.createBranch(c.hash),
      },
      { separator: true },
      {
        label: m.graphPane.copySha,
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(c.hash).catch(() => undefined),
      },
      {
        label: m.graphPane.copyMessage,
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(c.subject).catch(() => undefined),
      },
      /** 付いているブランチ・タグ名もここからコピーできるようにする */
      ...(c.refs.length ? [{ separator: true } as MenuItem] : []),
      ...c.refs.map((d): MenuItem => ({
        label: m.graphPane.copyName(d.name),
        icon: d.kind === "tag" ? "tag" : d.kind === "remote" ? "remote" : "branch",
        onClick: () => navigator.clipboard.writeText(d.name).catch(() => undefined),
      })),
    ]);
  };

  const checkoutRef = (deco: RefDeco) =>
    deco.kind === "remote" ? act.checkoutRemote(deco.name) : act.checkout(deco.name);

  const refMenu = (deco: RefDeco) => (e: React.MouseEvent) => {
    const copyName: MenuItem = {
      label: m.graphPane.copyRefName,
      icon: "copy",
      onClick: () => navigator.clipboard.writeText(deco.name).catch(() => undefined),
    };
    if (deco.kind === "head") {
      const branch = s.branches.find((b) => b.name === deco.name && b.kind === "local");
      openMenu(e, [
        {
          label: m.graphPane.checkoutName(deco.name),
          icon: "branch",
          onClick: () => act.checkout(deco.name),
        },
        { separator: true },
        copyName,
        {
          label: m.graphPane.deleteBranch,
          icon: "trash",
          danger: true,
          disabled: deco.isHead,
          onClick: () => branch && act.deleteBranch(branch),
        },
      ]);
      return;
    }
    if (deco.kind === "remote") {
      const branch = s.branches.find((b) => b.name === deco.name && b.kind === "remote");
      openMenu(e, [
        {
          label: m.graphPane.checkoutName(deco.name),
          icon: "branch",
          onClick: () => act.checkoutRemote(deco.name),
        },
        { separator: true },
        copyName,
        {
          label: m.graphPane.deleteRemoteBranch,
          icon: "trash",
          danger: true,
          onClick: () => branch && act.deleteBranch(branch),
        },
      ]);
      return;
    }
    const stash = deco.kind === "stash" ? s.stashes.find((st) => st.name === deco.name) : undefined;
    if (stash) {
      openMenu(e, [...stashMenuItems(stash), { separator: true }, copyName, stashDropItem(stash)]);
      return;
    }
    openMenu(e, [
      {
        label: m.graphPane.checkoutName(deco.name),
        icon: "tag",
        onClick: () => act.checkout(deco.name),
      },
      { separator: true },
      copyName,
    ]);
  };

  // キーボードで選択移動
  useWindowEvent("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // 差分ダイアログを開いている間は ↑↓ をファイル切り替えに譲る
    if (s.diffModal) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "j" && e.key !== "k") return;
    const down = e.key === "ArrowDown" || e.key === "j";
    e.preventDefault();
    const cur = selectedSha ? commits.findIndex((c) => c.hash === selectedSha) : -1;
    let next = cur + (down ? 1 : -1);
    if (!hasWip && next < 0) next = 0;
    if (next >= commits.length) next = commits.length - 1;
    if (next < 0) s.select({ kind: "wip" });
    else selectRow(commits[next]);
    revealRow(Math.max(next, 0) + rowOffset);
  });

  if (!s.graph) return <div className={PANE} />;

  const rows: React.ReactNode[] = [];
  for (let r = start; r < end; r++) {
    if (hasWip && r === 0) {
      const count =
        (s.status?.staged.length ?? 0) +
        (s.status?.unstaged.length ?? 0) +
        (s.status?.conflicts.length ?? 0);
      rows.push(
        <div
          key="wip"
          className={s.selection.kind === "wip" ? ROW_SELECTED : ROW_PLAIN}
          style={{ top: 0 }}
          onClick={() => {
            s.select({ kind: "wip" });
            onOpenDetail();
          }}
        >
          {cols.refs ? <div className={COL_REFS} style={{ width: w.refs }} /> : null}
          {cols.graph ? <div className="flex-none" style={{ width: graphW }} /> : null}
          <div className={COL_MSG}>
            <span className="font-bold text-amber">{m.graphPane.uncommitted}</span>
            <span className="ml-2 text-[11.5px] text-fg-faint">{m.graphPane.fileCount(count)}</span>
          </div>
          {cols.author ? <div className={COL_AUTHOR} style={{ width: w.author }} /> : null}
          {cols.sha ? <div className={COL_SHA} style={{ width: w.sha }} /> : null}
          {cols.date ? <div className={COL_DATE} style={{ width: w.date }} /> : null}
        </div>,
      );
      continue;
    }
    const c = commits[r - rowOffset];
    if (!c) continue;
    const dimmed = matches ? !matches.has(c.hash) : false;
    rows.push(
      <div
        key={c.hash}
        className={`${selectedSha === c.hash ? ROW_SELECTED : ROW_PLAIN} ${
          dimmed ? "opacity-35" : ""
        }`}
        style={{ top: r * ROW_H }}
        onClick={() => {
          selectRow(c);
          onOpenDetail();
        }}
        onDoubleClick={() => {
          // サイドバーと同じく、stash はダブルクリックで apply
          const stash = s.stashes.find((st) => st.hash === c.hash);
          if (stash) act.stashApply(stash, false);
          else act.checkout(c.hash, c.short);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          selectRow(c);
          commitMenu(c)(e);
        }}
      >
        {cols.refs ? (
          <div className={COL_REFS} style={{ width: w.refs }}>
            <RefsCell
              refs={c.refs}
              showTags={cols.tags}
              width={w.refs}
              upstreams={upstreams}
              onCheckout={checkoutRef}
              onMenu={refMenu}
            />
          </div>
        ) : null}
        {cols.graph ? <div className="flex-none" style={{ width: graphW }} /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5">
          {cols.subject ? (
            <span
              className={`min-w-0 flex-1 truncate ${cols.refs && c.refs.some((d) => d.kind !== "tag") ? "text-fg-dim" : "text-fg"}`}
              title={c.subject}
            >
              {c.subject}
            </span>
          ) : null}
        </div>
        {cols.author ? (
          <div
            className={COL_AUTHOR}
            style={{ width: w.author }}
            title={`${c.authorName} <${c.authorEmail}>`}
          >
            <Avatar name={c.authorName} email={c.authorEmail} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{c.authorName}</span>
          </div>
        ) : null}
        {cols.sha ? (
          <div className={`${COL_SHA} font-mono text-[12px]`} style={{ width: w.sha }}>
            {c.short}
          </div>
        ) : null}
        {cols.date ? (
          <div
            className={COL_DATE}
            style={{ width: w.date }}
            tabIndex={0}
            title={absoluteTime(c.timestamp)}
            aria-label={absoluteTime(c.timestamp)}
          >
            {relativeTime(c.timestamp)}
          </div>
        ) : null}
      </div>,
    );
  }

  return (
    <div className={PANE}>
      <div className="flex h-8.5 flex-none items-center gap-2.5 border-b border-line bg-bg-1 px-2.5">
        <div className="flex h-6 max-w-85 flex-1 items-center gap-1.5 rounded-xl border border-line bg-bg-2 px-2 text-fg-dim">
          <Icon name="search" size={14} />
          <input
            className="min-w-0 flex-1 border-0 bg-none text-[12px] text-fg outline-none"
            placeholder={m.graphPane.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {query ? (
            <button
              className={iconBtn({ tiny: true })}
              onClick={() => setQuery("")}
              title={m.graphPane.clear}
            >
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </div>
        <ColumnMenu />
        <button
          className={btn("default", "tiny")}
          disabled={headRow < 0}
          onClick={() => {
            if (!headHash || headRow < 0) return;
            s.select({ kind: "commit", sha: headHash });
            revealRow(headRow + rowOffset, true);
          }}
        >
          {m.graphPane.goToHead}
        </button>
      </div>
      <div
        className={HEADER_ROW}
        style={gutter ? { paddingRight: `calc(0.625rem + ${gutter}px)` } : undefined}
      >
        {HEADER_CELLS.map((h) => {
          // メッセージ列は行側で常に余白 (flex-1) として残るので、見出しも非表示時は空セルで残す
          if (!cols[h.key] && h.key !== "subject") return null;
          const width = h.col === "graph" ? graphW : h.col ? w[h.col] : undefined;
          return (
            <div
              key={h.key}
              className={`${HEADER_CELL} ${h.col ? "flex-none" : "min-w-0 flex-1"}`}
              style={width === undefined ? undefined : { width }}
            >
              {cols[h.key] ? <span className="truncate">{m.graphPane.headers[h.key]}</span> : null}
              {h.col ? (
                <ColumnGrip
                  col={h.col}
                  width={width ?? 0}
                  onResize={setColumnWidth}
                  onAutoFit={autoFitColumn}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        className="relative flex-1 overflow-auto"
        ref={attachScroll}
        onScroll={(e) => onScroll(e.currentTarget)}
      >
        <div className="relative min-w-full" style={{ height: totalRows * ROW_H }}>
          <div className="absolute inset-0">{rows}</div>
          {cols.graph ? (
            <svg
              className="pointer-events-none absolute top-0"
              width={graphW}
              height={totalRows * ROW_H}
              style={{ height: totalRows * ROW_H, left: graphX }}
            >
              {/* 単位円なので全アバターで使い回せる */}
              <defs>
                <clipPath id="node-avatar-clip" clipPathUnits="objectBoundingBox">
                  <circle cx="0.5" cy="0.5" r="0.5" />
                </clipPath>
              </defs>
              {hasWip && headRow >= 0 ? (
                <path
                  d={edgePath(
                    cx(commits[headRow].column),
                    cy(0),
                    cx(commits[headRow].column),
                    cy(headRow + rowOffset),
                    false,
                  )}
                  stroke={laneColor(commits[headRow].column)}
                  strokeWidth={lineWidth}
                  strokeDasharray={isRailway ? "5 4" : "3 3"}
                  fill="none"
                  opacity="0.75"
                />
              ) : null}
              {visibleEdges.map((e, i) => {
                const toRow = e.toRow < 0 ? commits.length : e.toRow;
                return (
                  <path
                    key={i}
                    d={edgePath(
                      cx(e.fromCol),
                      cy(e.fromRow + rowOffset),
                      cx(e.toCol),
                      cy(toRow + rowOffset),
                      e.isMerge,
                    )}
                    stroke={laneColor(e.color)}
                    strokeWidth={lineWidth}
                    strokeLinecap={isRailway ? "round" : undefined}
                    fill="none"
                    opacity={e.toRow < 0 ? 0.35 : 0.9}
                  />
                );
              })}
              {hasWip && start === 0 ? (
                <circle
                  cx={cx(headRow >= 0 ? commits[headRow].column : 0)}
                  cy={cy(0)}
                  r={showNodeAvatar ? AVATAR_R : isRailway ? RAILWAY_NODE_R : NODE_R}
                  fill="var(--color-bg-1)"
                  stroke={laneColor(headRow >= 0 ? commits[headRow].column : 0)}
                  strokeWidth="1.8"
                  strokeDasharray={showNodeAvatar ? "3.5 2.5" : "2.5 2"}
                />
              ) : null}
              {commits
                .slice(Math.max(0, start - rowOffset), Math.max(0, end - rowOffset))
                .map((c) => {
                  const isHead = c.hash === s.repo?.headHash;
                  const isSel = c.hash === selectedSha;
                  const color = laneColor(c.column);
                  const x = cx(c.column);
                  const y = cy(c.row + rowOffset);
                  const url = showNodeAvatar
                    ? s.avatars[c.authorEmail.trim().toLowerCase()]
                    : undefined;
                  // マージは二重丸にして、合流点をひと目で分かるようにする
                  const isMerge = c.parents.length > 1;
                  // stash は内部的にはマージコミットなので、判定を先に行って箱アイコンで描く
                  const isStash = stashHashes.has(c.hash) || c.refs.some((r) => r.kind === "stash");
                  const h = showNodeAvatar ? AVATAR_R : 6;
                  return (
                    <g key={c.hash} opacity={matches && !matches.has(c.hash) ? 0.3 : 1}>
                      {isSel ? (
                        <circle
                          cx={x}
                          cy={y}
                          r={showNodeAvatar ? AVATAR_R + 3 : NODE_R + 3}
                          fill="none"
                          stroke={color}
                          strokeWidth="1.2"
                          opacity="0.5"
                        />
                      ) : null}
                      {isStash ? (
                        <>
                          {/* 破線の四角 = まだコミットではない退避物 */}
                          <rect
                            x={x - h}
                            y={y - h}
                            width={h * 2}
                            height={h * 2}
                            rx={2}
                            fill="var(--color-bg-1)"
                            stroke={color}
                            strokeWidth="1.5"
                            strokeDasharray="2.5 1.5"
                          />
                          {/* 箱: 蓋 + 本体 + 取っ手 */}
                          <g
                            fill="none"
                            stroke={color}
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path
                              d={`M${x - h * 0.6} ${y - h * 0.45}h${h * 1.2}v${h * 0.35}h${-h * 1.2}z`}
                            />
                            <path
                              d={`M${x - h * 0.45} ${y - h * 0.1}v${h * 0.6}h${h * 0.9}v${-h * 0.6}`}
                            />
                            <path d={`M${x - h * 0.15} ${y + h * 0.18}h${h * 0.3}`} />
                          </g>
                        </>
                      ) : isMerge ? (
                        <>
                          {/* 二重丸 = 乗換駅。HEAD (塗り) とも通常 (中抜き) とも形で見分けられる */}
                          <circle
                            cx={x}
                            cy={y}
                            r={
                              showNodeAvatar
                                ? AVATAR_R
                                : isRailway
                                  ? RAILWAY_NODE_R + 1.5
                                  : NODE_R + 1
                            }
                            fill="var(--color-bg-1)"
                            stroke={color}
                            strokeWidth={isHead ? 2.5 : 1.8}
                          />
                          <circle
                            cx={x}
                            cy={y}
                            r={showNodeAvatar ? AVATAR_R * 0.45 : 2.6}
                            fill={color}
                          />
                        </>
                      ) : showNodeAvatar ? (
                        <>
                          {/* 画像が無い / 読めないときはこの地色 + イニシャルがそのまま見える */}
                          <circle
                            cx={x}
                            cy={y}
                            r={AVATAR_R}
                            fill={avatarColor(c.authorEmail || c.authorName)}
                          />
                          <text
                            className="svg-initials fill-white text-[10px] font-bold select-none"
                            x={x}
                            y={y}
                          >
                            {initials(c.authorName)}
                          </text>
                          {url ? (
                            <image
                              href={url}
                              x={x - AVATAR_R}
                              y={y - AVATAR_R}
                              width={AVATAR_R * 2}
                              height={AVATAR_R * 2}
                              preserveAspectRatio="xMidYMid slice"
                              clipPath="url(#node-avatar-clip)"
                            />
                          ) : null}
                          {/* レーン色の輪郭で枝の対応を保つ */}
                          <circle
                            cx={x}
                            cy={y}
                            r={AVATAR_R}
                            fill="none"
                            stroke={color}
                            strokeWidth={isHead ? 2.5 : 1.8}
                          />
                        </>
                      ) : (
                        <circle
                          cx={x}
                          cy={y}
                          r={isRailway ? RAILWAY_NODE_R : NODE_R}
                          fill={isHead ? color : "var(--color-bg-1)"}
                          stroke={color}
                          strokeWidth={isRailway ? 2 : isHead ? 3 : 2}
                        />
                      )}
                    </g>
                  );
                })}
            </svg>
          ) : null}
        </div>
      </div>
      {s.graph.truncated ? (
        <div className="flex-none border-t border-line px-3 py-1 text-[11px] text-fg-faint">
          {s.loadingMore
            ? m.graphPane.showingRecentLoading(commits.length)
            : m.graphPane.showingRecent(commits.length)}
        </div>
      ) : null}
    </div>
  );
}
