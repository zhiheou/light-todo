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
    return Array.isArray(parsed) ? parsed : [];
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
