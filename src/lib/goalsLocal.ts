// 目标持久化（localStorage）。目标随账号加密同步（AppData.workGoals/personalGoals）。
import type { Goal } from "../types";
import { normalizeGoals } from "./goals";

const WORK_KEY = "lighttodo:work-goals:v1";

export function loadWorkGoals(): Goal[] {
  const raw = localStorage.getItem(WORK_KEY);
  if (!raw) return [];
  try {
    return normalizeGoals(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWorkGoals(goals: Goal[]): void {
  localStorage.setItem(WORK_KEY, JSON.stringify(goals));
}
