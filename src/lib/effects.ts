/**
 * アプリ内で唯一 useEffect の使用が許可されたファイル (.oxlintrc.json の overrides 参照)。
 *
 * 「React の外側 (window / タイマー) を購読する」以外の用途で使わないこと。
 * データ取得・派生値・state の同期は必ずイベントハンドラか描画中の計算で行う。
 */
import { useEffect, useRef } from "react";

/**
 * 常に最新の値を指す ref。購読の張り直しを避けるために使う。
 *
 * 描画中の ref 書き換えは react/refs の対象だが、購読を張り直さずに
 * 「毎回最新のハンドラを呼ぶ」ための意図的なパターン (overrides で除外)。
 * 読み取り側はイベントハンドラ・タイマー・非同期処理に限ること。
 */
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

/** メディアクエリ (外観の切り替えなど) の一致状態が変わるたびに handler を呼ぶ。 */
export function useMediaChange(query: string, handler: (matches: boolean) => void) {
  const latest = useLatest(handler);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = (e: MediaQueryListEvent) => latest.current(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query, latest]);
}
