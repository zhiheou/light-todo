import type { Mode } from "../types";

/**
 * 轻宜「学习日志」：记录**没答好/兜底/报错**的对话，供分析优化。
 *
 * 设计原则（隐私优先）：
 * - 只存**本机 localStorage**，绝不上传服务器（和个人空间访问码同级）。
 * - 只在"没答好"时记录（兜底/未识别/用户纠正），正常对话不记，避免噪音和隐私负担。
 * - 上限 200 条，超出丢最旧。
 * - 可一键清空、可导出（方便给开发者分析）。
 *
 * 用途（学习循环）：
 *   记录 → 定期分析高频未识别 → 转成规则/测试 → 上线 → 观察是否减少。
 */

const KEY = "lighttodo:mascot-learn:v1";
const MAX = 200;

export interface LearnEntry {
  /** 用户原话 */
  text: string;
  /** 轻宜当时的回复（截断） */
  reply: string;
  /** 类型：fallback=兜底猜 / unclear=未识别 / correct=用户纠正 / error=异常 */
  kind: "fallback" | "unclear" | "correct" | "error";
  mode: Mode;
  ts: number;
}

export function loadLearnLog(): LearnEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LearnEntry[];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.text === "string") : [];
  } catch {
    return [];
  }
}

export function logLearn(entry: Omit<LearnEntry, "ts">): void {
  try {
    const list = loadLearnLog();
    // 去重：同一句话最近记过就不再记
    if (list.some((e) => e.text === entry.text && Date.now() - e.ts < 24 * 3600 * 1000)) return;
    list.push({ ...entry, ts: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* ignore */
  }
}

export function clearLearnLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 导出为可读文本（给开发者分析用） */
export function exportLearnLog(): string {
  const list = loadLearnLog();
  if (list.length === 0) return "（暂无记录）";
  return list
    .map((e) => {
      const d = new Date(e.ts);
      const t = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `[${t}][${e.kind}] "${e.text}" → "${e.reply.slice(0, 40)}"`;
    })
    .join("\n");
}

/** 按用户原话统计（找高频没答好的句子 → 优先修） */
export function summarizeLearnLog(): Array<{ text: string; count: number }> {
  const map = new Map<string, number>();
  for (const e of loadLearnLog()) {
    map.set(e.text, (map.get(e.text) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

/**
 * v3.9 上报到服务端汇总（让所有用户遇到的坑汇总到一起统一优化）。
 *
 * 隐私边界（重要，写给用户看的）：
 *   - 只在"没答好"时上报**你刚说的那句话**（截断 120 字）
 *   - **绝不上报**你的任务标题、备忘内容、账号名
 *   - 可关闭（设置"帮助改进（上报没答好的话）"，默认开）
 *
 * 为什么需要：本机记录只帮你自己；上报后所有用户的坑汇总，才能一次修好、所有新用户都受益。
 */
const UPLOAD_KEY = "lighttodo:learn-upload:v1";

export function isUploadOn(): boolean {
  try {
    return localStorage.getItem(UPLOAD_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setUploadOn(on: boolean): void {
  try {
    localStorage.setItem(UPLOAD_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** 上报一条（fire-and-forget，失败不影响使用） */
export function reportFallback(text: string, kind: string, mode: string, replyLen: number): void {
  if (!isUploadOn()) return;
  try {
    void fetch("/api/fallback-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ text: text.slice(0, 120), kind, mode, replyLen }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
