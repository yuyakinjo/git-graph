/**
 * stash のメッセージ (reflog の件名) を扱う。git は
 * `git stash push -m <msg>` なら "On <branch>: <msg>"、メッセージ無しなら
 * "WIP on <branch>: <sha> <subject>" という形で記録する。
 */

/** 先頭の "On <branch>: " / "WIP on <branch>: " と、その後ろの名前に分ける */
export function splitStashMessage(message: string): { branch: string | null; name: string } {
  const m = /^(?:WIP on|On) ([^:]+): (.*)$/s.exec(message);
  return m ? { branch: m[1], name: m[2] } : { branch: null, name: message };
}

/** 名前を変えたあとに記録するメッセージ。元のブランチの印は残す */
export function renamedStashMessage(message: string, name: string): string {
  const { branch } = splitStashMessage(message);
  return branch ? `On ${branch}: ${name.trim()}` : name.trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ボタン一つでスタッシュするときの名前。既存の名前と重ならないよう連番を足す */
export function uniqueStashName(existing: string[], now = new Date()): string {
  const base =
    `WIP ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const taken = new Set(existing.map((m) => splitStashMessage(m).name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}
