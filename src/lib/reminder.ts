/**
 * 提醒判断（纯函数，便于测试）。
 *
 * 为什么要单独抽出来：原实现把"哪些该提醒"埋在 App 的 setInterval 里，
 * 无法测试，且"已提醒"用内存 ref（刷新即丢 → 重复提醒）。抽成纯函数后可：
 *  - 单测覆盖"该提醒/不重复/不误报"
 *  - App 只需把结果喂给持久化的已提醒集合
 */

export interface RemindableTask {
  id: string;
  title: string;
  completed: boolean;
  remindAt: string; // ISO
}

/**
 * 计算"此刻应该提醒的任务"：到点(remindAt<=now) + 未完成 + 不在已提醒集合。
 * @param tasks 当前空间任务
 * @param alreadyNotified 已提醒过的任务 id 集合（调用方负责持久化）
 * @param now 参考时间
 */
export function computeDueReminders(
  tasks: RemindableTask[],
  alreadyNotified: Set<string>,
  now: Date,
): RemindableTask[] {
  const due: RemindableTask[] = [];
  for (const t of tasks) {
    if (t.completed || !t.remindAt) continue;
    if (alreadyNotified.has(t.id)) continue;
    const at = new Date(t.remindAt).getTime();
    if (Number.isNaN(at)) continue;
    if (at <= now.getTime()) due.push(t);
  }
  return due;
}

/**
 * 「已提醒」持久化：防刷新后同一提醒重复弹。
 * 本机 localStorage，按空间分仓；只存任务 id，不含任何内容（隐私安全）。
 */
const NOTIFIED_KEY = "lighttodo:notified:v1:";

export function loadNotified(mode: "work" | "personal"): Set<string> {
  try {
    const raw = localStorage.getItem(`${NOTIFIED_KEY}${mode}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveNotified(mode: "work" | "personal", ids: Set<string>): void {
  try {
    localStorage.setItem(`${NOTIFIED_KEY}${mode}`, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function clearNotified(mode: "work" | "personal"): void {
  try {
    localStorage.removeItem(`${NOTIFIED_KEY}${mode}`);
  } catch {
    /* ignore */
  }
}
