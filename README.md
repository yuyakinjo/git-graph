# git-graph

GitKraken 風のコミットグラフを持つ、シンプルな Git GUI (Tauri v2 + React)。
「よく使う 8 つの操作」だけに機能を絞り、GitHub 連携は `gh` CLI に委譲しています。

## 対応している操作

| #   | 操作         | 挙動 (GitKraken 踏襲)                                                                                |
| --- | ------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | checkout     | ブランチ / コミット / リモートブランチ (追跡ブランチを自動作成) をダブルクリックまたは右クリックから |
| 2   | stash        | 変更をスタッシュ / 最新をポップ / 適用 / 破棄。スタッシュ選択で内容の差分表示                        |
| 3   | pull         | 既定は fast-forward。3 分ごとの自動フェッチで ahead/behind を表示                                    |
| 4   | add          | ファイル単位 / 一括のステージ・アンステージ・破棄                                                    |
| 5   | commit       | 何もステージしていなければ全変更を自動ステージ、amend 対応 (Cmd+Enter)                               |
| 6   | push         | upstream 未設定なら `-u` を確認、behind があれば pull するか lease 付きの強制プッシュを選択          |
| 7   | worktree     | 一覧 / 追加 (ブランチ新規作成も可) / 削除 / prune                                                    |
| 8   | pull request | `gh pr` で一覧・作成 (未 push なら先に push)・チェックアウト・マージ                                 |

## 前提

- macOS / Rust ツールチェイン / [bun](https://bun.sh)
- `git`、および GitHub 操作には認証済みの [`gh`](https://cli.github.com) (`gh auth login`)

## 開発

```sh
bun install
bun run tauri dev          # 起動時はカレント or 最後に開いたリポジトリを復元
GIT_GRAPH_REPO=/path/to/repo bun run tauri dev
```

## E2E テスト (Playwright)

Tauri の WebView は Playwright から操作できないため、フロントは vite の dev server を Chromium で開き、
`invoke` を Rust のブリッジ (`src-tauri/src/bin/e2e-bridge.rs`) へ転送します。
git 操作はアプリと同じ Rust のコマンドが実リポジトリに対して行います。

- テスト用リポジトリは [git-chat-ui-test-repo](https://github.com/yuyakinjo/git-chat-ui-test-repo) を
  `e2e/.cache` に bare でキャッシュし、テストごとに複製します (origin も複製なので push は GitHub に届きません)
- `gh` / Claude Code / ファイルダイアログはスタブします (`e2e/fixtures.ts`)
- GitHub Actions では `.github/workflows/e2e.yml` で実行します

```sh
bunx playwright install chromium   # 初回のみ
bun run e2e                        # ブリッジをビルドしてテストを実行
bunx playwright test --ui          # ブリッジをビルド済みなら直接 UI モードで
```

## フォーマット・静的解析

コード整形には [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) を使用します。
TypeScript / TSX / CSS / JSON / Markdown などの対応ファイルが対象です。

```sh
bun run format            # 対応ファイルを整形
bun run format:check      # 整形済みか確認 (CI 向け)
bun run lint              # Oxlint による静的解析
bun run ci                # 整形チェック・lint・build を並列実行
```

## ビルド

```sh
bun run tauri build        # .app を生成
```

## 構成

- `src-tauri/src/graph.rs` — `git log --all --date-order` を解析し、レーン番号とエッジを計算
- `src-tauri/src/repo.rs` — status / branches / stash / worktree / diff の取得
- `src-tauri/src/github.rs` — `gh` CLI のラッパー
- `src-tauri/src/commands.rs` — Tauri コマンド (フロントの `src/lib/api.ts` と 1 対 1)
- `src/components/GraphPane.tsx` — SVG でレーンとベジェ曲線を描画する仮想スクロールのグラフ
- `src/state/` — リポジトリ状態 (`store.tsx`) と 8 操作の実装 (`actions.tsx`)

すべての Git 操作は `git` / `gh` の CLI をそのまま実行しています (libgit2 は未使用)。
