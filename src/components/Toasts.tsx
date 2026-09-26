import { useT } from "../i18n";
import { useStore } from "../state/store";
import { iconBtn } from "./classes";
import { CopyButton, Icon } from "./ui";

/** トーストの左端の線とアイコンの色を種類ごとに切り替える。 */
const TOAST_EDGE: Record<string, string> = {
  success: "border-l-green",
  error: "border-l-red",
  info: "border-l-accent",
};
const TOAST_ICON: Record<string, string> = {
  success: "text-green",
  error: "text-red",
  info: "text-accent",
};

export function Toasts() {
  const s = useStore();
  const m = useT().app;
  return (
    <div className="fixed right-4 bottom-9 z-90 flex max-w-130 flex-col gap-2.5">
      {s.toasts.map((t) => (
        <div
          key={t.id}
          className={`flex min-w-80 animate-toast-in cursor-pointer gap-3 rounded-lg border border-pop-line border-l-4 bg-pop px-4 py-3.5 shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${TOAST_EDGE[t.kind] ?? TOAST_EDGE.info}`}
          onClick={() => s.dismissToast(t.id)}
        >
          <Icon
            name={t.kind === "error" ? "x" : t.kind === "success" ? "check" : "commit"}
            size={18}
            className={`mt-px flex-none ${TOAST_ICON[t.kind] ?? TOAST_ICON.info}`}
          />
          <div className="min-w-0 flex-1">
            <strong className="text-[14px] font-[650]">{t.title}</strong>
            {t.detail ? (
              <pre className="mx-0 mt-1.5 mb-0 max-h-60 overflow-auto font-mono text-[12.5px] wrap-break-word whitespace-pre-wrap text-fg-dim">
                {t.detail}
              </pre>
            ) : null}
          </div>
          <CopyButton
            text={t.detail ? `${t.title}\n${t.detail}` : t.title}
            title={m.copyMessage}
            className={`${iconBtn({ tiny: true })} -mt-1 -mr-1.5 flex-none`}
          />
        </div>
      ))}
    </div>
  );
}
