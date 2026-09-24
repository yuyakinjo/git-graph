import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

export const TEST_REPO_URL =
  process.env.E2E_TEST_REPO_URL ?? "https://github.com/yuyakinjo/git-chat-ui-test-repo";

/** テスト用リポジトリの bare キャッシュ */
export const MIRROR_DIR = resolve(ROOT, "e2e/.cache/test-repo.git");

/** `bun run e2e:bridge` で作るブリッジ */
export const BRIDGE_BIN = resolve(
  ROOT,
  "src-tauri/target/debug",
  process.platform === "win32" ? "e2e-bridge.exe" : "e2e-bridge",
);
