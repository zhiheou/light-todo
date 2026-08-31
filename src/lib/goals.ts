// 目标（年/月/周）：纯函数 + normalize + 周期过滤。与现有 lib 同风格。
import type { Goal, GoalPeriod, Task } from "../types";

export function makeGoal(partial: Partial<Goal> = {}): Goal {
  return {
    id: crypto.randomUUID(),
    title: "新目标",
    period: "month",
    anchor: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

export function normalizeGoal(raw: unknown): Goal {
  const g = (raw && typeof raw === "object" ? raw : {}) as Partial<Goal>;
  const period: GoalPeriod =
    g.period === "year" || g.period === "month" || g.period === "week" ? g.period : "month";
  return {
    id: typeof g.id === "string" ? g.id : crypto.randomUUID(),
    title: typeof g.title === "string" && g.title.trim() ? g.title.trim() : "未命名目标",
    period,
    anchor: typeof g.anchor === "string" ? g.anchor : "",
    ...(typeof g.note === "string" ? { note: g.note } : {}),
    createdAt: typeof g.createdAt === "number" ? g.createdAt : Date.now(),
    updatedAt: typeof g.updatedAt === "number" ? g.updatedAt : Date.now(),
  };
}

export function normalizeGoals(list: unknown): Goal[] {
  return Array.isArray(list) ? list.map(normalizeGoal) : [];
}

// 当前周期锚点（本地时区自然日）
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 某个目标所属的周期锚点是否包含给定日期（用于 today 关联提示 / 周目标卡片） */
export function anchorOf(period: GoalPeriod, d: Date): string {
  if (period === "year") return String(d.getFullYear());
  if (period === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  // week：所在周的周一
  const day = d.getDay();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day === 0 ? 6 : day - 1));
  return dateKey(monday);
}

/** 某目标的周期范围（用于「是否属于本周/本月/本年」展示） */
export function goalWindow(goal: Goal): { start: Date; end: Date } {
  if (goal.period === "year") {
    return { start: new Date(Number(goal.anchor), 0, 1), end: new Date(Number(goal.anchor), 11, 31) };
  }
  if (goal.period === "month") {
    const [y, m] = goal.anchor.split("-").map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  const [y, m, d] = goal.anchor.split("-").map(Number);
  return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 6) };
}

/** 目标是否处于「当前进行中」周期 */
export function goalIsActive(goal: Goal, now: Date): boolean {
  const { start, end } = goalWindow(goal);
  const nowTime = now.getTime();
  // 当天也算（结束日含当天）
  return nowTime >= start.getTime() && nowTime <= end.getTime() + 24 * 3600 * 1000 - 1;
}

/** 关联任务的进度：完成数 / 总数 / 比例。无关联任务 → 0/0/0 */
export function goalProgress(
  goal: Goal,
  tasks: Task[],
): { done: number; total: number; ratio: number } {
  const linked = tasks.filter((t) => t.goalId === goal.id);
  const total = linked.length;
  const done = linked.filter((t) => t.completed).length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** 目标按周期锚点倒序（最新的在前） */
export function sortGoals(list: Goal[]): Goal[] {
  return [...list].sort((a, b) => b.anchor.localeCompare(a.anchor) || b.createdAt - a.createdAt);
}
