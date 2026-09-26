import { t } from "../i18n";

/** レーン色の数。実際の色は外観ごとに styles.css の --color-lane-N で持つ。 */
const LANE_COUNT = 12;

export const laneColor = (i: number) =>
  `var(--color-lane-${((i % LANE_COUNT) + LANE_COUNT) % LANE_COUNT})`;

export function relativeTime(unix: number): string {
  if (!unix) return "";
  const diff = Date.now() / 1000 - unix;
  const m = t().format;
  if (diff < 60) return m.justNow;
  if (diff < 3600) return m.minutesAgo(Math.floor(diff / 60));
  if (diff < 86400) return m.hoursAgo(Math.floor(diff / 3600));
  if (diff < 86400 * 30) return m.daysAgo(Math.floor(diff / 86400));
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

/** 変更種別 (A / M / D ...) の表示名。知らない記号はそのまま返す。 */
export function statusLabel(status: string): string {
  return t().format.status[status] ?? status;
}

export function basename(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

export function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}
