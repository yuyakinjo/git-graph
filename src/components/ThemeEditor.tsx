import { useState } from "react";
import { useT } from "../i18n";
import {
  isHexColor,
  KEY_COLORS,
  lowContrastKeys,
  schemeOfKeys,
  type CustomTheme,
  type KeyColor,
} from "../lib/theme";
import { useStore } from "../state/store";
import { btn, field, fieldInput, fieldLabel, hint } from "./classes";
import { useDialogs } from "./ui-context";

/**
 * カスタムテーマの編集欄 (設定のスタイルに出す)。
 * 名前とキーカラー 7 色だけを決め、残りの色は styles.css がキーカラーから作る。
 * 編集中の色は保存しなくても画面に当てて見せ、キャンセルしたら設定どおりに戻す
 * (設定ごと閉じたときは store の closeSettings が戻す)。
 */
export function ThemeEditor({
  initial,
  isNew,
  onClose,
}: {
  initial: CustomTheme;
  isNew: boolean;
  onClose: () => void;
}) {
  const s = useStore();
  const m = useT().settings;
  const dialogs = useDialogs();
  const [name, setName] = useState(initial.name);
  const [keys, setKeys] = useState(initial.keys);
  const scheme = schemeOfKeys(keys);
  const low = lowContrastKeys(keys);

  const setKey = (c: KeyColor, v: string) => {
    const next = { ...keys, [c]: v.toLowerCase() };
    setKeys(next);
    void s.previewTheme({ id: initial.id, scheme: schemeOfKeys(next), keys: next });
  };

  const cancel = () => {
    void s.previewTheme(null);
    onClose();
  };

  const save = () => {
    void s.saveCustomTheme({ id: initial.id, name: name.trim(), keys }, true);
    onClose();
  };

  const remove = async () => {
    const ok = await dialogs.confirm({
      title: m.deleteThemeTitle,
      message: m.deleteThemeMessage(initial.name),
      confirmLabel: m.deleteTheme,
      danger: true,
    });
    if (!ok) return;
    void s.deleteCustomTheme(initial.id);
    onClose();
  };

  return (
    <div className="mt-2.5 flex flex-col gap-2.5 rounded-md border border-line bg-bg-1 p-3">
      <p className="m-0 text-[12px] text-fg-dim">{m.customThemeDesc}</p>
      <div className={field}>
        <label className={fieldLabel} htmlFor="custom-theme-name">
          {m.customThemeName}
        </label>
        <input
          className={`${fieldInput} font-sans text-[12.5px]`}
          id="custom-theme-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {KEY_COLORS.map((c) => (
          <KeyColorField
            key={c}
            id={`custom-theme-${c}`}
            label={m.keyColors[c]}
            value={keys[c]}
            onChange={(v) => setKey(c, v)}
          />
        ))}
      </div>

      <em className={hint}>{m.customThemeScheme(scheme)}</em>
      {low.length ? (
        <em className="text-[11px] text-amber not-italic">
          {m.customThemeLowContrast(low.map((c) => m.keyColors[c]).join(", "))}
        </em>
      ) : null}

      <div className="flex items-center gap-1.5">
        <button className={btn("primary", "tiny")} disabled={!name.trim()} onClick={save}>
          {m.saveTheme}
        </button>
        <button className={btn("ghost", "tiny")} onClick={cancel}>
          {m.cancelTheme}
        </button>
        {!name.trim() ? <em className={hint}>{m.customThemeNameMissing}</em> : null}
        {!isNew ? (
          <button
            className={`${btn("outlineDanger", "tiny")} ml-auto`}
            onClick={() => void remove()}
          >
            {m.deleteTheme}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** fieldInput は w-full なので、幅を固定したい #rrggbb 欄は別に組む */
const HEX_INPUT =
  "w-[82px] flex-none rounded-md border border-line bg-bg-1 px-1.5 py-0.5 font-mono text-[11.5px] text-fg outline-none focus:border-accent";

/** 色を選ぶ欄。カラーピッカーのほか、#rrggbb を直接打ち込んでもよい。 */
function KeyColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // 打ち込み途中 (#12 など) の文字は、正しい形になるまで色に反映しない
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="color"
        className="h-6 w-8 flex-none cursor-pointer rounded border border-line bg-transparent p-0"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label
        className="min-w-0 flex-1 overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-fg-dim"
        htmlFor={id}
        title={label}
      >
        {label}
      </label>
      <input
        className={HEX_INPUT}
        id={id}
        spellCheck={false}
        value={typing ?? value}
        onFocus={() => setTyping(value)}
        onBlur={() => setTyping(null)}
        onChange={(e) => {
          const v = e.target.value.trim();
          setTyping(v);
          if (isHexColor(v)) onChange(v);
        }}
      />
    </div>
  );
}
