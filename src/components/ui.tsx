import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWindowEvent } from "../lib/effects";

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
  pull: <><path d="M12 3v11" /><path d="M7.5 9.5 12 14l4.5-4.5" /><path d="M4 19h16" /></>,
  push: <><path d="M12 21V10" /><path d="M7.5 14.5 12 10l4.5 4.5" /><path d="M4 5h16" /></>,
  fetch: <><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 4.5v4h-4" /></>,
  branch: <><circle cx="6" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="17.5" cy="7.5" r="2.2" /><path d="M6 7.2v9.6" /><path d="M15.7 9.2c-1.6 3.4-9.7 2.1-9.7 7.6" /></>,
  stash: <><path d="M3.5 7.5h17v3.5h-17z" /><path d="M5.5 11v8.5h13V11" /><path d="M10 15h4" /></>,
  commit: <><circle cx="12" cy="12" r="3.3" /><path d="M3 12h5.7" /><path d="M15.3 12H21" /></>,
  tag: <><path d="M12.5 3.5H6A2.5 2.5 0 0 0 3.5 6v6.5l9 9 9-9-9-9z" /><circle cx="8" cy="8" r="1.3" /></>,
  pr: <><circle cx="6.5" cy="5.5" r="2.2" /><circle cx="6.5" cy="18.5" r="2.2" /><circle cx="17.5" cy="18.5" r="2.2" /><path d="M6.5 7.7v8.6" /><path d="M17.5 16.3V9.5A2.5 2.5 0 0 0 15 7h-3" /><path d="M14 4.5 11.5 7 14 9.5" /></>,
  folder: <><path d="M3.5 7a2 2 0 0 1 2-2h3.7l2 2h7.3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  trash: <><path d="M4 7h16" /><path d="M9.5 7V4.8h5V7" /><path d="M6.5 7l1 12.2h9L17.5 7" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  x: <><path d="M6.5 6.5l11 11" /><path d="M17.5 6.5l-11 11" /></>,
  chevronRight: <><path d="M9.5 6l6 6-6 6" /></>,
  chevronDown: <><path d="M6 9.5l6 6 6-6" /></>,
  dots: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16.2 16.2 21 21" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-8.5 8.5" /><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V8.5A1.5 1.5 0 0 1 6 7h4.5" /></>,
  worktree: <><path d="M12 3l8.5 4.7-8.5 4.7L3.5 7.7z" /><path d="M3.5 12.8 12 17.5l8.5-4.7" /><path d="M3.5 17.3 12 22l8.5-4.7" /></>,
  copy: <><path d="M9 9h10.5v11.5H9z" /><path d="M5.5 15V3.5H16" /></>,
  remote: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.6 2.6 2.6 14.4 0 17" /><path d="M12 3.5c-2.6 2.6-2.6 14.4 0 17" /></>,
  repo: <><path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" /><path d="M5 17.5h13" /></>,
  file: <><path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" /><path d="M13.5 3.5V8.5h5" /></>,
  amend: <><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 4.5v4h-4" /><path d="M12 8v4l3 2" /></>,
  merge: <><circle cx="6.5" cy="5.5" r="2.2" /><circle cx="6.5" cy="18.5" r="2.2" /><circle cx="17.5" cy="9" r="2.2" /><path d="M6.5 7.7v8.6" /><path d="M15.4 10.6c-1.5 3.2-8.9 2-8.9 7.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></>,
  columns: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15" /><path d="M15.5 4.5v15" /></>,
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
      className="modal-backdrop"
      onMouseDown={onClose}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal"
        style={{ width }}
        tabIndex={-1}
        ref={focusIfEmpty}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="閉じる">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
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

interface DialogApi {
  form: (spec: FormSpec) => Promise<FormResult | null>;
  confirm: (spec: ConfirmSpec) => Promise<boolean>;
}

const DialogCtx = createContext<DialogApi | null>(null);
export const useDialogs = () => {
  const v = useContext(DialogCtx);
  if (!v) throw new Error("DialogProvider が必要です");
  return v;
};

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
          <button className="btn ghost" onClick={() => resolve(null)}>
            キャンセル
          </button>
          <button
            className={`btn ${spec.danger ? "danger" : "primary"}`}
            disabled={missing}
            onClick={submit}
          >
            {spec.submitLabel ?? "OK"}
          </button>
        </>
      }
    >
      {spec.description ? <p className="dialog-desc">{spec.description}</p> : null}
      <div
        className="form"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        {spec.fields.map((f, i) => {
          const common = { id: `f-${f.name}` };
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className="check">
                <input
                  type="checkbox"
                  checked={Boolean(values[f.name])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                />
                <span>{f.label}</span>
                {f.hint ? <em className="hint">{f.hint}</em> : null}
              </label>
            );
          }
          return (
            <div key={f.name} className="field">
              <label htmlFor={common.id}>
                {f.label}
                {f.required ? <span className="req">*</span> : null}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  {...common}
                  ref={i === 0 ? focusField : undefined}
                  rows={f.rows ?? 6}
                  className={f.mono ? "mono" : undefined}
                  placeholder={f.placeholder}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : f.type === "select" ? (
                <select
                  {...common}
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
                <div className="row">
                  <input
                    {...common}
                    ref={i === 0 ? focusField : undefined}
                    className="mono"
                    placeholder={f.placeholder}
                    value={String(values[f.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                  <button className="btn ghost" onClick={() => pickDir(f.name)}>
                    <Icon name="folder" /> 選択
                  </button>
                </div>
              ) : (
                <input
                  {...common}
                  ref={i === 0 ? focusField : undefined}
                  className={f.mono ? "mono" : undefined}
                  placeholder={f.placeholder}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
              {f.hint ? <em className="hint">{f.hint}</em> : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  spec,
  resolve,
}: {
  spec: ConfirmSpec;
  resolve: (v: boolean) => void;
}) {
  return (
    <Modal
      title={spec.title}
      width={440}
      onClose={() => resolve(false)}
      footer={
        <>
          <button className="btn ghost" onClick={() => resolve(false)}>
            キャンセル
          </button>
          <button
            className={`btn ${spec.danger ? "danger" : "primary"}`}
            onClick={() => resolve(true)}
          >
            {spec.confirmLabel ?? "実行"}
          </button>
        </>
      }
    >
      <div className="confirm-msg">{spec.message}</div>
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

const MenuCtx = createContext<((e: { clientX: number; clientY: number }, items: MenuItem[]) => void) | null>(
  null,
);
export const useMenu = () => {
  const v = useContext(MenuCtx);
  if (!v) throw new Error("MenuProvider が必要です");
  return v;
};

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const openMenu = useCallback(
    (e: { clientX: number; clientY: number }, items: MenuItem[]) => {
      setMenu({ x: e.clientX, y: e.clientY, items: items.filter(Boolean) });
    },
    [],
  );

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
          className="ctx-backdrop"
          tabIndex={-1}
          ref={focusIfEmpty}
          onMouseDown={close}
          onContextMenu={(e) => {
            e.preventDefault();
            close();
          }}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div className="ctx-menu" style={{ top, left }} onMouseDown={(e) => e.stopPropagation()}>
          {items.map((it, i) =>
            it.separator ? (
              <div key={i} className="ctx-sep" />
            ) : (
              <button
                key={i}
                className={`ctx-item ${it.danger ? "danger" : ""}`}
                disabled={it.disabled}
                onClick={() => {
                  close();
                  it.onClick?.();
                }}
              >
                {it.icon ? <Icon name={it.icon} size={14} /> : <span className="ctx-icon-gap" />}
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
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="badge" style={color ? { borderColor: color, color } : undefined}>
      {children}
    </span>
  );
}
