/**
 * サイドバーのセクション (ローカル / リモート / PR ...) の並び順。
 *
 * ドラッグで並べ替えた結果を localStorage に保存し、再起動後も復元する。
 */

export const SECTION_IDS = ["local", "remote", "pr", "stash", "worktree", "tag"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const ORDER_KEY = "gitsquid.sectionOrder";

/**
 * 保存値を既知のセクションだけの並びに整える。
 * 未知の id や重複は捨て、保存後に増えたセクションは既定の位置関係のまま末尾に足す。
 */
export function normalizeOrder(saved: unknown): SectionId[] {
  const known = new Set<string>(SECTION_IDS);
  const seen = new Set<SectionId>();
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (typeof id === "string" && known.has(id)) seen.add(id as SectionId);
    }
  }
  return [...seen, ...SECTION_IDS.filter((id) => !seen.has(id))];
}

export function loadSectionOrder(): SectionId[] {
  try {
    return normalizeOrder(JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null"));
  } catch {
    return [...SECTION_IDS];
  }
}

export function saveSectionOrder(order: readonly SectionId[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

/**
 * `id` を「元の並びで `index` 番目の前」へ動かす (`index === order.length` なら末尾)。
 * 動かなければ同じ配列をそのまま返す。
 */
export function moveSection(order: SectionId[], id: SectionId, index: number): SectionId[] {
  const from = order.indexOf(id);
  if (from < 0 || index === from || index === from + 1) return order;
  const next = order.filter((x) => x !== id);
  next.splice(from < index ? index - 1 : index, 0, id);
  return next;
}
