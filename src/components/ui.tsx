import { useCallback, useRef, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useT } from "../i18n";
import { useWindowEvent } from "../lib/effects";
import { DialogCtx, MenuCtx, type DialogApi } from "./ui-context";
import { Markdown } from "./Markdown";
import {
  btn,
  ctxBackdrop,
  ctxIconGap,
  ctxItem,
  ctxMenu,
  ctxSep,
  dialogDesc,
  field,
  fieldInput,
  fieldLabel,
  hint,
  iconBtn,
} from "./classes";

/**
 * 中に何も focus が無ければ自分に focus する ref コールバック。
 * モジュール階層に置いて同一性を固定しているので mount 時に一度だけ走る。
 */
function focusIfEmpty(el: HTMLElement | null) {
  if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
}

/** 最初のフィールドに focus する ref コールバック。 */
function focusField(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) return;
  el.focus();
  if (el instanceof HTMLInputElement) el.select();
}

// ------------------------------------------------------------------ アイコン

const PATHS: Record<string, ReactNode> = {
  pull: (
    <>
      <path d="M12 3v11" />
      <path d="M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 19h16" />
    </>
  ),
  push: (
    <>
      <path d="M12 21V10" />
      <path d="M7.5 14.5 12 10l4.5 4.5" />
      <path d="M4 5h16" />
    </>
  ),
  fetch: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5v4h-4" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="17.5" cy="7.5" r="2.2" />
      <path d="M6 7.2v9.6" />
      <path d="M15.7 9.2c-1.6 3.4-9.7 2.1-9.7 7.6" />
    </>
  ),
  stash: (
    <>
      <path d="M3.5 7.5h17v3.5h-17z" />
      <path d="M5.5 11v8.5h13V11" />
      <path d="M10 15h4" />
    </>
  ),
  commit: (
    <>
      <circle cx="12" cy="12" r="3.3" />
      <path d="M3 12h5.7" />
      <path d="M15.3 12H21" />
    </>
  ),
  tag: (
    <>
      <path d="M12.5 3.5H6A2.5 2.5 0 0 0 3.5 6v6.5l9 9 9-9-9-9z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  pr: (
    <>
      <circle cx="6.5" cy="5.5" r="2.2" />
      <circle cx="6.5" cy="18.5" r="2.2" />
      <circle cx="17.5" cy="18.5" r="2.2" />
      <path d="M6.5 7.7v8.6" />
      <path d="M17.5 16.3V9.5A2.5 2.5 0 0 0 15 7h-3" />
      <path d="M14 4.5 11.5 7 14 9.5" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7a2 2 0 0 1 2-2h3.7l2 2h7.3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: (
    <>
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M6.5 7l1 12.2h9L17.5 7" />
    </>
  ),
  check: (
    <>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </>
  ),
  x: (
    <>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </>
  ),
  chevronRight: (
    <>
      <path d="M9.5 6l6 6-6 6" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M6 9.5l6 6 6-6" />
    </>
  ),
  chevronUp: (
    <>
      <path d="M6 14.5l6-6 6 6" />
    </>
  ),
  bolt: <path d="M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5l1-8z" />,
  dots: (
    <>
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.2 16.2 21 21" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V8.5A1.5 1.5 0 0 1 6 7h4.5" />
    </>
  ),
  worktree: (
    <>
      <path d="M12 3l8.5 4.7-8.5 4.7L3.5 7.7z" />
      <path d="M3.5 12.8 12 17.5l8.5-4.7" />
      <path d="M3.5 17.3 12 22l8.5-4.7" />
    </>
  ),
  /** ほうき (tidy) */
  sweep: (
    <>
      <path d="M19.5 3.5 12 11" />
      <path d="M9.5 9.5 14.5 14.5" />
      <path d="M9.5 9.5C6.5 10 4.5 12.5 3.5 20.5c8-1 10.5-3 11-6" />
      <path d="M7 17.5l2-2" />
    </>
  ),
  /** 積み直し (recompose) */
  layers: (
    <>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8z" />
      <path d="M3.5 12 12 16.5 20.5 12" />
      <path d="M3.5 16 12 20.5 20.5 16" />
    </>
  ),
  copy: (
    <>
      <path d="M9 9h10.5v11.5H9z" />
      <path d="M5.5 15V3.5H16" />
    </>
  ),
  /** ターミナル (ログ) */
  log: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 9.5l2.5 2.5-2.5 2.5" />
      <path d="M12.5 15h4" />
    </>
  ),
  remote: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.6 2.6 14.4 0 17" />
      <path d="M12 3.5c-2.6 2.6-2.6 14.4 0 17" />
    </>
  ),
  repo: (
    <>
      <path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" />
      <path d="M5 17.5h13" />
    </>
  ),
  file: (
    <>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
      <path d="M13.5 3.5V8.5h5" />
    </>
  ),
  /** きらめき (AI 生成) */
  sparkle: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  pencil: (
    <>
      <path d="M15.5 5.5l3 3" />
      <path d="M4.5 19.5l1-4.2L16.3 4.5a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L8.7 18.5z" />
    </>
  ),
  amend: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5v4h-4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  merge: (
    <>
      <circle cx="6.5" cy="5.5" r="2.2" />
      <circle cx="6.5" cy="18.5" r="2.2" />
      <circle cx="17.5" cy="9" r="2.2" />
      <path d="M6.5 7.7v8.6" />
      <path d="M15.4 10.6c-1.5 3.2-8.9 2-8.9 7.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" />
    </>
  ),
  columns: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
      <path d="M15.5 4.5v15" />
    </>
  ),
  /** GitHub のマークだけ塗りつぶしなので、既定の stroke を打ち消す */
  github: (
    <g transform="scale(1.5)" fill="currentColor" stroke="none">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </g>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

// ------------------------------------------------------------------ コピーボタン

/**
 * 押すとクリップボードへコピーし、少しの間チェックマークに変わるアイコンボタン。
 * text は押した時点で評価したいもの (ログ全体など) のために関数でも渡せる。
 */
export function CopyButton({
  text,
  title,
  size = 13,
  className,
  label,
}: {
  text: string | (() => string);
  title?: string;
  size?: number;
  className?: string;
  /** アイコンの横に出す文言 (ボタン型で使うとき) */
  label?: ReactNode;
}) {
  const m = useT();
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(typeof text === "function" ? text() : text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  };
  return (
    <button
      className={className ?? iconBtn({ tiny: true })}
      title={copied ? m.ui.copied : (title ?? m.ui.copyToClipboard)}
      onClick={copy}
    >
      <Icon name={copied ? "check" : "copy"} size={size} className={copied ? "text-green" : ""} />
      {label}
    </button>
  );
}

// ------------------------------------------------------------------ Modal

export function Modal({
  title,
  children,
  onClose,
  footer,
  width = 520,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
}) {
  const m = useT();
  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center bg-scrim pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[82vh] flex-col overflow-hidden rounded-xl border border-line bg-bg-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)] outline-none"
        style={{ width }}
        tabIndex={-1}
        ref={focusIfEmpty}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
          <h2 className="m-0 flex-1 overflow-hidden text-[14px] font-[650] text-ellipsis whitespace-nowrap">
            {title}
          </h2>
          <button className={iconBtn()} onClick={onClose} title={m.ui.close}>
            <Icon name="x" />
          </button>
        </header>
        <div className="overflow-auto p-3.5">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-bg-1 px-3.5 py-2.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 汎用フォームダイアログ

export type FieldType = "text" | "textarea" | "select" | "checkbox" | "dirpath";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  value?: string | boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  mono?: boolean;
  rows?: number;
  /** textarea の上に「書く / プレビュー」タブを出し、GitHub 互換の Markdown で確認できるようにする */
  markdown?: boolean;
}

/** フッター左に置く補助ボタン。返した値で入力欄を上書きする (AI 生成など) */
export interface FormAction {
  label: string;
  busyLabel?: string;
  icon?: string;
  title?: string;
  /** ダイアログを開くと同時に 1 度実行する (AI で生成してから確認させるときなど) */
  autoRun?: boolean;
  run: (values: FormResult) => Promise<Partial<FormResult> | void>;
}

export interface FormSpec {
  title: string;
  description?: ReactNode;
  fields: FormField[];
  action?: FormAction;
  submitLabel?: string;
  danger?: boolean;
  width?: number;
}

export interface ConfirmSpec {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

export type FormResult = Record<string, string | boolean>;

const initialValues = (spec: FormSpec): FormResult => {
  const init: FormResult = {};
  for (const f of spec.fields) init[f.name] = f.value ?? (f.type === "checkbox" ? false : "");
  return init;
};

function FormDialog({
  spec,
  resolve,
  autoBusy = false,
  autoPatch,
}: {
  spec: FormSpec;
  resolve: (v: FormResult | null) => void;
  /** autoRun の実行中か。autoRun は開く側 (DialogProvider) が始める */
  autoBusy?: boolean;
  /** autoRun の結果。届いたら入力欄を上書きする */
  autoPatch?: Partial<FormResult>;
}) {
  const [values, setValues] = useState<FormResult>(() => initialValues(spec));
  // autoRun の結果が届いたら 1 度だけ反映する (描画中の state 調整。effect は使わない)
  const [appliedPatch, setAppliedPatch] = useState(autoPatch);
  if (autoPatch !== appliedPatch) {
    setAppliedPatch(autoPatch);
    if (autoPatch) setValues((v) => ({ ...v, ...(autoPatch as FormResult) }));
  }
  const missing = spec.fields.some(
    (f) => f.required && f.type !== "checkbox" && !String(values[f.name] ?? "").trim(),
  );
  const action = spec.action;
  const [actionBusy, setActionBusy] = useState(false);
  const busy = actionBusy || autoBusy;
  const m = useT();

  const submit = () => {
    if (missing || busy) return;
    resolve(values);
  };

  const runAction = async (action: FormAction) => {
    if (busy) return;
    setActionBusy(true);
    try {
      const patch = await action.run(values);
      if (patch) setValues((v) => ({ ...v, ...(patch as FormResult) }));
    } finally {
      setActionBusy(false);
    }
  };

  const pickDir = async (name: string) => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") setValues((v) => ({ ...v, [name]: picked }));
  };

  return (
    <Modal
      title={spec.title}
      width={spec.width ?? 520}
      onClose={() => resolve(null)}
      footer={
        <>
          {action ? (
            <>
              <button
                className={btn("ghost")}
                title={action.title}
                disabled={busy}
                onClick={() => void runAction(action)}
              >
                {busy ? <Spinner /> : action.icon ? <Icon name={action.icon} size={14} /> : null}
                {busy ? (action.busyLabel ?? action.label) : action.label}
              </button>
              <span className="flex-1" />
            </>
          ) : null}
          <button className={btn("ghost")} onClick={() => resolve(null)}>
            {m.ui.cancel}
          </button>
          <button
            className={btn(spec.danger ? "danger" : "primary")}
            disabled={missing || busy}
            onClick={submit}
          >
            {spec.submitLabel ?? m.ui.ok}
          </button>
        </>
      }
    >
      {spec.description ? <p className={dialogDesc}>{spec.description}</p> : null}
      {/* 補助アクション (AI 生成など) の実行中は結果で上書きされるため、入力欄をまとめて無効にする */}
      <fieldset
        disabled={busy}
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0 disabled:cursor-default disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        {spec.fields.map((f, i) => {
          const common = { id: `f-${f.name}` };
          if (f.type === "checkbox") {
            return (
              <label
                key={f.name}
                className="flex cursor-pointer items-center gap-1.75 text-[12.5px] text-fg"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-accent"
                  checked={Boolean(values[f.name])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                />
                <span>{f.label}</span>
                {f.hint ? <em className={hint}>{f.hint}</em> : null}
              </label>
            );
          }
          return (
            <div key={f.name} className={field}>
              <label className={fieldLabel} htmlFor={common.id}>
                {f.label}
                {f.required ? <span className="ml-0.75 text-red">*</span> : null}
              </label>
              {f.type === "textarea" && f.markdown ? (
                <MarkdownTextarea
                  id={common.id}
                  field={f}
                  autoFocus={i === 0}
                  value={String(values[f.name] ?? "")}
                  onChange={(value) => setValues((v) => ({ ...v, [f.name]: value }))}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  {...common}
                  ref={i === 0 ? focusField : undefined}
                  rows={f.rows ?? 6}
                  className={`${fieldInput} ${f.mono ? "font-mono text-[12px]" : "font-sans text-[12.5px]"}`}
                  placeholder={f.placeholder}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : f.type === "select" ? (
                <select
                  {...common}
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "dirpath" ? (
                <div className="flex gap-2">
                  <input
                    {...common}
                    ref={i === 0 ? focusField : undefined}
                    className={`${fieldInput} font-mono text-[12px]`}
                    placeholder={f.placeholder}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                  <button className={btn("ghost")} onClick={() => pickDir(f.name)}>
                    <Icon name="folder" /> {m.ui.choose}
                  </button>
                </div>
              ) : (
                <input
                  {...common}
                  ref={i === 0 ? focusField : undefined}
                  className={`${fieldInput} ${f.mono ? "font-mono text-[12px]" : "font-sans text-[12.5px]"}`}
                  placeholder={f.placeholder}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
              {f.hint ? <em className={hint}>{f.hint}</em> : null}
            </div>
          );
        })}
      </fieldset>
    </Modal>
  );
}

const MD_TABS = ["write", "preview"] as const;

/** GitHub のコメント欄と同じく、入力欄の上のタブで Markdown のプレビューに切り替える */
function MarkdownTextarea({
  id,
  field: f,
  autoFocus,
  value,
  onChange,
}: {
  id: string;
  field: FormField;
  autoFocus: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<(typeof MD_TABS)[number]>("write");
  const m = useT();
  // プレビューに切り替えても枠の高さが縮まないよう、直前の textarea の高さを引き継ぐ
  const [height, setHeight] = useState<number>();
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const attach = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textarea.current = el;
      if (autoFocus) focusField(el);
    },
    [autoFocus],
  );

  const select = (next: typeof tab) => {
    if (next === tab) return;
    if (next === "preview" && textarea.current) setHeight(textarea.current.offsetHeight);
    setTab(next);
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-bg-1 focus-within:border-accent">
      <div className="flex gap-1 border-b border-line bg-bg-2 px-1.5" role="tablist">
        {MD_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-1.5 text-[12px] ${
              tab === id
                ? "border-accent font-[650] text-fg"
                : "border-transparent text-fg-dim hover:text-fg"
            }`}
            onClick={() => select(id)}
          >
            {m.ui.mdTabs[id]}
          </button>
        ))}
      </div>
      {tab === "write" ? (
        <textarea
          id={id}
          ref={attach}
          rows={f.rows ?? 6}
          className={`block w-full resize-y border-0 bg-transparent px-2.25 py-1.75 text-fg outline-none ${f.mono ? "font-mono text-[12px]" : "font-sans text-[12.5px]"}`}
          style={height ? { height } : undefined}
          placeholder={f.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div role="tabpanel" className="overflow-auto px-3 py-2.5" style={{ height }}>
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <p className="m-0 text-[12.5px] text-fg-faint">{m.ui.nothingToPreview}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ spec, resolve }: { spec: ConfirmSpec; resolve: (v: boolean) => void }) {
  const m = useT();
  return (
    <Modal
      title={spec.title}
      width={440}
      onClose={() => resolve(false)}
      footer={
        <>
          <button className={btn("ghost")} onClick={() => resolve(false)}>
            {m.ui.cancel}
          </button>
          <button className={btn(spec.danger ? "danger" : "primary")} onClick={() => resolve(true)}>
            {spec.confirmLabel ?? m.ui.run}
          </button>
        </>
      }
    >
      <div className="text-[13px] leading-[1.6] wrap-break-word text-fg">{spec.message}</div>
    </Modal>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [formState, setFormState] = useState<{
    spec: FormSpec;
    resolve: (v: FormResult | null) => void;
    autoBusy?: boolean;
    autoPatch?: Partial<FormResult>;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    spec: ConfirmSpec;
    resolve: (v: boolean) => void;
  } | null>(null);

  const apiValue: DialogApi = {
    form: (spec) =>
      new Promise((resolve) => {
        const auto = spec.action?.autoRun ? spec.action : null;
        setFormState({ spec, resolve, autoBusy: Boolean(auto) });
        if (!auto) return;
        // 閉じた・別のフォームに替わったあとに届いた結果は捨てる
        const settle = (patch?: Partial<FormResult> | void) =>
          setFormState((st) =>
            st?.spec === spec ? { ...st, autoBusy: false, autoPatch: patch || undefined } : st,
          );
        auto.run(initialValues(spec)).then(settle, () => settle());
      }),
    confirm: (spec) => new Promise((resolve) => setConfirmState({ spec, resolve })),
    open: formState !== null || confirmState !== null,
  };

  return (
    <DialogCtx.Provider value={apiValue}>
      {children}
      {formState ? (
        <FormDialog
          spec={formState.spec}
          autoBusy={formState.autoBusy}
          autoPatch={formState.autoPatch}
          resolve={(v) => {
            formState.resolve(v);
            setFormState(null);
          }}
        />
      ) : null}
      {confirmState ? (
        <ConfirmDialog
          spec={confirmState.spec}
          resolve={(v) => {
            confirmState.resolve(v);
            setConfirmState(null);
          }}
        />
      ) : null}
    </DialogCtx.Provider>
  );
}

// ------------------------------------------------------------------ コンテキストメニュー

export interface MenuItem {
  label?: string;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const openMenu = useCallback((e: { clientX: number; clientY: number }, items: MenuItem[]) => {
    setMenu({ x: e.clientX, y: e.clientY, items: items.filter(Boolean) });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  // リサイズすると座標がずれるので閉じる (外側クリックと Escape は背面要素が処理する)
  useWindowEvent("resize", () => setMenu((m) => (m ? null : m)));

  const items = menu?.items ?? [];
  const height = items.length * 28 + 12;
  const top = menu ? Math.min(menu.y, window.innerHeight - height - 8) : 0;
  const left = menu ? Math.min(menu.x, window.innerWidth - 240) : 0;

  return (
    <MenuCtx.Provider value={openMenu}>
      {children}
      {menu ? (
        <div
          className={ctxBackdrop}
          tabIndex={-1}
          ref={focusIfEmpty}
          onMouseDown={close}
          onContextMenu={(e) => {
            e.preventDefault();
            close();
          }}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div className={ctxMenu} style={{ top, left }} onMouseDown={(e) => e.stopPropagation()}>
            {items.map((it, i) =>
              it.separator ? (
                <div key={i} className={ctxSep} />
              ) : (
                <button
                  key={i}
                  className={ctxItem(it.danger)}
                  disabled={it.disabled}
                  onClick={() => {
                    close();
                    it.onClick?.();
                  }}
                >
                  {it.icon ? <Icon name={it.icon} size={14} /> : <span className={ctxIconGap} />}
                  <span>{it.label}</span>
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </MenuCtx.Provider>
  );
}

// ------------------------------------------------------------------ 小物

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spinner rounded-full border-2 border-bg-4 border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}

/** git 操作中にウィンドウ上端を流れる細いバー。 */
export function ProgressBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 animate-veil-in overflow-hidden">
      <div className="h-full w-[30%] animate-progress bg-linear-to-r from-transparent via-accent to-transparent" />
    </div>
  );
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-[9px] border border-line px-1.75 py-px text-[11px] text-fg-dim"
      style={color ? { borderColor: color, color } : undefined}
    >
      {children}
    </span>
  );
}
