import type { BranchInfo } from "./types";

export type BranchNode =
  | { type: "leaf"; key: string; label: string; branch: BranchInfo }
  | { type: "folder"; key: string; label: string; children: BranchNode[]; count: number };

interface Dir {
  path: string;
  /** 挿入順を保つため Map (ストア側の並び順をそのまま引き継ぐ) */
  dirs: Map<string, Dir>;
  leaves: { label: string; branch: BranchInfo }[];
}

const newDir = (path: string): Dir => ({ path, dirs: new Map(), leaves: [] });

/**
 * ブランチ名の "/" を階層とみなしてツリー化する。
 *
 * リモートは先頭のリモート名 (origin など) も 1 階層として扱う。
 * 子が 1 つしかない中間フォルダは VS Code 同様 "a/b" と畳んで表示する。
 */
export function buildBranchTree(branches: BranchInfo[]): BranchNode[] {
  const root = newDir("");
  for (const b of branches) {
    const parts = b.name.split("/");
    const label = parts.pop() as string;
    let dir = root;
    for (const part of parts) {
      const path = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.dirs.get(part);
      if (!next) {
        next = newDir(path);
        dir.dirs.set(part, next);
      }
      dir = next;
    }
    dir.leaves.push({ label, branch: b });
  }
  return toNodes(root);
}

function leafCount(dir: Dir): number {
  let n = dir.leaves.length;
  for (const child of dir.dirs.values()) n += leafCount(child);
  return n;
}

function toNodes(dir: Dir): BranchNode[] {
  const folders: BranchNode[] = [];
  for (const [name, child] of dir.dirs) folders.push(folderNode(name, child));
  const leaves: BranchNode[] = dir.leaves.map(({ label, branch }) => ({
    type: "leaf",
    key: branch.full,
    label,
    branch,
  }));
  return [...folders, ...leaves];
}

function folderNode(label: string, dir: Dir): BranchNode {
  // 子が中間フォルダ 1 つだけなら、その子とラベルを連結して階層を減らす
  if (dir.leaves.length === 0 && dir.dirs.size === 1) {
    const [name, child] = [...dir.dirs][0];
    const merged = folderNode(name, child);
    if (merged.type === "folder") return { ...merged, label: `${label}/${merged.label}` };
  }
  return { type: "folder", key: dir.path, label, children: toNodes(dir), count: leafCount(dir) };
}
