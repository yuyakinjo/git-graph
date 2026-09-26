import type { HTMLAttributes } from "react";

/** ペイン間のすき間そのものがつまみ。ホバー中だけ中央に細い線を出す */
const SPLITTER =
  "group/split relative w-1.5 flex-none cursor-col-resize after:absolute after:inset-y-2 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:transition-[background] after:duration-150 hover:after:bg-accent";

/** つかめる場所だと分かるよう、すき間の中央に縦 3 点を置く (線の上でも見えるよう地の色で縁取る) */
const GRIP_DOT =
  "size-0.75 rounded-full bg-fg-faint ring-1 ring-bg-0 transition-[background] duration-150 group-hover/split:bg-accent";

export function Splitter(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={SPLITTER} {...props}>
      <span className="pointer-events-none absolute top-1/2 left-1/2 z-1 flex -translate-1/2 flex-col gap-0.75">
        <span className={GRIP_DOT} />
        <span className={GRIP_DOT} />
        <span className={GRIP_DOT} />
      </span>
    </div>
  );
}
