// 维度持久化（localStorage）。维度随账号加密同步（AppData.workDimensions/personalDimensions）。
import type { Dimension, Mode } from "../types";
import { makeDimension, normalizeDimensions } from "./dimensions";

const WORK_KEY = "lighttodo:work-dimensions:v1";

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

export function loadWorkDimensions(): Dimension[] {
  const raw = localStorage.getItem(WORK_KEY);
  if (!raw) {
    const dims = seedDimensions("work");
    saveWorkDimensions(dims);
    return dims;
  }
  try {
    return normalizeDimensions(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWorkDimensions(dims: Dimension[]): void {
  localStorage.setItem(WORK_KEY, JSON.stringify(dims));
}
