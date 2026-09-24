/**
 * テスト用リポジトリを bare でキャッシュしておく (テストごとにここから複製する)。
 *
 * 既定は https://github.com/yuyakinjo/git-chat-ui-test-repo 。
 * E2E_TEST_REPO_URL で差し替えられる (ローカルパスも可)。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BRIDGE_BIN, MIRROR_DIR, TEST_REPO_URL } from "./paths.ts";

export default function globalSetup() {
  if (!existsSync(BRIDGE_BIN)) {
    throw new Error(
      `E2E ブリッジが見つかりません: ${BRIDGE_BIN}\n先に \`bun run e2e:bridge\` でビルドしてください。`,
    );
  }

  if (existsSync(MIRROR_DIR)) {
    // 取得済みなら最新化だけ試みる (オフラインなら手元のもので続行)
    try {
      execFileSync("git", ["-C", MIRROR_DIR, "fetch", "--prune", "origin", "+refs/*:refs/*"], {
        stdio: "ignore",
      });
    } catch {
      // noop
    }
    return;
  }
  mkdirSync(dirname(MIRROR_DIR), { recursive: true });
  execFileSync("git", ["clone", "--mirror", TEST_REPO_URL, MIRROR_DIR], { stdio: "inherit" });
}
