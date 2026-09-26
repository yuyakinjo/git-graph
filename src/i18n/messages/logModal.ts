export const ja = {
  title: "ログ",
  errorsOnly: (n: number) => `エラーのみ (${n})`,
  clear: "クリア",
  copyShown: (n: number) => `表示中の ${n} 件をコピー`,
  copyAll: "すべてコピー",
  empty: "ログはまだありません",
  copyLine: "この行をコピー",
};

export const en: typeof ja = {
  title: "Log",
  errorsOnly: (n) => `Errors only (${n})`,
  clear: "Clear",
  copyShown: (n) => `Copy ${n} shown ${n === 1 ? "entry" : "entries"}`,
  copyAll: "Copy All",
  empty: "No log entries yet",
  copyLine: "Copy this entry",
};
