import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../state/store";
import { Icon, Modal, Spinner } from "./ui";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

const DEPTHS = [1, 2, 3, 4, 5, 6];

/**
 * 設定 (Cmd+,)。今のところ「プロジェクトの場所」だけを扱う。
 * ここで登録したフォルダの配下を探して、タブの「+」の一覧に出す。
 */
export function Settings() {
  const s = useStore();

  const addRoot = async () => {
    const picked = await openDialog({ directory: true, multiple: true });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (paths.length) s.setProjectRoots([...s.projectRoots, ...paths]);
  };

  return (
    <Modal title="設定" width={560} onClose={s.closeSettings}>
      <section className="settings-section">
        <h3>プロジェクトの場所</h3>
        <p className="dialog-desc">
          ここに登録したフォルダの配下から git リポジトリを探します。
          タブの「+」を押すと、見つかったリポジトリを検索して開けます。
        </p>

        <div className="settings-roots">
          {s.projectRoots.map((p) => (
            <div key={p} className="settings-root">
              <Icon name="folder" size={14} />
              <span className="mono">{shortPath(p)}</span>
              <button
                className="icon-btn tiny"
                title="削除"
                onClick={() => s.setProjectRoots(s.projectRoots.filter((x) => x !== p))}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          {!s.projectRoots.length ? (
            <div className="settings-empty">まだ登録されていません</div>
          ) : null}
        </div>

        <div className="row settings-actions">
          <button className="btn primary" onClick={addRoot}>
            <Icon name="plus" size={14} /> フォルダを追加
          </button>
          <button className="btn ghost" disabled={s.scanning} onClick={() => s.scanProjects()}>
            {s.scanning ? <Spinner /> : <Icon name="fetch" size={14} />} 再検索
          </button>
        </div>

        <div className="field">
          <label htmlFor="scan-depth">探索する階層の深さ</label>
          <select
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
          <em className="hint">
            深くするほど見つかりますが検索に時間がかかります。
            {s.scanning ? " 検索中..." : ` 現在 ${s.projects.length} 件のリポジトリを認識しています。`}
          </em>
        </div>
      </section>
    </Modal>
  );
}
