export const ja = {
  /** git 操作の共通ラッパー run のログとトースト。label は actions の run.* */
  runStart: (label: string) => `${label} を開始`,
  runDone: (label: string) => `${label} 完了`,
  runFailed: (label: string) => `${label} に失敗しました`,
  /** グラフ一覧の列 (GraphColumnKey) の表示名 */
  graphColumns: {
    graph: "グラフ",
    nodeAvatar: "ノード",
    refs: "ブランチ",
    tags: "タグ",
    subject: "メッセージ",
    author: "作者",
    sha: "SHA",
    date: "日時",
  },
  commitLoadFailed: "コミットを読み込めません",
  avatarCacheCleared: "作者アイコンのキャッシュを消しました",
  avatarCacheClearFailed: "キャッシュを消せませんでした",
  loadMoreFailed: "コミットを追加で読めませんでした",
  refreshFailed: "リポジトリの読み込みに失敗しました",
  openRepoFailed: "リポジトリを開けませんでした",
  scanFailed: "プロジェクトの検索に失敗しました",
};

export const en: typeof ja = {
  runStart: (label) => `Starting: ${label}`,
  runDone: (label) => `${label} completed`,
  runFailed: (label) => `${label} failed`,
  graphColumns: {
    graph: "Graph",
    nodeAvatar: "Node",
    refs: "Branch",
    tags: "Tags",
    subject: "Message",
    author: "Author",
    sha: "SHA",
    date: "Date",
  },
  commitLoadFailed: "Couldn't load the commit",
  avatarCacheCleared: "Cleared the author avatar cache",
  avatarCacheClearFailed: "Couldn't clear the cache",
  loadMoreFailed: "Couldn't load more commits",
  refreshFailed: "Failed to load the repository",
  openRepoFailed: "Couldn't open the repository",
  scanFailed: "Failed to search for projects",
};
