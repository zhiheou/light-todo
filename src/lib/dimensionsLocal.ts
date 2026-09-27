// 维度持久化（localStorage）。维度随账号加密同步（AppData.workDimensions/personalDimensions）。
import type { Dimension, Mode } from "../types";
import { makeDimension, normalizeDimensions } from "./dimensions";
import { authTransitionActive } from "./syncLock";

const WORK_KEY = "lighttodo:work-dimensions:v1";
const PERSONAL_KEY = "lighttodo:personal-dimensions:v1";

function keyFor(mode: Mode): string {
  return mode === "work" ? WORK_KEY : PERSONAL_KEY;
}

function seedDimensions(mode: Mode): Dimension[] {
  const now = Date.now();
  const dims =
    mode === "work"
      ? [
          { name: "工作", color: "coral" },
          { name: "学习", color: "violet" },
          { name: "健康", color: "teal" },
        ]
      : [
          { name: "生活", color: "rose" },
          { name: "家庭", color: "amber" },
        ];
  return dims.map((d, i) =>
    makeDimension({ name: d.name, color: d.color, sortOrder: i, createdAt: now }),
  );
}

export function loadDimensions(mode: Mode): Dimension[] {
  const raw = localStorage.getItem(keyFor(mode));
  if (!raw) {
    /**
     * 只在**工作空间**补种子。
     *
     * v3.9.23：个人空间之前根本没有本机存档（读到的永远是空），
     * 现在它也有了 —— 如果也给它 seed，第一次进个人空间就会凭空冒出
     * 「生活/家庭」两个假维度，还不等用户登录就被当成他的数据上传。
     * 工作空间保留这个行为是因为 App 的维度页一直靠它兜底。
     */
    if (mode !== "work") return [];
    const dims = seedDimensions("work");
    saveDimensions("work", dims);
    return dims;
  }
  try {
    return normalizeDimensions(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * v3.9.23 🔴 认证流程进行中一律不落盘。
 *
 * `resetAllLocalData()` 会把维度清成 `[]`，持久化 effect 紧接着就把这个空列表写进磁盘 ——
 * 那是「清界面上的旧账号残留」，**不是用户删了维度**。
 * 原来只有任务/备忘（tasks.ts / memos.ts）有这个闸门，维度没有，于是：
 *   登录/重开 → 先把磁盘上的维度抹成空 → 「留住本机」分支回头 `loadDimensions()` 读回来的是空的
 *   → 800ms 后自动上传，**连服务器上那份维度也一起覆盖成空**。
 * 现在跟 tasks/memos 对齐：闸门内直接返回，且**在去重记账之前返回**。
 */
export function saveDimensions(mode: Mode, dims: Dimension[]): void {
  if (authTransitionActive()) return;
  try {
    localStorage.setItem(keyFor(mode), JSON.stringify(dims));
  } catch {
    /* 存储写满/被禁用：忽略，别让界面崩（与 tasks.ts 同策略） */
  }
}

export function loadWorkDimensions(): Dimension[] {
  return loadDimensions("work");
}

export function saveWorkDimensions(dims: Dimension[]): void {
  saveDimensions("work", dims);
}

export function loadPersonalDimensions(): Dimension[] {
  return loadDimensions("personal");
}

export function savePersonalDimensions(dims: Dimension[]): void {
  saveDimensions("personal", dims);
}
