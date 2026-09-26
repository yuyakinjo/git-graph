import { Spinner } from "./ui";

/** リポジトリを開いている間、操作できないことを示す覆い。 */
const VEIL =
  "absolute inset-0 z-40 flex animate-veil-in items-center justify-center bg-veil backdrop-blur-[1.5px]";

/** リポジトリを開いている間の表示。重いリポジトリでも押した手応えが残るようにする。 */
function Opening({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg-2 px-4.5 py-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
      <Spinner size={20} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[13px]">{path.split("/").filter(Boolean).pop()}</strong>
        <span className="font-mono text-[11px] text-fg-faint">
          {path.replace(/^\/Users\/[^/]+/, "~")}
        </span>
      </div>
    </div>
  );
}

/**
 * 開いている途中のリポジトリを覆いの上に出す。
 * solid は下に何も開いていないとき用で、透かさずに地の色で塗りつぶす。
 */
export function OpeningVeil({ path, solid = false }: { path: string; solid?: boolean }) {
  return (
    <div className={solid ? `${VEIL} bg-bg-1 backdrop-blur-none` : VEIL}>
      <Opening path={path} />
    </div>
  );
}
