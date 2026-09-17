/**
 * アプリ内で唯一 useEffect の使用が許可されたファイル (.oxlintrc.json の overrides 参照)。
 *
 * 「React の外側 (window / タイマー) を購読する」以外の用途で使わないこと。
 * データ取得・派生値・state の同期は必ずイベントハンドラか描画中の計算で行う。
 */
import { useEffect, useRef } from "react";

/** 常に最新のハンドラを指す ref。購読の張り直しを避けるために使う。 */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** window イベントを購読する。ハンドラは毎レンダー最新のものが呼ばれる。 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
) {
  const latest = useLatest(handler);
  useEffect(() => {
    const h = (e: Event) => latest.current(e as WindowEventMap[K]);
    window.addEventListener(type, h);
    return () => window.removeEventListener(type, h);
  }, [type, latest]);
}

/** ms 間隔で fn を呼ぶ。ms が null の間は停止する。 */
export function useInterval(fn: () => void, ms: number | null) {
  const latest = useLatest(fn);
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => latest.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, latest]);
}
