export const ja = {
  justNow: "たった今",
  minutesAgo: (n: number) => `${n} 分前`,
  hoursAgo: (n: number) => `${n} 時間前`,
  daysAgo: (n: number) => `${n} 日前`,
  status: {
    A: "追加",
    M: "変更",
    D: "削除",
    R: "リネーム",
    C: "コピー",
    T: "種別変更",
    "?": "未追跡",
    U: "衝突",
  } as Record<string, string>,
};

const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export const en: typeof ja = {
  justNow: "just now",
  minutesAgo: (n) => ago(n, "minute"),
  hoursAgo: (n) => ago(n, "hour"),
  daysAgo: (n) => ago(n, "day"),
  status: {
    A: "Added",
    M: "Modified",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    T: "Type changed",
    "?": "Untracked",
    U: "Conflicted",
  },
};
