import { useState } from "react";
import { useT } from "../i18n";
import { useInterval } from "../lib/effects";
import { appLogs, formatEntry, formatLogs, logTime, mergeLogs } from "../lib/log";
import { useStore } from "../state/store";
import { btn } from "./classes";
import { CopyButton, Icon, Modal } from "./ui";

/** 開いている間に Rust 側のコマンド履歴を取り直す間隔 */
const POLL_MS = 1500;

/**
 * デバッグ用のログ (Cmd+Shift+L)。
 * 実行した git / gh コマンドとアプリ側の出来事を新しい順に並べ、まとめてコピーできる。
 */
export function LogModal() {
  const s = useStore();
  const m = useT().logModal;
  const [errorsOnly, setErrorsOnly] = useState(false);
  useInterval(() => void s.reloadLogs(), POLL_MS);

  // フロント側のログは state ではないので、描画のたびに読み直す (ポーリングで再描画される)
  const all = mergeLogs(appLogs(), s.cmdLogs);
  const shown = errorsOnly ? all.filter((e) => e.level === "error") : all;
  const errors = all.filter((e) => e.level === "error").length;

  const header = () =>
    [
      `git-squid log (${new Date().toISOString()})`,
      `repo: ${s.dir || "-"}`,
      `userAgent: ${navigator.userAgent}`,
      "",
    ].join("\n");

  return (
    <Modal
      title={m.title}
      width={900}
      onClose={s.closeLogs}
      footer={
        <>
          <label className="mr-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-fg-dim">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => setErrorsOnly(e.target.checked)}
            />
            {m.errorsOnly(errors)}
          </label>
          <button className={btn("ghost")} onClick={() => void s.clearLogs()}>
            <Icon name="trash" size={13} />
            {m.clear}
          </button>
          <CopyButton
            text={() => header() + formatLogs(shown)}
            title={m.copyShown(shown.length)}
            className={btn("primary")}
            label={m.copyAll}
          />
        </>
      }
    >
      {shown.length === 0 ? (
        <p className="m-0 py-6 text-center text-[12.5px] text-fg-faint">{m.empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0 font-mono text-[11.5px]">
          {shown
            .slice()
            .reverse()
            .map((e, i) => (
              <li
                key={`${e.time}-${i}`}
                className="group flex items-start gap-2 border-b border-line-soft py-1.5 last:border-b-0"
              >
                <span className="flex-none text-fg-faint">{logTime(e.time)}</span>
                <span
                  className={`w-9 flex-none font-bold ${e.level === "error" ? "text-red" : "text-fg-faint"}`}
                >
                  {e.source === "cmd" ? "CMD" : "APP"}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={`wrap-break-word whitespace-pre-wrap ${e.level === "error" ? "text-red" : "text-fg"}`}
                  >
                    {e.title}
                  </div>
                  {e.detail ? (
                    <pre className="m-0 mt-0.5 max-h-40 overflow-auto wrap-break-word whitespace-pre-wrap text-fg-dim">
                      {e.detail}
                    </pre>
                  ) : null}
                </div>
                <span className="flex-none opacity-0 group-hover:opacity-100">
                  <CopyButton text={formatEntry(e)} title={m.copyLine} size={12} />
                </span>
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}
