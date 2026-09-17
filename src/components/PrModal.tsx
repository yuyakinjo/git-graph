import { relativeTime } from "../lib/format";
import type { PullRequest } from "../lib/types";
import { useActions } from "../state/actions";
import { Icon, Modal } from "./ui";

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
          <button className="btn ghost" onClick={() => act.prOpen(d)}>
            <Icon name="external" size={14} /> ブラウザで開く
          </button>
          <span className="grow-space" />
          <button
            className="btn"
            onClick={async () => {
              onClose();
              await act.prCheckout(d);
            }}
          >
            <Icon name="branch" size={14} /> チェックアウト
          </button>
          <button
            className="btn primary"
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
      <div className="pr-meta">
        <span className={`pr-state ${d.isDraft ? "draft" : d.state.toLowerCase()}`}>
          {d.isDraft ? "Draft" : d.state}
        </span>
        <span className="mono">
          {d.headRefName} → {d.baseRefName}
        </span>
        {d.author?.login ? <span>{d.author.login}</span> : null}
        <span>{relativeTime(Math.floor(new Date(d.updatedAt).getTime() / 1000))}更新</span>
        {d.reviewDecision ? <span className="mini-pill">{d.reviewDecision}</span> : null}
        {typeof d.additions === "number" ? (
          <span className="fstats">
            <em className="add">+{d.additions}</em>
            <em className="del">-{d.deletions}</em>
          </span>
        ) : null}
      </div>
      {checks.length ? (
        <div className="pr-checks">
          {checks.slice(0, 12).map((c, i) => {
            const state = c.conclusion ?? c.state ?? c.status ?? "";
            const cls = /SUCCESS|NEUTRAL|SKIPPED/i.test(state)
              ? "pass"
              : /FAIL|ERROR|CANCEL|TIMED/i.test(state)
                ? "fail"
                : "pending";
            return (
              <span key={i} className={`check-chip ${cls}`} title={`${c.name ?? ""}: ${state}`}>
                <span className={`check-dot ${cls}`} />
                {c.name ?? state}
              </span>
            );
          })}
        </div>
      ) : null}
      <pre className="pr-body">{(d as PullRequest & { body?: string }).body?.trim() || "(本文なし)"}</pre>
    </Modal>
  );
}
