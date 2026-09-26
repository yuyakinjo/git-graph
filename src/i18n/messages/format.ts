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

export const en: typeof ja = {
  justNow: "just now",
  minutesAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  daysAgo: (n) => `${n}d ago`,
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
