/**
 * bun test の共通セットアップ (bunfig.toml の preload)。
 *
 * Bun には localStorage が無いので、メモリ上の簡易実装を差し込む。
 * 日時の整形がマシンのタイムゾーンに左右されないよう TZ も固定する。
 */
import { beforeEach } from "bun:test";

process.env.TZ = "Asia/Tokyo";

class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  get length() {
    return this.#data.size;
  }
  clear() {
    this.#data.clear();
  }
  getItem(key: string) {
    return this.#data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#data.delete(key);
  }
  setItem(key: string, value: string) {
    this.#data.set(key, String(value));
  }
}

globalThis.localStorage = new MemoryStorage();

beforeEach(() => localStorage.clear());
