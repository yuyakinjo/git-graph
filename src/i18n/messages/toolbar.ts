export const ja = {
  dashPanel: (open: boolean) => `ダッシュパネル: ${open ? "表示" : "非表示"}`,
  reload: "再読み込み",
  // 表示倍率
  zoom: "表示倍率",
  zoomRange: (min: number, max: number) => `${min}〜${max} の範囲で指定します。`,
  zoomPercent: "倍率 (%)",
  apply: "適用",
  zoomIn: "拡大 (Cmd +)",
  zoomOut: "縮小 (Cmd -)",
  zoomReset: "100% に戻す (Cmd 0)",
  zoomInput: "倍率を入力…",
  zoomTitle: "表示倍率 (Cmd + / Cmd - / Cmd 0)",
  // ステータスバー
  openOnGitHub: (url: string) => `GitHub で開く: ${url}`,
  ghMissing: "gh CLI 未検出",
  commits: (n: number) => `${n} コミット`,
  stashes: (n: number) => `スタッシュ ${n}`,
  /** changed が null ならクリーン */
  workingState: (changed: number | null, conflicts: number) =>
    `${changed === null ? "クリーン" : `変更 ${changed}`}${conflicts ? ` / 衝突 ${conflicts}` : ""}`,
};

export const en: typeof ja = {
  dashPanel: (open) => `Dash panel: ${open ? "shown" : "hidden"}`,
  reload: "Reload",
  zoom: "Zoom",
  zoomRange: (min, max) => `Enter a value from ${min} to ${max}.`,
  zoomPercent: "Zoom (%)",
  apply: "Apply",
  zoomIn: "Zoom In (Cmd +)",
  zoomOut: "Zoom Out (Cmd -)",
  zoomReset: "Actual Size (Cmd 0)",
  zoomInput: "Enter Zoom…",
  zoomTitle: "Zoom (Cmd + / Cmd - / Cmd 0)",
  openOnGitHub: (url) => `Open on GitHub: ${url}`,
  ghMissing: "gh CLI not found",
  commits: (n) => `${n} ${n === 1 ? "commit" : "commits"}`,
  stashes: (n) => `${n} ${n === 1 ? "stash" : "stashes"}`,
  workingState: (changed, conflicts) =>
    `${changed === null ? "Clean" : `${changed} ${changed === 1 ? "change" : "changes"}`}${
      conflicts ? ` / ${conflicts} ${conflicts === 1 ? "conflict" : "conflicts"}` : ""
    }`,
};
