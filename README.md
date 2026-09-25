# GitSquid

GitKraken 風のコミットグラフを持つ、シンプルな Git GUI (Tauri v2 + React)。

「よく使う 8 つの操作」だけに機能を絞り、GitHub 連携は `gh` CLI に委譲しています。

## 環境

- macOS / Rust ツールチェイン / [bun](https://bun.sh)
- `git`、および GitHub 操作には認証済みの [`gh`](https://cli.github.com) (`gh auth login`)

## 開発

```sh
bun install
bun run tauri dev          # 起動時はカレント or 最後に開いたリポジトリを復元
```

すべての Git 操作は `git` / `gh` の CLI をそのまま実行しています (libgit2 は未使用)。
