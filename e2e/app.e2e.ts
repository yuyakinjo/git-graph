/**
 * 主要な操作を実リポジトリに対して通しで確かめる。
 * 期待値はテスト用リポジトリの中身に依存しすぎないよう、なるべく git から読んで作る。
 */
import { expect, test } from "./fixtures.ts";

test.describe("起動", () => {
  test.describe("リポジトリ未選択", () => {
    test.use({ openRepo: false });

    test("フォルダを選ぶとリポジトリが開く", async ({ app }) => {
      const { page, repo } = app;
      app.stub("plugin:dialog|open", () => repo.dir);

      await expect(page.getByRole("heading", { name: "GitSquid" })).toBeVisible();
      // タイトルバーにも同名のアイコンボタンがあるので、文字の出ている方を押す
      await page
        .getByRole("button", { name: "リポジトリを開く" })
        .filter({ hasText: "リポジトリを開く" })
        .click();

      const subject = repo.git("log", "-1", "--format=%s");
      await expect(page.getByTitle(subject, { exact: true }).first()).toBeVisible();
    });
  });

  test("コミットグラフとブランチを表示する", async ({ app }) => {
    const { page, repo } = app;
    const total = repo.git("rev-list", "--all", "--count");

    await expect(page.getByText(`${total} コミット`)).toBeVisible();
    await expect(page.getByText("クリーン", { exact: true })).toBeVisible();
    // HEAD の短縮 SHA
    await expect(page.locator("footer").getByTitle("HEAD")).toHaveText(
      repo.git("rev-parse", "--short=7", "HEAD"),
    );
    // 各コミットの件名が並ぶ (グラフは仮想スクロールなので先頭付近だけ見る)
    for (const subject of repo.git("log", "-3", "--format=%s").split("\n")) {
      await expect(page.getByTitle(subject, { exact: true }).first()).toBeVisible();
    }
    // サイドバーのローカルブランチ
    await expect(page.locator("aside").getByTitle(/^main(\s|$)/)).toBeVisible();
  });

  test("コミットを選ぶと詳細が開く", async ({ app }) => {
    const { page, repo } = app;
    const [sha, subject] = repo.git("log", "-1", "--format=%h%n%s", "HEAD~1").split("\n");
    const files = repo.git("show", "--name-only", "--format=", "HEAD~1").split("\n");

    await page.getByTitle(subject, { exact: true }).first().click();

    const detail = page.getByRole("heading", { level: 3, name: subject });
    await expect(detail).toBeVisible();
    await expect(page.getByText(sha, { exact: true }).first()).toBeVisible();
    await expect(page.getByTitle(files[0], { exact: true }).first()).toBeVisible();
  });
});

test.describe("ブランチ", () => {
  test("ツールバーからブランチを作成してチェックアウトする", async ({ app }) => {
    const { page, repo } = app;

    await page.getByRole("button", { name: "ブランチ", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "ブランチを作成" });
    await dialog.getByLabel("ブランチ名").fill("feature/e2e");
    await dialog.getByRole("button", { name: "作成" }).click();

    await expect(page.getByText("ブランチ feature/e2e を作成 完了")).toBeVisible();
    await expect.poll(() => repo.head).toBe("feature/e2e");
  });

  test("リモートブランチをダブルクリックで追跡ブランチとしてチェックアウトする", async ({
    app,
  }) => {
    const { page, repo } = app;
    const remote = repo
      .git("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin")
      .split("\n")
      .find((r) => r !== "origin" && r !== "origin/HEAD" && r !== "origin/main")!;
    const local = remote.replace(/^origin\//, "");

    // サイドバーの行の title は「ブランチ名\n件名」
    await page
      .locator("aside")
      .getByTitle(new RegExp(`^${remote}\\s`))
      .dblclick();

    await expect(page.getByText(`${remote} をチェックアウト 完了`)).toBeVisible();
    await expect.poll(() => repo.head).toBe(local);
    expect(repo.git("rev-parse", "--abbrev-ref", "@{upstream}")).toBe(remote);
  });
});

test.describe("変更", () => {
  test("変更をコミットする", async ({ app }) => {
    const { page, repo } = app;
    repo.write("e2e-note.txt", "hello from e2e\n");
    await app.refresh();

    await page.getByText("未コミットの変更").first().click();
    await expect(page.getByText("変更 (1)")).toBeVisible();
    await expect(page.getByTitle("e2e-note.txt", { exact: true })).toBeVisible();

    await page.getByPlaceholder(/コミットメッセージ/).fill("test: add e2e note");
    await page.getByRole("button", { name: "すべてコミット" }).click();

    await expect(page.getByText("コミット 完了")).toBeVisible();
    await expect.poll(() => repo.git("log", "-1", "--format=%s")).toBe("test: add e2e note");
    expect(repo.git("status", "--porcelain")).toBe("");
    await expect(page.getByTitle("test: add e2e note", { exact: true })).toBeVisible();
    await expect(page.getByText("クリーン", { exact: true })).toBeVisible();
  });

  test("ステージとアンステージ", async ({ app }) => {
    const { page, repo } = app;
    repo.write("a.txt", "a\n");
    repo.write("b.txt", "b\n");
    await app.refresh();
    await page.getByText("未コミットの変更").first().click();

    await page.getByRole("button", { name: "すべてステージ" }).click();
    await expect(page.getByText("ステージ済み (2)")).toBeVisible();
    await expect.poll(() => repo.git("diff", "--cached", "--name-only")).toBe("a.txt\nb.txt");

    await page.getByRole("button", { name: "すべて解除" }).click();
    await expect(page.getByText("変更 (2)")).toBeVisible();
    await expect.poll(() => repo.git("diff", "--cached", "--name-only")).toBe("");
  });

  test("変更をスタッシュする", async ({ app }) => {
    const { page, repo } = app;
    repo.write("stash-me.txt", "wip\n");
    await app.refresh();

    await page.getByRole("button", { name: "スタッシュ", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "変更をスタッシュ" });
    await dialog.getByLabel("メッセージ (任意)").fill("e2e stash");
    await dialog.getByRole("button", { name: "スタッシュ" }).click();

    await expect(page.getByText("スタッシュ 1", { exact: true })).toBeVisible();
    expect(repo.git("stash", "list", "--format=%s")).toContain("e2e stash");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});

test.describe("同期", () => {
  test("ローカルのコミットをプッシュする", async ({ app }) => {
    const { page, repo } = app;
    repo.write("pushed.txt", "push me\n");
    repo.git("add", "pushed.txt");
    repo.git("commit", "-q", "-m", "test: push from e2e");
    await app.refresh();

    // ahead の件数がプッシュボタンに出る
    const push = page.getByRole("button", { name: /^プッシュ/ });
    await expect(push).toHaveText(/プッシュ\s*1/);
    await push.click();

    await expect(page.getByText("プッシュ 完了")).toBeVisible();
    expect(repo.originGit("log", "-1", "--format=%s", "main")).toBe("test: push from e2e");
  });

  test("リモートの新しいコミットをプルする", async ({ app }) => {
    const { page, repo } = app;
    // 別の clone から origin に 1 コミット積む
    const other = `${repo.dir}-other`;
    repo.git("clone", "-q", repo.origin, other);
    repo.git(
      "-C",
      other,
      "-c",
      "user.name=Other",
      "-c",
      "user.email=o@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "test: from another clone",
    );
    repo.git("-C", other, "push", "-q", "origin", "main");

    await page.getByTitle("git fetch --all --prune").click();
    const pull = page.getByRole("button", { name: /^プル/ });
    await expect(pull).toHaveText(/プル\s*1/);
    await pull.click();

    await expect(page.getByText("プル 完了")).toBeVisible();
    expect(repo.git("log", "-1", "--format=%s")).toBe("test: from another clone");
  });
});
