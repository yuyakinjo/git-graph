import { avatarColor, initials } from "../lib/format";
import { useStore } from "../state/store";

/**
 * 作者アイコン。GitHub のアバターが引けていればそれを、引けない
 * (gh なし / GitHub ユーザー不明) 場合はイニシャルを出す。
 * 画像は下に敷いたイニシャルの上に重ねるだけなので、読み込みに失敗しても
 * そのままイニシャルが見える (= onError の state 管理が要らない)。
 */
export function Avatar({
  name,
  email,
  big = false,
}: {
  name: string;
  email: string;
  big?: boolean;
}) {
  const url = useStore().avatars[email.trim().toLowerCase()];
  return (
    <span
      className={`relative inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-bold text-avatar-fg ${
        big ? "h-7.5 w-7.5 text-[12px]" : "h-5.5 w-5.5 text-[11px]"
      }`}
      style={{ background: avatarColor(email || name) }}
    >
      {initials(name)}
      {url ? (
        <img
          className="absolute inset-0 block h-full w-full rounded-full object-cover"
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
        />
      ) : null}
    </span>
  );
}
