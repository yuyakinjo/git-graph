/**
 * E2E の土台。
 *
 * - bridge: Rust のブリッジ (e2e-bridge) をワーカーごとに 1 つ起動し、invoke を JSON 行で中継する
 * - repo:   テストごとにテスト用リポジトリを複製する。origin もテスト専用の bare なので
 *           push しても GitHub には届かない
 * - app:    ページに `__TAURI_INTERNALS__` を差し込み、invoke をブリッジへ転送してから開く。
 *           gh / Claude / ダイアログなど外部に出るものは既定でスタブする
 */
import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type Page, expect, test as base } from "@playwright/test";
import { BRIDGE_BIN, MIRROR_DIR } from "./paths.ts";

type Reply = { ok: unknown } | { err: string };
type Args = Record<string, unknown>;
type Handler = (args: Args) => unknown;

// ------------------------------------------------------------------ bridge

class Bridge {
  #proc: ChildProcessWithoutNullStreams;
  #seq = 0;
  #pending = new Map<number, (r: Reply) => void>();

  constructor() {
    this.#proc = spawn(BRIDGE_BIN, [], {
      // initial_repo はカレントディレクトリを見るので、git リポジトリの外で動かす
      cwd: tmpdir(),
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    this.#proc.stderr.on("data", (d) => process.stderr.write(d));
    createInterface({ input: this.#proc.stdout }).on("line", (line) => {
      let msg: { id: number } & Reply;
      try {
        msg = JSON.parse(line);
      } catch {
        return; // コマンドが stdout に何か出しても無視する
      }
      this.#pending.get(msg.id)?.(msg);
      this.#pending.delete(msg.id);
    });
  }

  call(cmd: string, args: Args): Promise<Reply> {
    const id = ++this.#seq;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#proc.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
    });
  }

  close() {
    this.#proc.stdin.end();
    this.#proc.kill();
  }
}

// ------------------------------------------------------------------ repo

export class TestRepo {
  /** アプリで開く作業ツリー */
  readonly dir: string;
  /** origin (テスト専用の bare) */
  readonly origin: string;
  readonly #root: string;

  constructor() {
    // macOS の /var → /private/var のようなシンボリックリンクを解決しておく
    // (アプリ側は git rev-parse --show-toplevel の実パスで扱うため)
    this.#root = realpathSync(mkdtempSync(join(tmpdir(), "git-squid-e2e-")));
    this.origin = join(this.#root, "origin.git");
    this.dir = join(this.#root, "work");
    execFileSync("git", ["clone", "-q", "--bare", MIRROR_DIR, this.origin]);
    execFileSync("git", ["clone", "-q", this.origin, this.dir]);
    // CI には git の利用者設定が無く、手元では署名設定などが効いてしまうので固定する
    this.git("config", "user.name", "E2E Tester");
    this.git("config", "user.email", "e2e@example.com");
    this.git("config", "commit.gpgsign", "false");
  }

  /** 作業ツリーで git を実行して stdout を返す (末尾の改行は落とす) */
  git(...args: string[]) {
    return execFileSync("git", args, { cwd: this.dir, encoding: "utf8" }).trimEnd();
  }

  /** origin で git を実行する */
  originGit(...args: string[]) {
    return execFileSync("git", args, { cwd: this.origin, encoding: "utf8" }).trimEnd();
  }

  write(path: string, content: string) {
    writeFileSync(join(this.dir, path), content);
  }

  get head() {
    return this.git("rev-parse", "--abbrev-ref", "HEAD");
  }

  remove() {
    rmSync(this.#root, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ app

export interface App {
  page: Page;
  repo: TestRepo;
  /** invoke されたコマンドの履歴 */
  calls: { cmd: string; args: Args }[];
  /** コマンドの応答を差し替える。throw すると invoke が reject される */
  stub(cmd: string, handler: Handler): void;
  /** 画面の「再読み込み」ボタンを押し、読み込みが終わるまで待つ */
  refresh(): Promise<void>;
}

const DEFAULT_STUBS: Record<string, Handler> = {
  // gh は CI の認証状態に左右されないよう「未インストール」扱いにする
  gh_status: () => ({
    installed: false,
    authenticated: false,
    login: null,
    repo: null,
    defaultBranch: null,
    url: null,
    message: "stubbed in e2e",
  }),
  gh_avatars: () => ({}),
  gh_avatars_clear: () => null,
  claude_generate: () => {
    throw "claude is not available in e2e";
  },
  // Tauri プラグイン
  "plugin:dialog|open": () => null,
  "plugin:opener|open_url": () => null,
  // 失敗させるとアプリは CSS の zoom に落とすので、それで十分
  "plugin:webview|set_webview_zoom": () => {
    throw "not supported in e2e";
  },
};

interface Options {
  /** true (既定) なら起動時にテスト用リポジトリを開いた状態にする */
  openRepo: boolean;
}

export const test = base.extend<Options & { repo: TestRepo; app: App }, { bridge: Bridge }>({
  openRepo: [true, { option: true }],

  bridge: [
    async ({}, use) => {
      const bridge = new Bridge();
      await use(bridge);
      bridge.close();
    },
    { scope: "worker" },
  ],

  repo: async ({}, use) => {
    const repo = new TestRepo();
    await use(repo);
    repo.remove();
  },

  app: async ({ page, bridge, repo, openRepo }, use) => {
    const stubs = new Map(Object.entries(DEFAULT_STUBS));
    const calls: App["calls"] = [];

    await page.exposeFunction("__e2eInvoke", async (cmd: string, args: Args): Promise<Reply> => {
      calls.push({ cmd, args });
      const stub = stubs.get(cmd);
      if (!stub) return bridge.call(cmd, args);
      try {
        return { ok: (await stub(args)) ?? null };
      } catch (e) {
        return { err: String(e) };
      }
    });

    await page.addInitScript(
      ({ path }) => {
        const w = window as unknown as Record<string, unknown> & {
          __e2eInvoke: (cmd: string, args: unknown) => Promise<Reply>;
        };
        let cb = 0;
        w.__TAURI_INTERNALS__ = {
          metadata: {
            currentWindow: { label: "main" },
            currentWebview: { windowLabel: "main", label: "main" },
          },
          async invoke(cmd: string, args?: unknown) {
            const r = await w.__e2eInvoke(cmd, args ?? {});
            if ("err" in r) throw r.err; // Tauri と同じく文字列で reject する
            return r.ok;
          },
          transformCallback(fn: unknown) {
            const id = ++cb;
            w[`_${id}`] = fn;
            return id;
          },
          unregisterCallback(id: number) {
            delete w[`_${id}`];
          },
          convertFileSrc: (p: string) => p,
        };
        // 起動時に開くリポジトリ (bootApp が最初に見る)
        if (path && !sessionStorage.getItem("e2e.booted")) {
          localStorage.setItem("gitsquid.last", path);
          sessionStorage.setItem("e2e.booted", "1");
        }
      },
      { path: openRepo ? repo.dir : null },
    );

    const app: App = {
      page,
      repo,
      calls,
      stub: (cmd, handler) => void stubs.set(cmd, handler),
      async refresh() {
        const button = page.getByTitle("再読み込み");
        await button.click();
        // 読み込み中はスピナーに替わるので、アイコンに戻るまで待つ
        await expect(button.locator(".animate-spinner")).toHaveCount(0);
      },
    };

    await page.goto("/");
    await use(app);
  },
});

export { expect };
