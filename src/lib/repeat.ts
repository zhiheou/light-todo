// 循环任务规则：纯函数，只依赖 types。
// 职责：规则 → 标签文本；规则 + 基准日期 → 下一实例日期。
import type { RepeatRule } from "../types";

export const WEEKDAY_CN = ["日", "一", "二", "三", "四", "五", "六"] as const;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 徽标文本：短（"每天" / "每周一" / "每3天"）
export function shortRepeatLabel(rule: RepeatRule): string {
  switch (rule.freq) {
    case "daily":
      return "每天";
    case "weekday":
      return "工作日";
    case "weekly":
      return rule.weekday !== undefined ? `每周${WEEKDAY_CN[rule.weekday]}` : "每周";
    case "monthly":
      return rule.dayOfMonth !== undefined ? `每月${rule.dayOfMonth}日` : "每月";
    case "interval":
      return `每${rule.interval}天`;
  }
}

// tooltip 长文本（"每天重复" / "每周一重复" / "每隔3天重复"）
export function describeRepeat(rule: RepeatRule): string {
  switch (rule.freq) {
    case "daily":
      return "每天重复";
    case "weekday":
      return "每个工作日重复";
    case "weekly":
      return rule.weekday !== undefined ? `每周${WEEKDAY_CN[rule.weekday]}重复` : "每周重复";
    case "monthly":
      return rule.dayOfMonth !== undefined ? `每月${rule.dayOfMonth}日重复` : "每月重复";
    case "interval":
      return `每隔${rule.interval}天重复`;
  }
}

// 严格晚于 after 的下一实例日期（保留时分秒为 0 的时间分量语义）。
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function stepOccurrence(rule: RepeatRule, after: Date): Date {
  const base = startOfDay(after);
  switch (rule.freq) {
    case "daily": {
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      return d;
    }
    case "weekday": {
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return d;
    }
    case "weekly": {
      if (rule.weekday === undefined) {
        // 沿用基准日星期：锚点自身那一周的后 7 天
        const d = new Date(base);
        d.setDate(d.getDate() + 7);
        return d;
      }
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      while (d.getDay() !== rule.weekday) d.setDate(d.getDate() + 1);
      return d;
    }
    case "monthly": {
      const target = rule.dayOfMonth ?? base.getDate();
      // 从 after 所在月 1 号起步（当月若仍有满足日号且晚于 after 的日子，应优先），
      // 逐月找第一个 > after 且满足日号的日子
      const cand = new Date(base.getFullYear(), base.getMonth(), 1);
      for (let i = 0; i < 400; i++) {
        const lastDay = new Date(cand.getFullYear(), cand.getMonth() + 1, 0).getDate();
        const day = Math.min(target, lastDay); // 31 号在短月 → 月末
        const d = new Date(cand.getFullYear(), cand.getMonth(), day);
        if (d.getTime() > base.getTime()) return d;
        cand.setMonth(cand.getMonth() + 1);
      }
      return base;
    }
    case "interval": {
      const d = new Date(base);
      d.setDate(d.getDate() + Math.max(rule.interval, 1));
      return d;
    }
  }
}

// 从 anchor 起算的下一个实例，确保结果严格晚于 today。
// 完成迟到时不产生回落到过去/今天的实例（guard 上限防死循环）。
export function nextOccurrence(rule: RepeatRule, anchor: Date, now: Date): Date {
  let result = stepOccurrence(rule, anchor);
  const todayKey = toDateString(now);
  let guard = 0;
  while (toDateString(result) <= todayKey && guard < 400) {
    result = stepOccurrence(rule, result);
    guard += 1;
  }
  return result;
}
