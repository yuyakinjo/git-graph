import type { RefDeco } from "./types";

/** Only an actual upstream on this commit can be collapsed with its local branch. */
export function groupRefs(refs: RefDeco[], upstreams: Map<string, string>) {
  const primary =
    refs.find((r) => r.kind === "head" && r.isHead) ??
    refs.find((r) => r.kind === "head") ??
    refs[0];
  const upstream = primary?.kind === "head" ? upstreams.get(primary.name) : undefined;
  const tracking = upstream
    ? refs.find((r) => r.kind === "remote" && r.name === upstream)
    : undefined;
  return { primary, tracking, others: refs.filter((r) => r !== primary && r !== tracking) };
}
