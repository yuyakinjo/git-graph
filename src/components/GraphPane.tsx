import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { avatarColor, initials, laneColor, relativeTime } from "../lib/format";
import type { GraphCommit, GraphEdge, RefDeco } from "../lib/types";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
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
  const graphW = Math.min(
    Math.max(cx((s.graph?.maxColumn ?? 0) + 1) + 6, 56),
    360,
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const headRow = useMemo(() => {
    if (!s.repo?.headHash) return -1;
    const i = commits.findIndex((c) => c.hash === s.repo!.headHash);
    return i;
  }, [commits, s.repo?.headHash]);

  const matches = useMemo(() => {
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
  }, [commits, query]);

  // 検索したら最初のヒットへスクロール
  useEffect(() => {
    if (!matches || matches.size === 0) return;
    const idx = commits.findIndex((c) => matches.has(c.hash));
    if (idx >= 0 && scrollRef.current) {
      const y = (idx + rowOffset) * ROW_H;
      const el = scrollRef.current;
      if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW_H) {
        el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: "smooth" });
      }
    }
  }, [matches, commits, rowOffset]);

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "j" && e.key !== "k") return;
      const down = e.key === "ArrowDown" || e.key === "j";
      e.preventDefault();
      const sel = s.selection;
      const cur =
        sel.kind === "commit" ? commits.findIndex((c) => c.hash === sel.sha) : -1;
      let next = cur + (down ? 1 : -1);
      if (!hasWip && next < 0) next = 0;
      if (next >= commits.length) next = commits.length - 1;
      if (next < 0) {
        s.setSelection({ kind: "wip" });
      } else {
        s.setSelection({ kind: "commit", sha: commits[next].hash });
      }
      const y = (Math.max(next, 0) + rowOffset) * ROW_H;
      const el = scrollRef.current;
      if (el && (y < el.scrollTop || y > el.scrollTop + el.clientHeight - ROW_H * 2)) {
        el.scrollTo({ top: Math.max(0, y - el.clientHeight / 2) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commits, hasWip, rowOffset, s]);

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
          onClick={() => s.setSelection({ kind: "wip" })}
        >
          <div className="col-msg" style={{ marginLeft: graphW }}>
            <span className="wip-label">未コミットの変更</span>
            <span className="wip-count">{count} ファイル</span>
          </div>
          <div className="col-author" />
          <div className="col-sha" />
          <div className="col-date" />
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
        onClick={() => s.setSelection({ kind: "commit", sha: c.hash })}
        onDoubleClick={() => act.checkout(c.hash, c.short)}
        onContextMenu={(e) => {
          e.preventDefault();
          s.setSelection({ kind: "commit", sha: c.hash });
          commitMenu(c)(e);
        }}
      >
        <div className="col-msg" style={{ marginLeft: graphW }}>
          {c.refs.length ? (
            <span className="refs">
              {c.refs.map((d) => (
                <RefBadge
                  key={`${d.kind}:${d.full}`}
                  deco={d}
                  onCheckout={() =>
                    d.kind === "remote" ? act.checkoutRemote(d.name) : act.checkout(d.name)
                  }
                  onMenu={refMenu(d)}
                />
              ))}
            </span>
          ) : null}
          <span className="subject">{c.subject}</span>
        </div>
        <div className="col-author" title={`${c.authorName} <${c.authorEmail}>`}>
          <span className="avatar" style={{ background: avatarColor(c.authorEmail || c.authorName) }}>
            {initials(c.authorName)}
          </span>
          <span className="author-name">{c.authorName}</span>
        </div>
        <div className="col-sha mono">{c.short}</div>
        <div className="col-date">{relativeTime(c.timestamp)}</div>
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
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button className="icon-btn tiny" onClick={() => setQuery("")} title="クリア">
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </div>
        <div className="graph-head-cols">
          <span className="col-author">作者</span>
          <span className="col-sha">SHA</span>
          <span className="col-date">日時</span>
        </div>
      </div>
      <div
        className="graph-scroll"
        ref={scrollRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div className="graph-canvas" style={{ height: totalRows * ROW_H }}>
          <div className="graph-rows">{rows}</div>
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
        </div>
      </div>
      {s.graph.truncated ? (
        <div className="graph-foot">直近 {commits.length} 件を表示しています</div>
      ) : null}
    </div>
  );
}
