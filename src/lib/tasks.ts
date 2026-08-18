import type { Mode, Task, ViewFilter, SortMode } from "../types";

const WORK_KEY = "lighttodo:work:v1";
const PERSONAL_KEY = "lighttodo:personal:v1";

function keyFor(mode: Mode): string {
  return mode === "work" ? WORK_KEY : PERSONAL_KEY;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    return Array.isArray(parsed) ? parsed : seedTasks(mode, now);
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

export function saveTasks(mode: Mode, tasks: Task[]): void {
  localStorage.setItem(keyFor(mode), JSON.stringify(tasks));
}

export function isOverdue(task: Task, now: Date): boolean {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(`${task.dueDate}T${task.dueTime || "23:59"}:59`);
  return due.getTime() < now.getTime();
}

export function filterTasks(tasks: Task[], view: ViewFilter, search: string, now: Date): Task[] {
  const query = search.trim().toLowerCase();
  const filtered = tasks.filter((task) => {
    if (query) {
      const haystack = `${task.title} ${task.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (view === "done") return task.completed;
    if (task.completed) return false;
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
