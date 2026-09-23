import { useState } from "react";
import type { TidyItem, TidyPlan } from "../lib/types";
import { useActions } from "../state/actions";
import { btn, dialogDesc, dim, hint, miniPill } from "./classes";
import { Icon, Modal } from "./ui";

const SECTION_H3 = "mx-0 mt-3 mb-1 text-[12px] font-semibold text-fg-dim first:mt-0";
const ROW =
  "flex items-start gap-2 rounded-md px-1.5 py-1 text-[12.5px] has-[input:not(:disabled)]:cursor-pointer has-[input:not(:disabled)]:hover:bg-bg-3";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

const keyOf = (it: TidyItem) => `${it.kind}:${it.target}`;

const nameOf = (it: TidyItem) =>
  it.kind === "branch" || it.kind === "fastForward"
    ? it.target
    : `${shortPath(it.target)}${it.branch ? ` (${it.branch})` : ""}`;

/**
 * `my git tidy` 相当の整理ダイアログ。判定は開く側 (act.tidy) が済ませて plan として渡す。
 * 削除候補は最初から選択済みで、外したものは消さない。
 */
export function TidyModal({
  dir,
  plan,
  onClose,
}: {
  dir: string;
  plan: TidyPlan;
  onClose: () => void;
}) {
  const act = useActions();
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(plan.items.filter((it) => it.remove).map(keyOf)),
  );

  const findWorktree = (path: string) =>
    plan.items.find((it) => it.target === path && (it.kind === "worktree" || it.kind === "prune"));
  /** 先に消すべき worktree を外したブランチは消せない */
  const blocked = (it: TidyItem) => {
    if (!it.requires) return false;
    const wt = findWorktree(it.requires);
    return !wt || !picked.has(keyOf(wt));
  };
  const isOn = (it: TidyItem) => picked.has(keyOf(it)) && !blocked(it);

  const toggle = (it: TidyItem) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(keyOf(it))) next.delete(keyOf(it));
      else next.add(keyOf(it));
      return next;
    });

  const candidates = plan.items.filter((it) => it.remove);
  const kept = plan.items.filter((it) => !it.remove);
  const chosen = candidates.filter(isOn);
  const groups: { title: string; items: TidyItem[] }[] = [
    { title: `${plan.main} を早送り`, items: candidates.filter((it) => it.kind === "fastForward") },
    {
      title: "削除する worktree",
      items: candidates.filter((it) => it.kind === "worktree" || it.kind === "prune"),
    },
    { title: "削除するブランチ", items: candidates.filter((it) => it.kind === "branch") },
  ];

  return (
    <Modal
      title="ブランチと worktree を整理"
      width={620}
      onClose={onClose}
      footer={
        <>
          <span className={`${hint} flex-1`}>
            消すのは選んだものだけです。判定後に動いたブランチ / worktree は消しません。
          </span>
          <button className={btn("ghost")} onClick={onClose}>
            キャンセル
          </button>
          <button
            className={btn("danger")}
            disabled={chosen.length === 0}
            onClick={() => act.tidyApply(dir, chosen)}
          >
            {chosen.length} 件を整理
          </button>
        </>
      }
    >
      <p className={dialogDesc}>
        {plan.upstream} への取り込みと、マージ済み PR の head (SHA まで一致するもの)
        を基準に判定しました。
      </p>
      {plan.ghNote ? (
        <p className={`${dialogDesc} text-amber`}>
          <Icon name="github" size={12} /> {plan.ghNote}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <p className="m-0 py-3 text-center text-[13px] text-fg-dim">整理するものはありません</p>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.title}>
              <h3 className={SECTION_H3}>{g.title}</h3>
              {g.items.map((it) => {
                const isBlocked = blocked(it);
                return (
                  <label key={keyOf(it)} className={ROW}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 flex-none accent-accent"
                      checked={isOn(it)}
                      disabled={isBlocked}
                      onChange={() => toggle(it)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12px] break-all text-fg">
                        {nameOf(it)}
                      </span>
                      <em className={hint}>
                        {isBlocked
                          ? `${shortPath(it.requires ?? "")} を残すため削除できません`
                          : it.requires
                            ? `${it.reason} / worktree ${shortPath(it.requires)} の削除後に消します`
                            : it.reason}
                      </em>
                    </span>
                    {it.prNumber ? (
                      <span className={miniPill()}>
                        <Icon name="pr" size={10} />#{it.prNumber}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </section>
          ))
      )}

      {kept.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-semibold text-fg-dim">
            残すもの ({kept.length})
          </summary>
          <ul className="m-0 mt-1 list-none p-0">
            {kept.map((it) => (
              <li key={keyOf(it)} className="flex gap-2 px-1.5 py-0.5 text-[12px]">
                <span className="min-w-0 flex-1 font-mono break-all text-fg-dim">
                  {it.kind === "branch" ? "" : "worktree "}
                  {nameOf(it)}
                </span>
                <em className={dim}>{it.reason}</em>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Modal>
  );
}
