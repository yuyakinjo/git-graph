import { useRef, useState } from "react";
import { generateRecomposePlan, type RecomposeRound } from "../lib/ai";
import { api } from "../lib/api";
import { recomposeBranchName } from "../lib/recompose";
import type { RecomposeContext, RecomposePlan } from "../lib/types";
import { useActions } from "../state/actions";
import { useStore } from "../state/store";
import { FSTATUS_COLOR, btn, dialogDesc, field, fieldInput, fieldLabel, hint } from "./classes";
import { Icon, Modal, Spinner } from "./ui";

const SECTION_H3 = "mx-0 mt-4 mb-1.5 text-[12px] font-semibold text-fg-dim";
const CHECK_ROW = "flex items-start gap-2 text-[12.5px] has-[input:not(:disabled)]:cursor-pointer";
const CHECKBOX = "mt-0.5 h-3.5 w-3.5 flex-none accent-accent";

type Busy = "context" | "plan" | null;

/**
 * recompose / compose のダイアログ。
 * ブランチを選ぶ → AI がコミットプランを立てる → コメントして再プラン (納得するまで) → 実行。
 * 実行は act.recomposeApply に渡し、ここでは git の状態を変えない。
 */
export function RecomposeModal({
  dir,
  initialBranch,
  onClose,
}: {
  dir: string;
  initialBranch: string;
  onClose: () => void;
}) {
  const s = useStore();
  const act = useActions();
  const defaultBranch = s.repo?.defaultBranch ?? "main";
  // compose (既定ブランチ) はチェックアウト中のときだけ。作業中の変更ごと切り出すため
  const options = s.branches.filter(
    (b) => b.kind === "local" && (b.name !== defaultBranch || b.isHead),
  );

  const [branch, setBranch] = useState(initialBranch);
  const [ctx, setCtx] = useState<RecomposeContext | null>(null);
  const [plan, setPlan] = useState<RecomposePlan | null>(null);
  const [rounds, setRounds] = useState<RecomposeRound[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [resetDefault, setResetDefault] = useState(true);
  /** 閉じた後やブランチを変えた後に届いた結果を捨てるための連番 */
  const seq = useRef(0);

  const selected = options.find((b) => b.name === branch);
  const compose = branch === defaultBranch;
  const mode = compose ? "compose" : "recompose";
  /** 別の worktree でチェックアウト中のブランチは消せない */
  const otherWorktree = selected && !selected.isHead ? selected.worktreePath : null;

  const reset = () => {
    seq.current++;
    setCtx(null);
    setPlan(null);
    setRounds([]);
    setError(null);
    setBusy(null);
    setNameEdited(false);
  };

  /** プランを立てる。`fresh` なら変更を集め直し、これまでのコメントも捨てる */
  const makePlan = async (nextRounds: RecomposeRound[], fresh = false) => {
    const id = ++seq.current;
    const stale = () => seq.current !== id;
    setError(null);
    try {
      let c = fresh ? null : ctx;
      if (!c) {
        setBusy("context");
        c = await api.recomposeContext(dir, branch);
        if (stale()) return;
        setCtx(c);
        setPlan(null);
        if (!c.files.length) throw new Error(`${c.baseRef} との分岐点から変更がありません`);
      }
      setBusy("plan");
      const next = await generateRecomposePlan(s.aiCliModel, c, nextRounds);
      if (stale()) return;
      setPlan(next);
      setRounds(nextRounds);
      setComment("");
      if (!nameEdited || fresh) {
        setNewBranch(c.compose ? (next.branch ?? "") : recomposeBranchName(c.branch));
        if (fresh) setNameEdited(false);
      }
    } catch (e) {
      if (!stale()) setError(String(e));
    } finally {
      if (!stale()) setBusy(null);
    }
  };

  const replan = () => {
    if (!plan || !comment.trim()) return;
    void makePlan([...rounds, { plan, comment: comment.trim() }]);
  };

  const canReset = Boolean(ctx?.compose && ctx.isHead && ctx.tip !== ctx.base);
  const ready = Boolean(ctx && plan && !busy && newBranch.trim());

  const execute = () => {
    if (!ctx || !plan || !ready) return;
    act.recomposeApply(dir, mode, {
      branch: ctx.branch,
      base: ctx.base,
      tip: ctx.tip,
      tree: ctx.tree,
      newBranch: newBranch.trim(),
      commits: plan.commits.map((c) => ({ message: c.message, paths: c.files })),
      deleteOriginal: !ctx.compose && !otherWorktree && deleteOriginal,
      resetDefault: canReset && resetDefault,
    });
  };

  const statusOf = new Map(ctx?.files.map((f) => [f.path, f]) ?? []);

  return (
    <Modal
      title={compose ? "compose: 変更を新しいブランチに切り出す" : "recompose: ブランチを整理"}
      width={720}
      onClose={() => {
        seq.current++;
        onClose();
      }}
      footer={
        <>
          <span className={`${hint} flex-1`}>
            中身は変えず、コミットだけを組み直します。コミットフックは実行されません。
          </span>
          <button className={btn("ghost")} onClick={onClose}>
            キャンセル
          </button>
          <button className={btn("primary")} disabled={!ready} onClick={execute}>
            <Icon name="layers" size={13} />
            このプランで実行
          </button>
        </>
      }
    >
      <p className={dialogDesc}>
        {compose
          ? `${defaultBranch} 上の未プッシュのコミットと作業中の変更を、AI がまとまりのある単位のコミットに分け、新しいブランチに積みます。`
          : `ブランチの変更 (チェックアウト中なら未コミットの変更も) を AI がまとまりのある単位のコミットに組み直し、新しいブランチに積みます。`}
      </p>

      {/* 1. ブランチ */}
      <div className="flex items-center gap-2">
        <select
          className="h-[30px] min-w-0 flex-1 rounded-md border border-line bg-bg-1 px-[9px] font-mono text-[12.5px] text-fg outline-none focus:border-accent"
          aria-label="ブランチ"
          value={branch}
          disabled={Boolean(busy)}
          onChange={(e) => {
            setBranch(e.target.value);
            reset();
          }}
        >
          {options.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.isHead ? " (チェックアウト中)" : ""}
            </option>
          ))}
        </select>
        <button
          className={btn(plan ? "default" : "primary")}
          disabled={Boolean(busy) || !selected}
          onClick={() => {
            setRounds([]);
            void makePlan([], true);
          }}
          title={plan ? "変更を集め直し、コメントを捨てて最初から立て直す" : undefined}
        >
          <Icon name="sparkle" size={13} />
          {plan ? "最初から作り直す" : "プランを作成"}
        </button>
      </div>
      {otherWorktree ? (
        <p className={`${hint} mt-1.5 mb-0`}>
          {otherWorktree} でチェックアウト中のため、そこの未コミットの変更は含まれません。
        </p>
      ) : null}

      {ctx ? (
        <p className={`${hint} mt-2 mb-0`}>
          {ctx.baseRef} との分岐点 <span className="font-mono">{ctx.base.slice(0, 7)}</span> から{" "}
          {ctx.files.length} ファイル / 既存のコミット {ctx.commits.length} 件
          {ctx.includesWorktree ? " + 未コミットの変更" : ""}
          {ctx.truncated ? " (差分が大きいため一部だけを AI に渡しています)" : ""}
        </p>
      ) : null}

      {busy ? (
        <div className="flex items-center gap-2 py-6 text-[12.5px] text-fg-dim">
          <Spinner />
          {busy === "context"
            ? "変更を集めています…"
            : "Claude Code がコミットプランを作成しています…"}
        </div>
      ) : null}

      {error ? (
        <pre className="mt-3 mb-0 rounded-md border border-red-45 bg-red-15 px-2.5 py-2 text-[12px] whitespace-pre-wrap text-red">
          {error}
        </pre>
      ) : null}

      {/* 2. プラン */}
      {plan && ctx && !busy ? (
        <>
          <h3 className={SECTION_H3}>
            コミットプラン ({plan.commits.length} 件)
            {rounds.length ? <span className={hint}> ・ 再プラン {rounds.length} 回目</span> : null}
          </h3>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {plan.commits.map((c, i) => {
              const [subject, ...body] = c.message.split("\n");
              return (
                <li key={i} className="rounded-md border border-line bg-bg-1 px-2.5 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-none font-mono text-[11px] text-fg-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold break-words text-fg">
                      {subject}
                    </span>
                  </div>
                  {body.join("\n").trim() ? (
                    <p className="mt-1 mb-0 ml-4 text-[12px] whitespace-pre-wrap text-fg-dim">
                      {body.join("\n").trim()}
                    </p>
                  ) : null}
                  <ul className="m-0 mt-1.5 ml-4 list-none p-0">
                    {c.files.map((path) => {
                      const f = statusOf.get(path);
                      return (
                        <li key={path} className="flex gap-2 font-mono text-[11.5px]">
                          <span
                            className={`w-3 flex-none font-bold ${FSTATUS_COLOR[f?.status ?? ""] ?? "text-fg-faint"}`}
                          >
                            {f?.status ?? "?"}
                          </span>
                          <span className="min-w-0 break-all text-fg-dim">
                            {f?.origPath ? `${f.origPath} → ` : ""}
                            {path}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>

          {/* 3. コメントして再プラン */}
          <h3 className={SECTION_H3}>修正したいところがあればコメント</h3>
          <textarea
            className={`${fieldInput} resize-y text-[12.5px]`}
            rows={2}
            value={comment}
            placeholder="例: テストは対応する機能のコミットにまとめて / メッセージは英語で"
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                replan();
              }
            }}
          />
          <div className="mt-1.5 flex justify-end">
            <button
              className={btn("default", "tiny")}
              disabled={!comment.trim()}
              onClick={replan}
              title="⌘Enter"
            >
              <Icon name="sparkle" size={11} />
              コメントして再プラン
            </button>
          </div>

          {/* 4. 実行の設定 */}
          <h3 className={SECTION_H3}>実行</h3>
          <label className={field}>
            <span className={fieldLabel}>新しいブランチ名{ctx.compose ? " (AI の提案)" : ""}</span>
            <input
              className={`${fieldInput} font-mono text-[12.5px]`}
              value={newBranch}
              spellCheck={false}
              onChange={(e) => {
                setNewBranch(e.target.value);
                setNameEdited(true);
              }}
            />
          </label>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {ctx.compose ? (
              canReset ? (
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={resetDefault}
                    onChange={(e) => setResetDefault(e.target.checked)}
                  />
                  <span>
                    {ctx.branch} を {ctx.baseRef} との分岐点に戻す
                    <em className={`${hint} block`}>
                      切り出した未プッシュのコミットを {ctx.branch} から取り除きます
                    </em>
                  </span>
                </label>
              ) : null
            ) : (
              <label className={CHECK_ROW}>
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={deleteOriginal && !otherWorktree}
                  disabled={Boolean(otherWorktree)}
                  onChange={(e) => setDeleteOriginal(e.target.checked)}
                />
                <span>
                  recompose 後に元のローカルブランチ {ctx.branch} を削除
                  <em className={`${hint} block`}>
                    {otherWorktree
                      ? "別の worktree でチェックアウト中のため削除できません"
                      : "リモートのブランチには触れません"}
                  </em>
                </span>
              </label>
            )}
            {ctx.isHead ? (
              <p className={`${hint} m-0`}>
                実行後は {newBranch.trim() || "新しいブランチ"} に切り替わります。
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
