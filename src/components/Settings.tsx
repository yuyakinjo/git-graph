import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../state/store";
import { btn, dialogDesc, field, fieldInput, fieldLabel, hint, iconBtn } from "./classes";
import { Icon, Modal, Spinner } from "./ui";

const SECTION_H3 = "mx-0 mt-0 mb-1.5 text-[13px]";

const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

const DEPTHS = [1, 2, 3, 4, 5, 6];

/**
 * 設定 (Cmd+,)。グラフの見た目、プロジェクトの場所、作者アイコンを扱う。
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
            <option value="japanese-railway">Japanese railway style（日本の鉄道路線図）</option>
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
        <h3 className={SECTION_H3}>プロジェクトの場所</h3>
        <p className={dialogDesc}>
          ここに登録したフォルダの配下から git リポジトリを探します。
          タブの「+」を押すと、見つかったリポジトリを検索して開けます。
        </p>

        <div className="my-2.5 flex flex-col gap-1">
          {s.projectRoots.map((p) => (
            <div
              key={p}
              className="flex items-center gap-2 rounded-md border border-line-soft bg-bg-1 px-2 py-[5px] text-[12px]"
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
          <button className={btn("ghost")} disabled={s.scanning} onClick={() => s.scanProjects()}>
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
    </Modal>
  );
}
