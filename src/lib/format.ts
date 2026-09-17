const LANE_COLORS = [
  "#4FC3F7",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
  "#34D399",
  "#FB7185",
  "#60A5FA",
  "#C084FC",
  "#2DD4BF",
  "#F59E0B",
  "#818CF8",
  "#E879F9",
];

export const laneColor = (i: number) =>
  LANE_COLORS[((i % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length];

export function relativeTime(unix: number): string {
  if (!unix) return "";
  const diff = Date.now() / 1000 - unix;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 時間前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 日前`;
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}/${`${d.getMonth() + 1}`.padStart(2, "0")}/${`${d.getDate()}`.padStart(2, "0")}`;
}

export function absoluteTime(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const p = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "#5B8FF9",
  "#61DDAA",
  "#F6BD16",
  "#7262FD",
  "#78D3F8",
  "#9661BC",
  "#F6903D",
  "#008685",
  "#F08BB4",
  "#65789B",
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const statusLabel: Record<string, string> = {
  A: "追加",
  M: "変更",
  D: "削除",
  R: "リネーム",
  C: "コピー",
  T: "種別変更",
  "?": "未追跡",
  U: "衝突",
};

export function basename(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

export function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}
