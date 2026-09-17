import { useCallback, useMemo, useRef, useState } from "react";
import { useWindowEvent } from "../lib/effects";
import { laneColor, relativeTime } from "../lib/format";
import type { GraphCommit, GraphEdge, RefDeco } from "../lib/types";
import { useActions } from "../state/actions";
import { GRAPH_COLUMNS, useStore } from "../state/store";
import { Avatar } from "./Avatar";
import { Icon, useMenu } from "./ui";

const ROW_H = 30;
const LANE_W = 16;
const PAD_X = 14;
const OVERSCAN = 12;
const NO_COMMITS: GraphCommit[] = [];
const NO_EDGES: GraphEdge[] = [];

/** レーン位置 → x 座標 */
const cx = (col: number) => PAD_X + col * LANE_W;
const cy = (row: number) => row * ROW_H + ROW_H / 2;

function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const r = Math.min(ROW_H * 0.9, Math.abs(y2 - y1));
  if (x2 > x1) {
    // マージ: 子のすぐ下で右レーンへ寄せてから真下へ
    const yc = y1 + r;
    return `M ${x1} ${y1} C ${x1} ${y1 + r * 0.55}, ${x2} ${yc - r * 0.55}, ${x2} ${yc} L ${x2} ${y2}`;
  }
  // 枝が閉じる: 自レーンを下り、親の直前で左へ合流
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
}: {
  deco: RefDeco;
  onCheckout: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const icon =
    deco.kind === "tag" ? "tag" : deco.kind === "remote" ? "remote" : deco.kind === "head" ? "branch" : "commit";
  return (
    <span
      className={`ref-badge ${deco.kind} ${deco.isHead ? "is-head" : ""}`}
      title={deco.full}
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
      {deco.isHead && deco.kind === "head" ? <span className="head-dot" /> : null}
      <Icon name={icon} size={11} />
      {deco.name}
    </span>
  );
}

/** タグ列。アイコンだけを置き、ホバーで中身 (タグのバッジ) を開く。 */
function TagCell({
  tags,
  onCheckout,
  onMenu,
}: {
  tags: RefDeco[];
  onCheckout: (d: RefDeco) => void;
  onMenu: (d: RefDeco) => (e: React.MouseEvent) => void;
}) {
  if (!tags.length) return <div className="col-tags" />;
  return (
    <div className="col-tags">
      <span className="tag-chip" title={tags.map((t) => t.name).join("\n")}>
        <Icon name="tag" size={12} />
        {tags.length > 1 ? <span className="tag-n">{tags.length}</span> : null}
        <span className="tag-pop">
          {tags.map((d) => (
            <RefBadge
              key={d.full}
              deco={d}
              onCheckout={() => onCheckout(d)}
              onMenu={onMenu(d)}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

/** 列の表示・非表示を選ぶポップオーバー。 */
function ColumnMenu() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="icon-btn tiny" title="表示する列" onClick={() => setOpen(true)}>
        <Icon name="columns" size={14} />
      </button>
    );
  }
  return (
    <span className="col-menu-wrap">
      <button className="icon-btn tiny on" title="表示する列" onClick={() => setOpen(false)}>
        <Icon name="columns" size={14} />
      </button>
      <div className="ctx-backdrop" onMouseDown={() => setOpen(false)} />
      <div className="col-menu" onMouseDown={(e) => e.stopPropagation()}>
        {GRAPH_COLUMNS.map((c) => (
          <button key={c.key} className="ctx-item" onClick={() => s.toggleColumn(c.key)}>
            {s.columns[c.key] ? <Icon name="check" size={14} /> : <span className="ctx-icon-gap" />}
            <span>{c.label}</span>
          </button>
        ))}
        <div className="ctx-sep" />
        <button className="ctx-item" onClick={s.resetColumns}>
          <span className="ctx-icon-gap" />
          <span>すべて表示</span>
        </button>
      </div>
    </span>
  );
}

export function GraphPane() {
  const s = useStore();
  const act = useActions();
  const openMenu = useMenu();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const [query, setQuery] = useState("");

  const commits = s.graph?.commits ?? NO_COMMITS;
  const edges = s.graph?.edges ?? NO_EDGES;
  const hasWip = s.dirty;
  const rowOffset = hasWip ? 1 : 0;
  const totalRows = commits.length + rowOffset;
  const cols = s.columns;
  const graphW = cols.graph
    ? Math.min(Math.max(cx((s.graph?.maxColumn ?? 0) + 1) + 6, 56), 360)
    : 0;

  // ref コールバックで購読し、クリーンアップも同じ場所で返す (useEffect 不要)
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    if (!el) return;
    setViewH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
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

  const headRow = useMemo(() => {
    if (!s.repo?.headHash) return -1;
    const i = commits.findIndex((c) => c.hash === s.repo!.headHash);
    return i;
  }, [commits, s.repo?.headHash]);

  const matches = useMemo(() => findMatches(commits, query), [commits, query]);

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

  const selectedSha = s.selection.kind === "commit" ? s.selection.sha : null;

  const commitMenu = (c: GraphCommit) => (e: React.MouseEvent) => {
    openMenu(e, [
      { label: `${c.short} をチェックアウト`, icon: "commit", onClick: () => act.checkout(c.hash, c.short) },
      { label: "ここからブランチを作成", icon: "branch", onClick: () => act.createBranch(c.hash) },
      { separator: true },
      {
        label: "SHA をコピー",
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(c.hash).catch(() => undefined),
      },
      {
        label: "メッセージをコピー",
        icon: "copy",
        onClick: () => navigator.clipboard.writeText(c.subject).catch(() => undefined),
      },
    ]);
  };

  const checkoutRef = (deco: RefDeco) =>
    deco.kind === "remote" ? act.checkoutRemote(deco.name) : act.checkout(deco.name);

  const refMenu = (deco: RefDeco) => (e: React.MouseEvent) => {
    if (deco.kind === "head") {
      const branch = s.branches.find((b) => b.name === deco.name && b.kind === "local");
      openMenu(e, [
        { label: `${deco.name} をチェックアウト`, icon: "branch", onClick: () => act.checkout(deco.name) },
        { separator: true },
        {
          label: "ブランチを削除",
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
          label: `${deco.name} をチェックアウト`,
          icon: "branch",
          onClick: () => act.checkoutRemote(deco.name),
        },
        { separator: true },
        {
          label: "リモートブランチを削除",
          icon: "trash",
          danger: true,
          onClick: () => branch && act.deleteBranch(branch),
        },
      ]);
      return;
    }
    openMenu(e, [
      { label: `${deco.name} をチェックアウト`, icon: "tag", onClick: () => act.checkout(deco.name) },
    ]);
  };

  // キーボードで選択移動
  useWindowEvent("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "j" && e.key !== "k") return;
    const down = e.key === "ArrowDown" || e.key === "j";
    e.preventDefault();
    const sel = s.selection;
    const cur = sel.kind === "commit" ? commits.findIndex((c) => c.hash === sel.sha) : -1;
    let next = cur + (down ? 1 : -1);
    if (!hasWip && next < 0) next = 0;
    if (next >= commits.length) next = commits.length - 1;
    s.select(next < 0 ? { kind: "wip" } : { kind: "commit", sha: commits[next].hash });
    revealRow(Math.max(next, 0) + rowOffset);
  });

  if (!s.graph) return <div className="pane graph-pane empty" />;

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
          className={`grow wip ${s.selection.kind === "wip" ? "selected" : ""}`}
          style={{ top: 0 }}
          onClick={() => s.select({ kind: "wip" })}
        >
          {cols.graph ? <div className="col-graph" style={{ width: graphW }} /> : null}
          {cols.refs ? <div className="col-refs" /> : null}
          {cols.tags ? <div className="col-tags" /> : null}
          <div className="col-msg">
            <span className="wip-label">未コミットの変更</span>
            <span className="wip-count">{count} ファイル</span>
          </div>
          {cols.author ? <div className="col-author" /> : null}
          {cols.sha ? <div className="col-sha" /> : null}
          {cols.date ? <div className="col-date" /> : null}
        </div>,
      );
      continue;
    }
    const c = commits[r - rowOffset];
    if (!c) continue;
    const dim = matches ? !matches.has(c.hash) : false;
    rows.push(
      <div
        key={c.hash}
        className={`grow ${selectedSha === c.hash ? "selected" : ""} ${dim ? "dim" : ""} ${
          headRow === c.row ? "is-head-row" : ""
        }`}
        style={{ top: r * ROW_H }}
        onClick={() => s.select({ kind: "commit", sha: c.hash })}
        onDoubleClick={() => act.checkout(c.hash, c.short)}
        onContextMenu={(e) => {
          e.preventDefault();
          s.select({ kind: "commit", sha: c.hash });
          commitMenu(c)(e);
        }}
      >
        {cols.graph ? <div className="col-graph" style={{ width: graphW }} /> : null}
        {cols.refs ? (
          <div className="col-refs">
            {c.refs
              .filter((d) => d.kind !== "tag" || !cols.tags)
              .map((d) => (
                <RefBadge
                  key={`${d.kind}:${d.full}`}
                  deco={d}
                  onCheckout={() => checkoutRef(d)}
                  onMenu={refMenu(d)}
                />
              ))}
          </div>
        ) : null}
        {cols.tags ? (
          <TagCell
            tags={c.refs.filter((d) => d.kind === "tag")}
            onCheckout={checkoutRef}
            onMenu={refMenu}
          />
        ) : null}
        {cols.subject ? (
          <div className="col-msg">
            <span className="subject">{c.subject}</span>
          </div>
        ) : (
          <div className="col-fill" />
        )}
        {cols.author ? (
          <div className="col-author" title={`${c.authorName} <${c.authorEmail}>`}>
            <Avatar name={c.authorName} email={c.authorEmail} />
            <span className="author-name">{c.authorName}</span>
          </div>
        ) : null}
        {cols.sha ? <div className="col-sha mono">{c.short}</div> : null}
        {cols.date ? <div className="col-date">{relativeTime(c.timestamp)}</div> : null}
      </div>,
    );
  }

  return (
    <div className="pane graph-pane">
      <div className="graph-head">
        <div className="graph-search">
          <Icon name="search" size={14} />
          <input
            placeholder="コミット・作者・SHA を検索"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {query ? (
            <button className="icon-btn tiny" onClick={() => setQuery("")} title="クリア">
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </div>
        <ColumnMenu />
        <div className="graph-head-cols">
          {cols.author ? <span className="col-author">作者</span> : null}
          {cols.sha ? <span className="col-sha">SHA</span> : null}
          {cols.date ? <span className="col-date">日時</span> : null}
        </div>
      </div>
      <div
        className="graph-scroll"
        ref={attachScroll}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div className="graph-canvas" style={{ height: totalRows * ROW_H }}>
          <div className="graph-rows">{rows}</div>
          {cols.graph ? (
            <svg
              className="graph-svg"
              width={graphW}
              height={totalRows * ROW_H}
              style={{ height: totalRows * ROW_H }}
            >
              {hasWip && headRow >= 0 ? (
                <path
                  d={edgePath(
                    cx(commits[headRow].column),
                    cy(0),
                    cx(commits[headRow].column),
                    cy(headRow + rowOffset),
                  )}
                  stroke={laneColor(commits[headRow].column)}
                  strokeWidth="1.8"
                  strokeDasharray="3 3"
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
                    )}
                    stroke={laneColor(e.color)}
                    strokeWidth="1.8"
                    fill="none"
                    opacity={e.toRow < 0 ? 0.35 : 0.9}
                  />
                );
              })}
              {hasWip && start === 0 ? (
                <circle
                  cx={cx(headRow >= 0 ? commits[headRow].column : 0)}
                  cy={cy(0)}
                  r="4.5"
                  fill="var(--bg-1)"
                  stroke={laneColor(headRow >= 0 ? commits[headRow].column : 0)}
                  strokeWidth="1.8"
                  strokeDasharray="2.5 2"
                />
              ) : null}
              {commits.slice(Math.max(0, start - rowOffset), Math.max(0, end - rowOffset)).map((c) => {
                const isHead = c.hash === s.repo?.headHash;
                const isSel = c.hash === selectedSha;
                const color = laneColor(c.column);
                return (
                  <g key={c.hash} opacity={matches && !matches.has(c.hash) ? 0.3 : 1}>
                    {isSel ? (
                      <circle
                        cx={cx(c.column)}
                        cy={cy(c.row + rowOffset)}
                        r="8"
                        fill="none"
                        stroke={color}
                        strokeWidth="1.2"
                        opacity="0.5"
                      />
                    ) : null}
                    <circle
                      cx={cx(c.column)}
                      cy={cy(c.row + rowOffset)}
                      r={c.parents.length > 1 ? 4 : 4.5}
                      fill={isHead ? color : "var(--bg-1)"}
                      stroke={color}
                      strokeWidth={isHead ? 3 : 2}
                    />
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
      </div>
      {s.graph.truncated ? (
        <div className="graph-foot">直近 {commits.length} 件を表示しています</div>
      ) : null}
    </div>
  );
}
