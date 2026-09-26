import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { isLocalePref, LOCALE_PREFS, useT } from "../i18n";
import { CLAUDE_CODE_MODELS, isClaudeCodeModel } from "../lib/ai";
import { DIFF_THEMES, isDiffTheme } from "../lib/highlight";
import { AUTOFETCH_MINUTES, useStore } from "../state/store";
import { btn, dialogDesc, field, fieldInput, fieldLabel, hint, iconBtn } from "./classes";
import { Icon, Modal, Spinner } from "./ui";

const SECTION_H3 = "mx-0 mt-0 mb-1.5 text-[13px]";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

const DEPTHS = [1, 2, 3, 4, 5, 6];

/** 表示名は i18n の settings.categories から引く */
const CATEGORIES = ["general", "style", "ai"] as const;

type Category = (typeof CATEGORIES)[number];

/**
 * 設定 (Cmd+,)。カテゴリごとにタブで切り替える。
 * - 一般: 自動フェッチ、プロジェクトの場所
 * - スタイル: コミットグラフ、差分の表示、作者アイコン
 * - AI: AI コミットメッセージ
 */
export function Settings() {
  const s = useStore();
  const m = useT();
  const [category, setCategory] = useState<Category>("general");

  const addRoot = async () => {
    const picked = await openDialog({ directory: true, multiple: true });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (paths.length) s.setProjectRoots([...s.projectRoots, ...paths]);
  };

  return (
    <Modal title={m.settings.title} width={560} onClose={s.closeSettings}>
      <div
        className="-mx-3.5 -mt-3.5 mb-3.5 flex gap-1 border-b border-line px-3.5"
        role="tablist"
        aria-label={m.settings.categoriesLabel}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            className={`-mb-px cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-2.5 py-2 text-[12.5px] ${
              category === c
                ? "border-accent font-[650] text-fg"
                : "border-transparent text-fg-dim hover:text-fg"
            }`}
            onClick={() => setCategory(c)}
          >
            {m.settings.categories[c]}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {category === "general" ? (
          <>
            <section>
              <h3 className={SECTION_H3}>{m.settings.language}</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="locale">
                  {m.settings.languageLabel}
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="locale"
                  value={s.localePref}
                  onChange={(e) => {
                    if (isLocalePref(e.target.value)) s.setLocalePref(e.target.value);
                  }}
                >
                  {LOCALE_PREFS.map((p) => (
                    <option key={p} value={p}>
                      {m.settings.localePref[p]}
                    </option>
                  ))}
                </select>
                <em className={hint}>{m.settings.languageHint}</em>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>{m.settings.autoFetch}</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="auto-fetch">
                  {m.settings.autoFetchInterval}
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="auto-fetch"
                  value={String(s.autoFetchMinutes)}
                  onChange={(e) => s.setAutoFetchMinutes(Number(e.target.value))}
                >
                  {AUTOFETCH_MINUTES.map((min) => (
                    <option key={min} value={min}>
                      {m.settings.autoFetchOption(min)}
                    </option>
                  ))}
                </select>
                <em className={hint}>{m.settings.autoFetchHint}</em>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>{m.settings.projectRoots}</h3>
              <p className={dialogDesc}>{m.settings.projectRootsDesc}</p>

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
                      title={m.settings.remove}
                      onClick={() => s.setProjectRoots(s.projectRoots.filter((x) => x !== p))}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
                {!s.projectRoots.length ? (
                  <div className="rounded-md border border-dashed border-line p-2.5 text-center text-[12px] text-fg-faint">
                    {m.settings.noProjectRoots}
                  </div>
                ) : null}
              </div>

              <div className="mb-3.5">
                <button className={btn("primary")} onClick={addRoot}>
                  <Icon name="plus" size={14} /> {m.settings.addFolder}
                </button>
                <button
                  className={btn("ghost")}
                  disabled={s.scanning}
                  onClick={() => s.scanProjects()}
                >
                  {s.scanning ? <Spinner /> : <Icon name="fetch" size={14} />} {m.settings.rescan}
                </button>
              </div>

              <div className={field}>
                <label className={fieldLabel} htmlFor="scan-depth">
                  {m.settings.scanDepth}
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="scan-depth"
                  value={String(s.scanDepth)}
                  onChange={(e) => s.setScanDepth(Number(e.target.value))}
                >
                  {DEPTHS.map((d) => (
                    <option key={d} value={d}>
                      {m.settings.scanDepthOption(d)}
                    </option>
                  ))}
                </select>
                <em className={hint}>
                  {m.settings.scanDepthHint}{" "}
                  {s.scanning ? m.settings.scanning : m.settings.reposFound(s.projects.length)}
                </em>
              </div>
            </section>
          </>
        ) : null}
        {category === "style" ? (
          <>
            <section>
              <h3 className={SECTION_H3}>{m.settings.commitGraph}</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="graph-style">
                  {m.settings.graphStyle}
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
                  <option value="default">{m.settings.graphStyleDefault}</option>
                  <option value="japanese-railway">{m.settings.graphStyleRailway}</option>
                </select>
                <em className={hint}>{m.settings.graphStyleHint}</em>
              </div>
              <div className={field}>
                <label className={fieldLabel} htmlFor="graph-node">
                  {m.settings.graphNode}
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
                  <option value="avatar">{m.settings.graphNodeAvatar}</option>
                  <option value="circle">◯</option>
                </select>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>{m.settings.diffDisplay}</h3>
              <div className={field}>
                <label className={fieldLabel} htmlFor="diff-theme">
                  {m.settings.syntaxHighlight}
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
                      {m.highlight.themeLabel(t.id, t.label)}
                    </option>
                  ))}
                </select>
                <em className={hint}>{m.settings.syntaxHighlightHint}</em>
              </div>
            </section>

            <section>
              <h3 className={SECTION_H3}>{m.settings.authorAvatars}</h3>
              <p className={dialogDesc}>{m.settings.authorAvatarsDesc}</p>
              <div className="mb-3.5">
                <button className={btn("ghost")} onClick={() => void s.clearAvatarCache()}>
                  <Icon name="fetch" size={14} /> {m.settings.clearAvatarCache}
                </button>
              </div>
            </section>
          </>
        ) : null}
        {category === "ai" ? (
          <>
            <section>
              <h3 className={SECTION_H3}>{m.settings.aiCommitMessage}</h3>
              <p className={dialogDesc}>{m.settings.aiCommitMessageDesc}</p>
              <div className={field}>
                <label className={fieldLabel} htmlFor="ai-cli-model">
                  {m.settings.model}
                </label>
                <select
                  className={`${fieldInput} font-sans text-[12.5px]`}
                  id="ai-cli-model"
                  value={s.aiCliModel}
                  onChange={(e) => {
                    if (isClaudeCodeModel(e.target.value)) s.setAiCliModel(e.target.value);
                  }}
                >
                  {CLAUDE_CODE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {m.settings.models[model.id]}
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
