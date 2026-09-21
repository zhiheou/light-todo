import type { Mode } from "../types";

/**
 * 轻宜「记忆本」：把聊天记录持久化到本机 localStorage，刷新/关页面后不丢。
 *
 * 设计取舍（隐私优先）：
 * - 只存**本机**（localStorage），不上传服务器——和个人空间访问码同级的安全定位。
 * - 按空间分仓（work/personal），互不串（沿用 v3.5 双助理隔离）。
 * - 只保留最近 N 条，防无限膨胀。
 * - 有开关（lighttodo:mascot-memory:v1:on），用户可关掉。
 */

const KEY_PREFIX = "lighttodo:mascot-memory:v1:";
const MAX_MSGS = 60; // 每空间最多保留最近 60 条

export interface StoredMsg {
  role: "user" | "bot";
  text: string;
  ts: number;
}

function keyFor(mode: Mode): string {
  return `${KEY_PREFIX}${mode}`;
}

/** 记忆是否开启（默认开） */
export function isMemoryOn(): boolean {
  try {
    return localStorage.getItem(`${KEY_PREFIX}on`) !== "0";
  } catch {
    return true;
  }
}

export function setMemoryOn(on: boolean): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}on`, on ? "1" : "0");
    if (!on) {
      // 关闭时清掉已存的聊天，尊重用户
      localStorage.removeItem(keyFor("work"));
      localStorage.removeItem(keyFor("personal"));
    }
  } catch {
    /* ignore */
  }
}

export function loadChat(mode: Mode): StoredMsg[] {
  if (!isMemoryOn()) return [];
  try {
    const raw = localStorage.getItem(keyFor(mode));
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredMsg[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "bot"))
      .slice(-MAX_MSGS);
  } catch {
    return [];
  }
}

export function saveChat(mode: Mode, msgs: StoredMsg[]): void {
  if (!isMemoryOn()) return;
  try {
    localStorage.setItem(keyFor(mode), JSON.stringify(msgs.slice(-MAX_MSGS)));
  } catch {
    /* ignore quota errors */
  }
}

export function clearChatStorage(mode: Mode): void {
  try {
    localStorage.removeItem(keyFor(mode));
  } catch {
    /* ignore */
  }
}
