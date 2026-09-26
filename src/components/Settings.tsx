import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { CLAUDE_CODE_MODELS, isClaudeCodeModel } from "../lib/ai";
import { DIFF_THEMES, isDiffTheme } from "../lib/highlight";
import { AUTOFETCH_MINUTES, useStore } from "../state/store";
import { btn, dialogDesc, field, fieldInput, fieldLabel, hint, iconBtn } from "./classes";
import { Icon, Modal, Spinner } from "./ui";

const SECTION_H3 = "mx-0 mt-0 mb-1.5 text-[13px]";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

const DEPTHS = [1, 2, 3, 4, 5, 6];

const CATEGORIES = [
  { id: "general", label: "一般" },
  { id: "style", label: "スタイル" },
  { id: "ai", label: "AI" },
] as const;

type Category = (typeof CATEGORIES)[number]["id"];

/**
 * 設定 (Cmd+,)。カテゴリごとにタブで切り替える。
 * - 一般: 自動フェッチ、プロジェクトの場所
 * - スタイル: コミットグラフ、差分の表示、作者アイコン
 * - AI: AI コミットメッセージ
 */
export function Settings() {
  const s = useStore();
  const [category, setCategory] = useState<Category>("general");

  const addRoot = async () => {
    const picked = await openDialog({ directory: true, multiple: true });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (paths.length) s.setProjectRoots([...s.projectRoots, ...paths]);
  };

  return (
    <Modal title="設定" width={560} onClose={s.closeSettings}>
      <div
        className="-mx-3.5 -mt-3.5 mb-3.5 flex gap-1 border-b border-line px-3.5"
        role="tablist"
        aria-label="設定のカテゴリ"
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={category === c.id}
            className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[12.5px] ${
              category === c.id
                ? "border-accent font-[650] text-fg"
                : "border-transparent text-fg-dim hover:text-fg"
            }`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {category === "general" ? (
          <>
            <section>
              <h3 className={SECTION_H3}>自動フェッチ</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="auto-fetch">
                  間隔
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="auto-fetch"
                  value={String(s.autoFetchMinutes)}
                  onChange={(e) => s.setAutoFetchMinutes(Number(e.target.value))}
                >
                  {AUTOFETCH_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "OFF" : `${m} 分ごと`}
                    </option>
                  ))}
                </select>
                <em className={hint}>
                  開いているリポジトリを裏で git fetch し、変化があれば表示を更新します。
                </em>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>プロジェクトの場所</h3>
              <p className={dialogDesc}>
                ここに登録したフォルダの配下から git リポジトリを探します。
                タブの「+」を押すと、見つかったリポジトリを検索して開けます。
              </p>

              <div className="my-2.5 flex flex-col gap-1">
                {s.projectRoots.map((p) => (
                  <div
                    key={p}
                    className="flex items-center gap-2 rounded-md border border-line-soft bg-bg-1 px-2 py-1.25 text-[12px]"
                  >
                    <Icon name="folder" size={14} />
                    <span className="min-w-0 flex-1 overflow-hidden font-mono text-[12px] text-ellipsis whitespace-nowrap">
                      {shortPath(p)}
                    </span>
                    <button
                      className={iconBtn({ tiny: true })}
                      title="削除"
                      onClick={() => s.setProjectRoots(s.projectRoots.filter((x) => x !== p))}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
                {!s.projectRoots.length ? (
                  <div className="rounded-md border border-dashed border-line p-2.5 text-center text-[12px] text-fg-faint">
                    まだ登録されていません
                  </div>
                ) : null}
              </div>

              <div className="mb-3.5">
                <button className={btn("primary")} onClick={addRoot}>
                  <Icon name="plus" size={14} /> フォルダを追加
                </button>
                <button
                  className={btn("ghost")}
                  disabled={s.scanning}
                  onClick={() => s.scanProjects()}
                >
                  {s.scanning ? <Spinner /> : <Icon name="fetch" size={14} />} 再検索
                </button>
              </div>

              <div className={field}>
                <label className={fieldLabel} htmlFor="scan-depth">
                  探索する階層の深さ
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="scan-depth"
                  value={String(s.scanDepth)}
                  onChange={(e) => s.setScanDepth(Number(e.target.value))}
                >
                  {DEPTHS.map((d) => (
                    <option key={d} value={d}>
                      {d} 階層
                    </option>
                  ))}
                </select>
                <em className={hint}>
                  深くするほど見つかりますが検索に時間がかかります。
                  {s.scanning
                    ? " 検索中..."
                    : ` 現在 ${s.projects.length} 件のリポジトリを認識しています。`}
                </em>
              </div>
            </section>
          </>
        ) : null}
        {category === "style" ? (
          <>
            <section>
              <h3 className={SECTION_H3}>コミットグラフ</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="graph-style">
                  スタイル
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="graph-style"
                  value={s.graphStyle}
                  onChange={(e) =>
                    s.setGraphStyle(
                      e.target.value === "japanese-railway" ? "japanese-railway" : "default",
                    )
                  }
                >
                  <option value="default">標準（従来のスタイル）</option>
                  <option value="japanese-railway">
                    Japanese railway style（日本の鉄道路線図）
                  </option>
                </select>
                <em className={hint}>
                  太い路線と、線幅に近い大きさの駅の◯で表示します。
                  ノードの表示は、どちらのスタイルでもアバターと◯から選べます。
                </em>
              </div>
              <div className={field}>
                <label className={fieldLabel} htmlFor="graph-node">
                  ノードの表示
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="graph-node"
                  value={s.columns.nodeAvatar ? "avatar" : "circle"}
                  onChange={(e) => {
                    if ((e.target.value === "avatar") !== s.columns.nodeAvatar) {
                      s.toggleColumn("nodeAvatar");
                    }
                  }}
                >
                  <option value="avatar">アバター</option>
                  <option value="circle">◯</option>
                </select>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>差分の表示</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="diff-theme">
                  シンタックスハイライト
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="diff-theme"
                  value={s.diffTheme}
                  onChange={(e) => {
                    if (isDiffTheme(e.target.value)) void s.setDiffTheme(e.target.value);
                  }}
                >
                  {DIFF_THEMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <em className={hint}>
                  ファイルの拡張子から言語を判定して色を付けます。テーマは選んだものだけを読み込みます。
                </em>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>作者アイコン</h3>
              <p className={dialogDesc}>
                コミット作者のメールアドレスから gh CLI で GitHub のアバターを引いて表示します。
                結果はディスクに残るので、同じ作者を何度も取りに行くことはありません。
                アイコンを変えた人が古いままのときだけ、ここで消してください。
              </p>
              <div className="mb-3.5">
                <button className={btn("ghost")} onClick={() => void s.clearAvatarCache()}>
                  <Icon name="fetch" size={14} /> キャッシュを消して取り直す
                </button>
              </div>
            </section>
          </>
        ) : null}
        {category === "ai" ? (
          <>
            <section>
              <h3 className={SECTION_H3}>AI コミットメッセージ</h3>
              <p className={dialogDesc}>
                コミット欄の「AI で生成」ボタンで、インストール済みの Claude Code (claude コマンド)
                に差分からメッセージを作らせます。Claude のサブスクリプションでログインしていれば、
                キーの登録は不要です。生成時には差分が Anthropic に送られます。
              </p>
              <div className={field}>
                <label className={fieldLabel} htmlFor="ai-cli-model">
                  モデル
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="ai-cli-model"
                  value={s.aiCliModel}
                  onChange={(e) => {
                    if (isClaudeCodeModel(e.target.value)) s.setAiCliModel(e.target.value);
                  }}
                >
                  {CLAUDE_CODE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
