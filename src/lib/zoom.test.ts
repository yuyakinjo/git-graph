import { describe, expect, test } from "bun:test";
import { clampZoom, loadZoom, saveZoom, zoomKeyAction, zoomLabel } from "./zoom";

describe("clampZoom", () => {
  test("範囲に収め、浮動小数の誤差を丸める", () => {
    expect(clampZoom(1 + 0.05)).toBe(1.05);
    expect(clampZoom(0.1 * 3 + 0.8)).toBe(1.1);
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(5)).toBe(2);
  });

  test("数でなければ等倍", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("loadZoom / saveZoom", () => {
  test("未保存なら等倍", () => {
    expect(loadZoom()).toBe(1);
  });

  test("保存した値を読み戻す", () => {
    saveZoom(1.25);
    expect(loadZoom()).toBe(1.25);
  });

  test("壊れた値・範囲外の値は補正する", () => {
    localStorage.setItem("gitgraph.zoom", "abc");
    expect(loadZoom()).toBe(1);
    localStorage.setItem("gitgraph.zoom", "10");
    expect(loadZoom()).toBe(2);
  });
});

test("zoomLabel はパーセント表記", () => {
  expect(zoomLabel(0.9)).toBe("90%");
  expect(zoomLabel(1.25)).toBe("125%");
});

describe("zoomKeyAction", () => {
  const key = (init: Partial<KeyboardEvent>) =>
    ({
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "",
      key: "",
      ...init,
    }) as KeyboardEvent;

  test("Cmd / Ctrl が無ければ対象外", () => {
    expect(zoomKeyAction(key({ code: "Minus", key: "-" }))).toBeNull();
  });

  test("物理キーで判定する", () => {
    expect(zoomKeyAction(key({ metaKey: true, code: "Minus", key: "-" }))).toBe("out");
    expect(zoomKeyAction(key({ ctrlKey: true, code: "Equal", key: "=" }))).toBe("in");
    expect(zoomKeyAction(key({ metaKey: true, code: "NumpadAdd" }))).toBe("in");
    expect(zoomKeyAction(key({ metaKey: true, code: "NumpadSubtract" }))).toBe("out");
    expect(zoomKeyAction(key({ metaKey: true, code: "Digit0", key: "0" }))).toBe("reset");
    expect(zoomKeyAction(key({ metaKey: true, code: "Numpad0" }))).toBe("reset");
  });

  test("JIS の Cmd+Shift+- は e.key が - でも拡大", () => {
    expect(zoomKeyAction(key({ metaKey: true, shiftKey: true, code: "Minus", key: "-" }))).toBe(
      "in",
    );
  });

  test("JIS の ; は Shift 付き (+) のときだけ拡大", () => {
    expect(zoomKeyAction(key({ metaKey: true, shiftKey: true, code: "Semicolon" }))).toBe("in");
    expect(zoomKeyAction(key({ metaKey: true, code: "Semicolon" }))).toBeNull();
  });

  test("関係ない物理キーは e.key を見ない", () => {
    expect(zoomKeyAction(key({ metaKey: true, code: "KeyA", key: "0" }))).toBeNull();
  });

  test("code が取れない環境では e.key で判定する", () => {
    expect(zoomKeyAction(key({ metaKey: true, key: "-" }))).toBe("out");
    expect(zoomKeyAction(key({ metaKey: true, key: "_" }))).toBe("out");
    expect(zoomKeyAction(key({ metaKey: true, key: "+" }))).toBe("in");
    expect(zoomKeyAction(key({ metaKey: true, key: "=" }))).toBe("in");
    expect(zoomKeyAction(key({ metaKey: true, key: "0" }))).toBe("reset");
    expect(zoomKeyAction(key({ metaKey: true, key: "a" }))).toBeNull();
  });
});
