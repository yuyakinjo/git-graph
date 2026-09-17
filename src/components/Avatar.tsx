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
      className={`avatar ${big ? "big" : ""}`}
      style={{ background: avatarColor(email || name) }}
    >
      {initials(name)}
      {url ? <img className="avatar-img" src={url} alt="" loading="lazy" draggable={false} /> : null}
    </span>
  );
}
