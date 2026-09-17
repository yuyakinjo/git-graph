import type { ReactNode } from "react";
import type { BootData } from "../lib/repo-data";
import { StoreCtx, useStoreValue } from "./store";

export function StoreProvider({ boot, children }: { boot: BootData | null; children: ReactNode }) {
  const value = useStoreValue(boot);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
