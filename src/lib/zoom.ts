/**
 * 画面の表示倍率 (VSCode の Cmd +/- 相当)。
 *
 * 値の持ち主は store (s.zoom)。このファイルは「保存」と「実際の webview への反映」、
 * そしてキー入力の解釈だけを受け持つ。
 *
 * 反映はまず webview 自体の倍率を変え、失敗した場合 (ブラウザで開いた dev など) は
 * CSS の zoom に落とす。
 */
import { getCurrentWebview } from "@tauri-apps/api/webview";

const ZOOM_KEY = "gitsquid.zoom";
export const ZOOM_STEP = 0.05;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
/** フッターのメニューに並べる倍率 */
export const ZOOM_PRESETS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** 0.05 刻みに丸めて範囲に収める。浮動小数の誤差で 1.0500000000000003 にしない。 */
export function clampZoom(z: number) {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

/** 保存済みの倍率。未設定なら等倍。 */
export function loadZoom() {
  return clampZoom(Number(localStorage.getItem(ZOOM_KEY)) || 1);
}

export function saveZoom(zoom: number) {
  localStorage.setItem(ZOOM_KEY, String(zoom));
}

/** 倍率を実際の表示に反映する (起動時と変更時に呼ぶ)。 */
export function applyZoom(zoom = loadZoom()) {
  getCurrentWebview()
    .setZoom(zoom)
    .catch(() => {
      // Tauri の外 (ブラウザ) や webview が非対応の場合のフォールバック
      document.documentElement.style.zoom = String(zoom);
    });
}

/** 表示用。0.9 → "90%" */
export function zoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * キー入力を倍率操作として解釈する。対象外なら null。
 *
 * Cmd/Ctrl + `-` で縮小、Shift を足すか `+` / `=` で拡大、`0` で等倍。
 *
 * 判定は e.key ではなく e.code (物理キー) を主に使う。macOS の WebKit は
 * Cmd を押している間 Shift を無視した文字を e.key に入れるため、JIS 配列の
 * Cmd+Shift+- が "-" として届き、拡大が縮小に化けてしまうのを避ける。
 */
export function zoomKeyAction(e: KeyboardEvent): "in" | "out" | "reset" | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  // Minus: US/JIS とも `-` の物理キー。Shift 付きは拡大 (JIS では `=`、US では `_`)
  if (e.code === "Minus" || e.code === "NumpadSubtract") return e.shiftKey ? "in" : "out";
  // Equal: US の `=`/`+`、Semicolon: JIS の `;`/`+`
  if (e.code === "Equal" || e.code === "NumpadAdd") return "in";
  if (e.code === "Semicolon" && e.shiftKey) return "in";
  if (e.code === "Digit0" || e.code === "Numpad0") return "reset";
  if (e.code) return null;
  // code が取れない環境向けの保険
  if (e.key === "-" || e.key === "_") return "out";
  if (e.key === "+" || e.key === "=") return "in";
  if (e.key === "0") return "reset";
  return null;
}
