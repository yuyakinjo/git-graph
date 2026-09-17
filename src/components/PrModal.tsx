import { relativeTime } from "../lib/format";
import type { PullRequest } from "../lib/types";
import { useActions } from "../state/actions";
import { btn, checkDot, fstatAdd, fstatDel, fstats, miniPill } from "./classes";
import { Icon, Modal } from "./ui";

const PR_STATE_BASE = "rounded-[10px] px-2 py-0.5 text-[11px] font-bold";
const PR_STATE_TONE: Record<string, string> = {
  draft: "bg-bg-3 text-fg-dim",
  merged: "bg-violet-16 text-violet",
  closed: "bg-red-16 text-red",
  open: "bg-green-16 text-green",
};

const CHECK_CHIP =
  "inline-flex max-w-[220px] items-center gap-[5px] overflow-hidden rounded-[10px] bg-bg-3 px-2 py-0.5 text-[11px] text-ellipsis whitespace-nowrap text-fg-dim";

/** 表示専用。詳細の取得は PR を開く側 (App) が行い、pr として渡ってくる。 */
export function PrModal({ pr, onClose }: { pr: PullRequest; onClose: () => void }) {
  const act = useActions();
  const d = pr;
  const checks = d.statusCheckRollup ?? [];

  return (
    <Modal
      title={`#${d.number} ${d.title}`}
      width={720}
      onClose={onClose}
      footer={
        <>
          <button className={btn("ghost")} onClick={() => act.prOpen(d)}>
            <Icon name="external" size={14} /> ブラウザで開く
          </button>
          <span className="flex-1" />
          <button
            className={btn()}
            onClick={async () => {
              onClose();
              await act.prCheckout(d);
            }}
          >
            <Icon name="branch" size={14} /> チェックアウト
          </button>
          <button
            className={btn("primary")}
            onClick={async () => {
              onClose();
              await act.prMerge(d);
            }}
          >
            <Icon name="merge" size={14} /> マージ
          </button>
        </>
      }
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5 text-[12px] text-fg-dim">
        <span
          className={`${PR_STATE_BASE} ${
            PR_STATE_TONE[d.isDraft ? "draft" : d.state.toLowerCase()] ?? PR_STATE_TONE.open
          }`}
        >
          {d.isDraft ? "Draft" : d.state}
        </span>
        <span className="font-mono text-[12px]">
          {d.headRefName} → {d.baseRefName}
        </span>
        {d.author?.login ? <span>{d.author.login}</span> : null}
        <span>{relativeTime(Math.floor(new Date(d.updatedAt).getTime() / 1000))}更新</span>
        {d.reviewDecision ? <span className={miniPill()}>{d.reviewDecision}</span> : null}
        {typeof d.additions === "number" ? (
          <span className={fstats}>
            <em className={fstatAdd}>+{d.additions}</em>
            <em className={fstatDel}>-{d.deletions}</em>
          </span>
        ) : null}
      </div>
      {checks.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {checks.slice(0, 12).map((c, i) => {
            const state = c.conclusion ?? c.state ?? c.status ?? "";
            const cls = /SUCCESS|NEUTRAL|SKIPPED/i.test(state)
              ? "pass"
              : /FAIL|ERROR|CANCEL|TIMED/i.test(state)
                ? "fail"
                : "pending";
            return (
              <span key={i} className={CHECK_CHIP} title={`${c.name ?? ""}: ${state}`}>
                <span className={checkDot(cls)} />
                {c.name ?? state}
              </span>
            );
          })}
        </div>
      ) : null}
      <pre className="m-0 max-h-[40vh] overflow-auto rounded-lg border border-line bg-bg-1 p-3 font-[inherit] text-[12.5px] break-words whitespace-pre-wrap text-fg">
        {(d as PullRequest & { body?: string }).body?.trim() || "(本文なし)"}
      </pre>
    </Modal>
  );
}
