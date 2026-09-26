/**
 * 外から来る値 (localStorage の保存値や AI の応答) を zod で読むときの共通部品。
 */
import * as z from "zod/mini";

/** 配列のうち item に合う要素だけを残す。壊れた要素が混じっていても全体は捨てない。 */
export const lenientArray = <T extends z.ZodMiniType>(item: T) =>
  z.pipe(
    z.array(z.unknown()),
    z.transform((values) =>
      values.flatMap((v) => {
        const r = item.safeParse(v);
        return r.success ? [r.data as z.output<T>] : [];
      }),
    ),
  );

/** localStorage の JSON を schema で読む。無い・壊れている・形が合わないときは fallback。 */
export function readStored<S extends z.ZodMiniType, F = z.output<S>>(
  key: string,
  schema: S,
  fallback: F,
): z.output<S> | F {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    const r = schema.safeParse(JSON.parse(saved));
    return r.success ? r.data : fallback;
  } catch {
    return fallback;
  }
}
