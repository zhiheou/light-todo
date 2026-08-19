import type { Memo, Mode } from "../types";

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

export function loadWorkMemos(): Memo[] {
  const raw = localStorage.getItem(WORK_KEY);
  if (!raw) {
    const memos = seedMemos("work");
    saveWorkMemos(memos);
    return memos;
  }
  try {
    const parsed = JSON.parse(raw) as Memo[];
    return normalizeMemos(parsed);
  } catch {
    return [];
  }
}

export function saveWorkMemos(memos: Memo[]): void {
  localStorage.setItem(WORK_KEY, JSON.stringify(memos));
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
