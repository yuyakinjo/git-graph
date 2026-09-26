import type { DiffTheme } from "../../lib/highlight";

export const ja = {
  /** 設定画面に出すテーマ名。name は固有名なので訳さず、説明だけ添える */
  themeLabel: (id: DiffTheme, name: string) => (id === "min-dark" ? `${name} (控えめ)` : name),
};

export const en: typeof ja = {
  themeLabel: (id, name) => (id === "min-dark" ? `${name} (Subtle)` : name),
};
