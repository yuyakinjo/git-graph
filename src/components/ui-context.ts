/**
 * ui.tsx のプロバイダが配る context と、それを読むフック。
 *
 * コンポーネント以外を export したファイルでは Fast Refresh が効かなくなるため
 * (react/only-export-components)、フックだけをこのファイルに分けている。
 */
import { createContext, useContext } from "react";
import type { ConfirmSpec, FormResult, FormSpec, MenuItem } from "./ui";

export interface DialogApi {
  form: (spec: FormSpec) => Promise<FormResult | null>;
  confirm: (spec: ConfirmSpec) => Promise<boolean>;
}

export const DialogCtx = createContext<DialogApi | null>(null);

export const useDialogs = () => {
  const v = useContext(DialogCtx);
  if (!v) throw new Error("DialogProvider が必要です");
  return v;
};

export type MenuOpener = (e: { clientX: number; clientY: number }, items: MenuItem[]) => void;

export const MenuCtx = createContext<MenuOpener | null>(null);

export const useMenu = () => {
  const v = useContext(MenuCtx);
  if (!v) throw new Error("MenuProvider が必要です");
  return v;
};
