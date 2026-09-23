import { useCallback, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWindowEvent } from "../lib/effects";
import { DialogCtx, MenuCtx, type DialogApi } from "./ui-context";
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
  copy: (
    <>
      <path d="M9 9h10.5v11.5H9z" />
      <path d="M5.5 15V3.5H16" />
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
        className="flex max-h-[82vh] flex-col overflow-hidden rounded-xl border border-line bg-bg-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
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
          <button className={iconBtn()} onClick={onClose} title="閉じる">
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
}

export interface FormSpec {
  title: string;
  description?: ReactNode;
  fields: FormField[];
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

function FormDialog({
  spec,
  resolve,
}: {
  spec: FormSpec;
  resolve: (v: FormResult | null) => void;
}) {
  const [values, setValues] = useState<FormResult>(() => {
    const init: FormResult = {};
    for (const f of spec.fields) init[f.name] = f.value ?? (f.type === "checkbox" ? false : "");
    return init;
  });
  const missing = spec.fields.some(
    (f) => f.required && f.type !== "checkbox" && !String(values[f.name] ?? "").trim(),
  );

  const submit = () => {
    if (missing) return;
    resolve(values);
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
          <button className={btn("ghost")} onClick={() => resolve(null)}>
            キャンセル
          </button>
          <button
            className={btn(spec.danger ? "danger" : "primary")}
            disabled={missing}
            onClick={submit}
          >
            {spec.submitLabel ?? "OK"}
          </button>
        </>
      }
    >
      {spec.description ? <p className={dialogDesc}>{spec.description}</p> : null}
      <div
        className="flex flex-col gap-3"
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
              {f.type === "textarea" ? (
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
                    <Icon name="folder" /> 選択
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
      </div>
    </Modal>
  );
}

function ConfirmDialog({ spec, resolve }: { spec: ConfirmSpec; resolve: (v: boolean) => void }) {
  return (
    <Modal
      title={spec.title}
      width={440}
      onClose={() => resolve(false)}
      footer={
        <>
          <button className={btn("ghost")} onClick={() => resolve(false)}>
            キャンセル
          </button>
          <button className={btn(spec.danger ? "danger" : "primary")} onClick={() => resolve(true)}>
            {spec.confirmLabel ?? "実行"}
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
  } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    spec: ConfirmSpec;
    resolve: (v: boolean) => void;
  } | null>(null);

  const apiValue: DialogApi = {
    form: (spec) => new Promise((resolve) => setFormState({ spec, resolve })),
    confirm: (spec) => new Promise((resolve) => setConfirmState({ spec, resolve })),
  };

  return (
    <DialogCtx.Provider value={apiValue}>
      {children}
      {formState ? (
        <FormDialog
          spec={formState.spec}
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
      className="inline-block animate-spinner rounded-full border-2 border-[rgba(255,255,255,0.18)] border-t-accent"
      style={{ width: size, height: size }}
    />
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
