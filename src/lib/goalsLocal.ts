// 目标持久化（localStorage）。目标随账号加密同步（AppData.workGoals/personalGoals）。
import type { Goal, Mode } from "../types";
import { normalizeGoals } from "./goals";
import { authTransitionActive } from "./syncLock";

const WORK_KEY = "lighttodo:work-goals:v1";
const PERSONAL_KEY = "lighttodo:personal-goals:v1";

function keyFor(mode: Mode): string {
  return mode === "work" ? WORK_KEY : PERSONAL_KEY;
}

export function loadGoals(mode: Mode): Goal[] {
  const raw = localStorage.getItem(keyFor(mode));
  if (!raw) return [];
  try {
    return normalizeGoals(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * v3.9.23 🔴 认证流程进行中一律不落盘 —— 同 dimensionsLocal.ts 的 saveDimensions。
 *
 * 登录/重开时 `resetAllLocalData()` 把目标清空，这个空写一旦落盘，
 * 「留住本机」分支读回的就是空的，还会被自动同步推到服务器覆盖掉真数据。
 */
export function saveGoals(mode: Mode, goals: Goal[]): void {
  if (authTransitionActive()) return;
  try {
    localStorage.setItem(keyFor(mode), JSON.stringify(goals));
  } catch {
    /* 存储写满/被禁用：忽略，别让界面崩 */
  }
}

export function loadWorkGoals(): Goal[] {
  return loadGoals("work");
}

export function saveWorkGoals(goals: Goal[]): void {
  saveGoals("work", goals);
}

export function loadPersonalGoals(): Goal[] {
  return loadGoals("personal");
}

export function savePersonalGoals(goals: Goal[]): void {
  saveGoals("personal", goals);
}
