import type { Memo, Mode } from "../types";
import { authTransitionActive, bumpLocalRevision } from "./syncLock";

const WORK_KEY = "lighttodo:work-memos:v1";
const PERSONAL_KEY = "lighttodo:personal-memos:v1";

export function makeMemo(partial: Partial<Memo> = {}): Memo {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    text: "",
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

// 归一化单条备忘：兜底脏数据、校验 tags。所有备忘数据入口都过一遍。
export function normalizeMemo(raw: unknown): Memo {
  const m = (raw && typeof raw === "object" ? raw : {}) as Partial<Memo>;
  const tags = Array.isArray(m.tags)
    ? Array.from(
        new Set(
          m.tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      )
    : undefined;
  return {
    id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
    text: typeof m.text === "string" ? m.text : "",
    pinned: Boolean(m.pinned),
    createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
    updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : Date.now(),
    ...(tags && tags.length > 0 ? { tags } : {}),
  };
}

export function normalizeMemos(list: unknown): Memo[] {
  return Array.isArray(list) ? list.map(normalizeMemo) : [];
}

export function seedMemos(mode: Mode): Memo[] {
  const base = { pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  if (mode === "work") {
    return [
      { ...base, id: crypto.randomUUID(), text: "客户电话：138-0000-0000" },
      { ...base, id: crypto.randomUUID(), text: "报销单本周五前提交" },
      { ...base, id: crypto.randomUUID(), text: "下季度 OKR 初稿思路" },
    ];
  }
  return [
    { ...base, id: crypto.randomUUID(), text: "家里路由器管理密码" },
    { ...base, id: crypto.randomUUID(), text: "爸妈生日：11 月 3 日" },
    { ...base, id: crypto.randomUUID(), text: "周末想看的电影清单" },
  ];
}

/**
 * 读取本机工作备忘。
 * ⚠️ v3.9.2：不再自动 seed（同 loadTasks）——挂载时写入会污染登录后的账号数据。
 */
export function loadWorkMemos(): Memo[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(WORK_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Memo[];
    return normalizeMemos(parsed);
  } catch {
    return [];
  }
}

/** 本窗口最近一次备忘写盘的内容 —— 用于"没变就别写"，防两个窗口互相写回旧值 */
const lastWritten = new Map<Mode, string>();

export function saveWorkMemos(memos: Memo[]): void {
  saveMemosByMode("work", memos);
}

/**
 * v3.9.22：写盘即"登记"，服务器旧数据不许再盖回来（见 lib/syncLock.ts）。
 * 同 saveTasks：**只有真改动才登记** —— 挂载时原样写回不算改动，
 * 否则启动即把水位顶到"现在"，服务器数据再也同步不进来。
 */
function saveMemosByMode(mode: Mode, memos: Memo[]): void {
  const key = mode === "work" ? WORK_KEY : PERSONAL_KEY;
  const json = JSON.stringify(memos);
  const prev = lastWritten.get(mode) ?? localStorage.getItem(key);
  // v3.9.22：认证流程进行中不落盘 —— 那是"清界面残留"引发的空写，不是用户删数据。
  // 写下去会把桌宠刚记的备忘从磁盘删掉（详见 syncLock.ts 的 beginAuthTransition）。
  // ⚠️ 必须在更新 lastWritten 之前返回，否则关闸后的真写会被当成重复而跳过
  if (authTransitionActive()) return;
  lastWritten.set(mode, json);
  if (prev === json) return;
  bumpLocalRevision();
  localStorage.setItem(key, json);
}

/**
 * 从 localStorage 读回备忘（跨窗口同步用）。
 * 只在**另一个窗口**改动过时才会返回新内容，同窗口自己写的返回 null（防止自激）。
 */
export function loadMemosIfChanged(mode: Mode): Memo[] | null {
  const raw = localStorage.getItem(mode === "work" ? WORK_KEY : PERSONAL_KEY);
  if (raw === null || raw === lastWritten.get(mode)) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeMemos(parsed) : null;
  } catch {
    return null;
  }
}

export function legacyPersonalMemos(): Memo[] | null {
  const raw = localStorage.getItem(PERSONAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Memo[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
