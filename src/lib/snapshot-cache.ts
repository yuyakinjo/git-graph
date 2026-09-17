/**
 * リポジトリごとの読み取り結果のキャッシュと、その「指紋」。
 *
 * タブ切り替えは openRepo での読み込み直しなので、そのままだと毎回
 * 全 state を差し替えて画面全体を作り直すことになる。ここでスナップショットを
 * 内容ハッシュ付きで覚えておき、
 *   - キャッシュがあれば先に描画してから裏で読み直す
 *   - 読み直した結果のハッシュが同じなら state を触らない (= 再描画しない)
 * という形にする。
 */
import type { GhStatus, PullRequest } from "./types";
import type { RepoSnapshot } from "./repo-data";

export interface CachedRepo {
  snapshot: RepoSnapshot;
  /** snapshot の内容ハッシュ。これが変わった時だけ再描画する。 */
  hash: string;
  gh: GhStatus | null;
  prs: PullRequest[];
}

/**
 * 32bit FNV-1a。内容が変われば値が変わることだけが必要で、衝突耐性は要らない。
 * JSON 化してから畳むので、型が増えてもここを直す必要はない
 * (Rust 側 serde の出力はキー順が安定しているため JSON も安定する)。
 */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function snapshotHash(snap: RepoSnapshot): string {
  // 長さも混ぜておくと、同じ長さでの衝突をさらに拾いにくくなる
  const json = JSON.stringify(snap);
  return `${json.length.toString(36)}-${fnv1a(json)}`;
}
