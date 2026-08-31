// 维度：任务的分类挂载点。纯函数 + normalize，与现有 lib 同风格。
import type { Dimension } from "../types";

const DIMENSION_COLORS = ["coral", "teal", "amber", "violet", "rose"];

/** 维度配色：key → 具体色值（图表/进度条/圆点共用） */
export const DIMENSION_COLOR_MAP: Record<string, string> = {
  coral: "#E8836D",
  teal: "#4F9D8C",
  amber: "#E0A83C",
  violet: "#9C87D8",
  rose: "#D87A9B",
};

export function dimensionColor(key?: string): string {
  return (key && DIMENSION_COLOR_MAP[key]) || "#9CA3AF";
}

export function makeDimension(partial: Partial<Dimension> = {}): Dimension {
  return {
    id: crypto.randomUUID(),
    name: "新维度",
    color: DIMENSION_COLORS[0],
    sortOrder: 0,
    createdAt: Date.now(),
    ...partial,
  };
}

export function normalizeDimension(raw: unknown): Dimension {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<Dimension>;
  return {
    id: typeof d.id === "string" ? d.id : crypto.randomUUID(),
    name: typeof d.name === "string" && d.name.trim() ? d.name.trim() : "未命名维度",
    color: DIMENSION_COLORS.includes(d.color ?? "") ? d.color! : DIMENSION_COLORS[0],
    sortOrder: typeof d.sortOrder === "number" ? d.sortOrder : 0,
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
  };
}

export function normalizeDimensions(list: unknown): Dimension[] {
  return Array.isArray(list) ? list.map(normalizeDimension) : [];
}

/** 按 sortOrder 升序（稳定） */
export function sortDimensions(list: Dimension[]): Dimension[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function nextSortOrder(list: Dimension[]): number {
  return list.reduce((max, d) => Math.max(max, d.sortOrder), 0) + 1;
}
