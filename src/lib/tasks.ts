import type { Mode, RepeatFreq, RepeatRule, Task, ViewFilter, SortMode } from "../types";
import { nextOccurrence, toDateString } from "./repeat";

const WORK_KEY = "lighttodo:work:v1";
const PERSONAL_KEY = "lighttodo:personal:v1";

function keyFor(mode: Mode): string {
  return mode === "work" ? WORK_KEY : PERSONAL_KEY;
}

export function makeTask(partial: Partial<Task> = {}): Task {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "",
    notes: "",
    priority: 3,
    dueDate: "",
    dueTime: "",
    remindAt: "",
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function at(
  now: Date,
  days: number,
  time: string,
): { dueDate: string; dueTime: string; remindAt: string } {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const [hour, minute] = time.split(":").map(Number);
  d.setHours(hour, minute, 0, 0);
  return { dueDate: toDateString(d), dueTime: time, remindAt: d.toISOString() };
}

export function seedTasks(mode: Mode, now: Date): Task[] {
  const base = {
    notes: "",
    completed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (mode === "work") {
    const a = at(now, 0, "17:00");
    const b = at(now, 0, "14:00");
    const c = at(now, 1, "10:00");
    const d = at(now, 0, "15:00");
    const e = at(now, 3, "09:30");
    return [
      { ...base, ...a, id: crypto.randomUUID(), title: "提交周报", priority: 1 as const },
      { ...base, ...b, id: crypto.randomUUID(), title: "回复客户邮件", priority: 2 as const },
      { ...base, ...c, id: crypto.randomUUID(), title: "整理项目进度", priority: 2 as const },
      { ...base, ...d, id: crypto.randomUUID(), title: "预订会议室", priority: 3 as const },
      { ...base, ...e, id: crypto.randomUUID(), title: "阅读行业文章", priority: 4 as const },
    ];
  }

  const a = at(now, 0, "19:00");
  const b = at(now, 0, "20:30");
  const c = at(now, 2, "09:30");
  const d = at(now, 1, "18:00");
  return [
    { ...base, ...a, id: crypto.randomUUID(), title: "取快递", priority: 2 as const },
    { ...base, ...b, id: crypto.randomUUID(), title: "给家里打电话", priority: 1 as const },
    { ...base, ...c, id: crypto.randomUUID(), title: "预约体检", priority: 3 as const },
    { ...base, ...d, id: crypto.randomUUID(), title: "买本周食材", priority: 2 as const },
  ];
}

export function loadTasks(mode: Mode, now = new Date()): Task[] {
  const raw = localStorage.getItem(keyFor(mode));
  if (!raw) {
    const tasks = seedTasks(mode, now);
    saveTasks(mode, tasks);
    return tasks;
  }
  try {
    const parsed = JSON.parse(raw) as Task[];
    return normalizeTasks(parsed);
  } catch {
    return seedTasks(mode, now);
  }
}

export function legacyPersonalTasks(): Task[] | null {
  const raw = localStorage.getItem(PERSONAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Task[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const REPEAT_FREQS: RepeatFreq[] = ["daily", "weekday", "weekly", "monthly", "interval"];

// 归一化单条任务：兜底脏数据、校验 repeat 合法性。所有任务数据入口都要过一遍。
export function normalizeTask(raw: unknown): Task {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Task>;
  const task: Task = {
    id: typeof t.id === "string" ? t.id : crypto.randomUUID(),
    title: typeof t.title === "string" ? t.title : "",
    notes: typeof t.notes === "string" ? t.notes : "",
    priority: t.priority === 1 || t.priority === 2 || t.priority === 3 || t.priority === 4 ? t.priority : 3,
    dueDate: typeof t.dueDate === "string" ? t.dueDate : "",
    dueTime: typeof t.dueTime === "string" ? t.dueTime : "",
    remindAt: typeof t.remindAt === "string" ? t.remindAt : "",
    completed: Boolean(t.completed),
    completedAt: typeof t.completedAt === "number" ? t.completedAt : undefined,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
  };
  const r = t.repeat;
  if (r && typeof r === "object" && REPEAT_FREQS.includes(r.freq)) {
    const rule: RepeatRule = {
      freq: r.freq,
      interval: typeof r.interval === "number" && r.interval >= 1 ? Math.floor(r.interval) : 1,
    };
    if (typeof r.weekday === "number") {
      const wd = Math.floor(r.weekday);
      if (wd >= 0 && wd <= 6) rule.weekday = wd;
    }
    if (typeof r.dayOfMonth === "number") {
      const dm = Math.floor(r.dayOfMonth);
      if (dm >= 1 && dm <= 31) rule.dayOfMonth = dm;
    }
    task.repeat = rule;
  }
  task.memoId = typeof t.memoId === "string" ? t.memoId : undefined;
  task.dimensionId = typeof t.dimensionId === "string" ? t.dimensionId : undefined;
  task.goalId = typeof t.goalId === "string" ? t.goalId : undefined;
  return task;
}

export function normalizeTasks(list: unknown[]): Task[] {
  return Array.isArray(list) ? list.map(normalizeTask) : [];
}

// 生成循环任务的下一实例。只在"未完成→完成"时调用。
// 规则：dueDate 按规则前进到严格晚于今天；提醒偏移沿用旧实例"截止-提醒"间隔（无则默认提前10分钟）。
export function nextTaskInstance(task: Task, now: Date): Task | null {
  if (!task.repeat) return null;
  const anchor = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = nextOccurrence(task.repeat, anchor, now);
  const dueDate = toDateString(due);

  // 提醒偏移：沿用旧实例"截止 - 提醒"间隔；非法/无提醒时默认提前 10 分钟
  let lead = 10 * 60 * 1000;
  if (task.remindAt && task.dueDate) {
    const oldDue = new Date(`${task.dueDate}T${task.dueTime || "09:00"}:00`);
    const diff = oldDue.getTime() - new Date(task.remindAt).getTime();
    if (diff > 0) lead = diff;
  }
  let remindAt = "";
  if (task.dueTime) {
    const at = new Date(`${dueDate}T${task.dueTime}:00`);
    remindAt = new Date(at.getTime() - lead).toISOString();
  }

  return makeTask({
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    dueDate,
    dueTime: task.dueTime,
    remindAt,
    repeat: task.repeat,
    memoId: task.memoId,
    completed: false,
  });
}

// 勾选完成切换。仅在 未完成→完成 方向为循环任务生成下一实例（spawned 插入列表顶部）。
export function toggleCompleted(
  tasks: Task[],
  id: string,
  now: Date,
): { tasks: Task[]; spawned: Task | null } {
  let spawned: Task | null = null;
  const next = tasks.map((task) => {
    if (task.id !== id) return task;
    const wasDone = task.completed;
    if (!wasDone && task.repeat) spawned = nextTaskInstance(task, now);
    return {
      ...task,
      completed: !wasDone,
      // 完成时记录完成时间；取消完成时清除，避免旧时间残留
      completedAt: !wasDone ? now.getTime() : undefined,
      updatedAt: now.getTime(),
    };
  });
  if (spawned) next.unshift(spawned);
  return { tasks: next, spawned };
}

export function saveTasks(mode: Mode, tasks: Task[]): void {
  localStorage.setItem(keyFor(mode), JSON.stringify(tasks));
}

export function isOverdue(task: Task, now: Date): boolean {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(`${task.dueDate}T${task.dueTime || "23:59"}:59`);
  return due.getTime() < now.getTime();
}

// 是否在今天完成（按 completedAt 所在自然日判断）
export function isCompletedToday(task: Task, now: Date): boolean {
  if (!task.completed || typeof task.completedAt !== "number") return false;
  return toDateString(new Date(task.completedAt)) === toDateString(now);
}

export function filterTasks(
  tasks: Task[],
  view: ViewFilter,
  search: string,
  now: Date,
  opts?: { showCompleted?: boolean },
): Task[] {
  const query = search.trim().toLowerCase();
  const filtered = tasks.filter((task) => {
    if (query) {
      const haystack = `${task.title} ${task.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (view === "done") return task.completed;
    if (task.completed) return !!opts?.showCompleted;
    if (view === "today") {
      return isOverdue(task, now) || task.dueDate === toDateString(now);
    }
    return true;
  });
  return filtered;
}

function dueKey(task: Task): string {
  return `${task.dueDate || "9999-12-31"}T${task.dueTime || "23:59"}`;
}

export function sortTasks(tasks: Task[], sortMode: SortMode): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (sortMode === "due") {
      return (
        dueKey(a).localeCompare(dueKey(b)) ||
        a.priority - b.priority ||
        b.createdAt - a.createdAt
      );
    }
    return (
      a.priority - b.priority ||
      dueKey(a).localeCompare(dueKey(b)) ||
      b.createdAt - a.createdAt
    );
  });
}

export function formatDue(task: Task, now: Date): string {
  if (!task.dueDate) return "";
  const today = toDateString(now);
  const tomorrow = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const [, m, d] = task.dueDate.split("-").map(Number);
  const dateLabel =
    task.dueDate === today
      ? "今天"
      : task.dueDate === tomorrow
        ? "明天"
        : `${m}月${d}日`;
  return task.dueTime ? `${dateLabel} ${task.dueTime}` : dateLabel;
}

// 完成时间标签：「完成于 今天 09:30」/「完成于 昨天 21:00」/「完成于 8月31日」
export function formatCompletedAt(task: Task, now: Date): string {
  if (!task.completed || typeof task.completedAt !== "number") return "";
  const at = new Date(task.completedAt);
  const atKey = toDateString(at);
  const today = toDateString(now);
  const yesterday = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const dateLabel =
    atKey === today ? "今天" : atKey === yesterday ? "昨天" : `${at.getMonth() + 1}月${at.getDate()}日`;
  return `${dateLabel} ${time}`;
}
