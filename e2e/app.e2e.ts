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
  test("ダッシュパネルからブランチを作成してチェックアウトする", async ({ app }) => {
    const { page, repo } = app;
    const panel = page.getByRole("toolbar", { name: "ダッシュパネル" });

    // 既定の git バーには無いので、左端アイコンのメニューから足してから押す
    await panel.getByTitle("git (クリックでボタンを選ぶ)").click();
    await page.getByRole("button", { name: "ブランチ" }).last().click();
    await panel.getByRole("button", { name: "ブランチ", exact: true }).click();
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

    // ダイアログを挟まず、日時から付けた名前ですぐスタッシュする
    // サイドバーのスタッシュ見出しにある + ボタンから
    await page.locator("aside").getByTitle("スタッシュ", { exact: true }).click();

    await expect(page.getByText("スタッシュ 1", { exact: true })).toBeVisible();
    expect(repo.git("stash", "list", "--format=%s")).toMatch(/: WIP \d{4}-\d{2}-\d{2} /);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  test("スタッシュの名前を変更する", async ({ app }) => {
    const { page, repo } = app;
    repo.write("first.txt", "1\n");
    repo.git("stash", "push", "--include-untracked", "-m", "first");
    repo.write("second.txt", "2\n");
    repo.git("stash", "push", "--include-untracked", "-m", "second");
    await app.refresh();

    await page
      .getByText(`On ${repo.head}: first`, { exact: true })
      .first()
      .click({ button: "right" });
    await page.getByRole("button", { name: "名前を変更" }).click();
    const dialog = page.getByRole("dialog", { name: "スタッシュの名前を変更" });
    await dialog.getByLabel("名前").fill("renamed");
    await dialog.getByRole("button", { name: "変更" }).click();

    // 並び (stash@{n}) は変わらず、中身もそのまま。名前は reflog の件名 (%gs) に入る
    await expect
      .poll(() => repo.git("stash", "list", "--format=%gd %gs"))
      .toMatch(/^stash@\{0\} On \S+: second\nstash@\{1\} On \S+: renamed/);
    expect(repo.git("stash", "show", "--include-untracked", "--name-only", "stash@{1}")).toContain(
      "first.txt",
    );
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
    const push = page
      .getByRole("toolbar", { name: "ダッシュパネル" })
      .getByRole("button", { name: /^プッシュ/ });
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

    await page.locator("aside").getByTitle("フェッチ", { exact: true }).click();
    const pull = page
      .getByRole("toolbar", { name: "ダッシュパネル" })
      .getByRole("button", { name: /^プル/ });
    await expect(pull).toHaveText(/プル\s*1/);
    await pull.click();

    await expect(page.getByText("プル 完了")).toBeVisible();
    expect(repo.git("log", "-1", "--format=%s")).toBe("test: from another clone");
  });
});

test.describe("設定", () => {
  test("タイトルバー右端のロゴから設定を開く", async ({ app }) => {
    const { page } = app;

    await page.getByTitle("設定 (Cmd ,)").click();

    const dialog = page.getByRole("dialog", { name: "設定" });
    await expect(dialog).toBeVisible();

    // カテゴリのタブで表示する項目が切り替わる
    await expect(dialog.getByText("自動フェッチ")).toBeVisible();
    await dialog.getByRole("tab", { name: "スタイル" }).click();
    await expect(dialog.getByText("コミットグラフ")).toBeVisible();
    await expect(dialog.getByText("自動フェッチ")).toHaveCount(0);
    await dialog.getByRole("tab", { name: "AI" }).click();
    await expect(dialog.getByText("AI コミットメッセージ")).toBeVisible();
  });

  test("表示言語を English にすると画面の文言が切り替わり、再起動後も残る", async ({ app }) => {
    const { page } = app;

    await page.getByTitle("設定 (Cmd ,)").click();
    await page.getByLabel("表示言語").selectOption("en");

    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog.getByRole("tab", { name: "General" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.reload();
    await expect(page.getByTitle("Settings (Cmd ,)")).toBeVisible();
  });
});

test.describe("ログ", () => {
  test("タイトルバーからログを開き、実行した git コマンドをコピーできる", async ({ app }) => {
    const { page } = app;
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.getByTitle("ログ (Cmd Shift L)").click();

    const dialog = page.getByRole("dialog", { name: "ログ" });
    await expect(dialog.getByText(/^\$ git /).first()).toBeVisible();
    await dialog.getByRole("button", { name: "すべてコピー" }).click();
    await expect(dialog.getByTitle("コピーしました")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("$ git ");
  });
});

test.describe("サイドバー", () => {
  test("セクションをドラッグで並べ替え、再読み込み後も並びを保つ", async ({ app }) => {
    const { page } = app;
    const sections = page.locator("aside [data-section]");
    const header = (id: string) => page.locator(`aside [data-section="${id}"] > header`);
    await expect(sections.first()).toHaveAttribute("data-section", "local");

    // タグの見出しをローカルの見出しの上半分へ落とす
    const from = (await header("tag").boundingBox())!;
    const to = (await header("local").boundingBox())!;
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 40, to.y + 2, { steps: 10 });
    await page.mouse.up();

    const order = ["tag", "local", "remote", "pr", "stash", "worktree"];
    const ids = () => sections.evaluateAll((els) => els.map((el) => el.dataset.section));
    await expect.poll(ids).toEqual(order);
    // ドラッグ後の click で開閉が切り替わっていない (タグは既定で閉じている)
    await expect(page.locator('aside [data-section="tag"] > div')).toHaveCount(0);

    await page.reload();
    await expect.poll(ids).toEqual(order);
  });
});

test.describe("ダッシュパネル", () => {
  test("下部への配置を保存し、下部でも取り出しと再ドッキングができる", async ({ app }) => {
    const { page } = app;
    await page.evaluate(() => localStorage.setItem("gitsquid.theme", "nord"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "nord");
    const panel = page.getByRole("toolbar", { name: "ダッシュパネル", exact: true });
    const floating = page.getByRole("toolbar", { name: "取り出したダッシュバー" });
    const top = page.locator('[data-dash-dock="top"]');
    const bottom = page.locator('[data-dash-dock="bottom"]');
    await expect(top.getByRole("toolbar")).toBeVisible();
    await page.screenshot({ path: "test-results/dash-panel-top-dark.png" });

    // キーボードからも設定メニューを開ける。
    await panel.getByRole("button", { name: "git バーの移動・設定" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "ツールバーを下部に配置" }).click();
    await expect(bottom.getByRole("toolbar")).toBeVisible();
    await expect(top).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const dockBox = await bottom.boundingBox();
    const footerBox = await page.locator("footer").boundingBox();
    if (!dockBox || !footerBox) throw new Error("ドックまたはステータスバーが見つかりません");
    expect(Math.abs(dockBox.y + dockBox.height - footerBox.y)).toBeLessThan(1);
    await page.screenshot({ path: "test-results/dash-panel-bottom.png" });
    await expect.poll(() => page.locator("body").evaluate((el) => el.scrollTop)).toBe(0);

    await page.reload();
    await expect(bottom.getByRole("toolbar")).toBeVisible();
    await panel.getByTitle("git (クリックでボタンを選ぶ)").click();
    await page.getByRole("button", { name: "このバーを取り出す" }).click();
    const barBox = await floating.locator("[data-bar=git]").boundingBox();
    if (!barBox) throw new Error("取り出したバーが見つかりません");
    expect(barBox.y + barBox.height).toBeLessThan(dockBox.y);

    const grip = await floating.locator("[data-grip]").boundingBox();
    if (!grip) throw new Error("つまみが見つかりません");
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(dockBox.x + 100, dockBox.y + dockBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(bottom.locator("[data-bar=git]")).toBeVisible();
    await expect(floating).toHaveCount(0);

    await panel.getByTitle("git (クリックでボタンを選ぶ)").click();
    await page.getByRole("button", { name: "ツールバーを上部に配置" }).click();
    await expect(top.getByRole("toolbar")).toBeVisible();
    await expect(bottom).toHaveCount(0);
  });

  test("ダッシュボタンを出し、ドッキング中はダイアログの間も列に残る", async ({ app }) => {
    const { page } = app;
    const panel = page.getByRole("toolbar", { name: "ダッシュパネル" });

    await expect(panel.getByRole("button", { name: "PR 作成", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "AI でコミット" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "整理" })).toBeVisible();
    await page.screenshot({ path: "test-results/dash-panel.png" });

    // git バーの左端アイコンから候補を選んで足す
    await panel.getByTitle("git (クリックでボタンを選ぶ)").click();
    await page.getByRole("button", { name: "ブランチ" }).last().click();
    const branchBtn = panel.getByRole("button", { name: "ブランチ", exact: true });
    await expect(branchBtn).toBeVisible();

    // 押すとフォームダイアログが開く (ドッキング中なので列からは消えない)。最近使ったにも載る
    await branchBtn.click();
    await expect(page.getByRole("dialog", { name: "ブランチを作成" })).toBeVisible();
    await expect(panel).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panel.getByTitle("最近使った操作")).toBeVisible();
    await page.screenshot({ path: "test-results/dash-panel-recent.png" });
  });

  test("ボタンをドラッグで並べ替え、バーを隠せる", async ({ app }) => {
    const { page } = app;
    const panel = page.getByRole("toolbar", { name: "ダッシュパネル" });
    const labels = () =>
      panel
        .locator("[data-dash-button] span")
        .evaluateAll((els) => els.slice(0, 3).map((el) => el.textContent));
    await expect.poll(labels).toEqual(["コミット", "プル", "プッシュ"]);

    // プッシュを コミット の前へドラッグする
    const push = await panel.locator("[data-dash-button]", { hasText: "プッシュ" }).boundingBox();
    const commit = await panel
      .locator("[data-dash-button]")
      .filter({ has: page.locator("span", { hasText: /^コミット$/ }) })
      .boundingBox();
    if (!push || !commit) throw new Error("ボタンが見つかりません");
    await page.mouse.move(push.x + push.width / 2, push.y + push.height / 2);
    await page.mouse.down();
    await page.mouse.move(commit.x + 4, commit.y + commit.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(labels).toEqual(["プッシュ", "コミット", "プル"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // GitHub バーを隠す
    const prBtn = panel.getByRole("button", { name: "PR 作成", exact: true });
    await expect(prBtn).toBeVisible();
    await panel.getByTitle("git (クリックでボタンを選ぶ)").click();
    await page.getByRole("button", { name: "GitHub バー", exact: true }).click();
    await expect(prBtn).toHaveCount(0);
    await page.screenshot({ path: "test-results/dash-panel-reorder.png" });
  });

  test("バーを 1 本ずつ取り出し、列へ戻すとドッキングする", async ({ app }) => {
    const { page } = app;
    const docked = page.getByRole("toolbar", { name: "ダッシュパネル" });
    const floating = page.getByRole("toolbar", { name: "取り出したダッシュバー" });
    await expect(docked.locator("[data-bar=git]")).toBeVisible();

    const dragGrip = async (
      bar: string,
      to: (g: { x: number; y: number }) => { x: number; y: number },
    ) => {
      const grip = await page.locator(`[data-bar=${bar}] [data-grip]`).boundingBox();
      if (!grip) throw new Error(`${bar} のつまみが見つかりません`);
      const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
      const dest = to(from);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(dest.x, dest.y, { steps: 10 });
      await page.mouse.up();
    };

    // git バーだけを列の外 (下) へ引き出す。ほかのバーは列に残る
    await dragGrip("git", (g) => ({ x: g.x, y: g.y + 300 }));
    await expect(floating.locator("[data-bar=git]")).toBeVisible();
    await expect(docked.locator("[data-bar=git]")).toHaveCount(0);
    await expect(docked.locator("[data-bar=github]")).toBeVisible();

    // AI バーも別の場所へ取り出す
    await dragGrip("ai", (g) => ({ x: g.x, y: g.y + 450 }));
    await expect(floating.locator("[data-bar]")).toHaveCount(2);

    // 再読み込みしても取り出したまま
    await page.reload();
    await expect(floating.locator("[data-bar]")).toHaveCount(2);
    await expect(docked.locator("[data-bar=github]")).toBeVisible();

    // git バーを列の上で離すと、git バーだけがドッキングに戻る
    const slot = await docked.boundingBox();
    if (!slot) throw new Error("列が見つかりません");
    await dragGrip("git", () => ({ x: slot.x + slot.width + 40, y: slot.y + slot.height / 2 }));
    await expect(docked.locator("[data-bar=git]")).toBeVisible();
    await expect(floating.locator("[data-bar]")).toHaveCount(1);

    // 残った AI バーはメニューから戻す
    await floating.getByTitle("AI (クリックでボタンを選ぶ)").click();
    await page.getByRole("button", { name: "このバーをツールバーに戻す" }).click();
    await expect(floating).toHaveCount(0);
    await expect(docked.locator("[data-bar=ai]")).toBeVisible();
  });

  test("AI でコミットすると、生成したメッセージ入りのダイアログが開く", async ({ app }) => {
    const { page, repo } = app;
    app.stub("claude_generate", () => "feat: add ai note");
    repo.write("ai-note.txt", "hello\n");
    await app.refresh();

    const panel = page.getByRole("toolbar", { name: "ダッシュパネル" });
    await panel.getByRole("button", { name: "AI でコミット" }).click();
    const dialog = page.getByRole("dialog", { name: "コミット" });
    await expect(dialog.getByLabel("コミットメッセージ")).toHaveValue("feat: add ai note");
    expect(app.calls.some((c) => c.cmd === "claude_generate")).toBe(true);

    await dialog.getByRole("button", { name: "コミット", exact: true }).click();
    await expect.poll(() => repo.git("log", "-1", "--format=%s")).toBe("feat: add ai note");
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});
