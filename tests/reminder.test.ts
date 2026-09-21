import { describe, it, expect } from "vitest";
import { computeDueReminders, type RemindableTask } from "../src/lib/reminder";

/**
 * 轻宜「考试系统」· 第 3 科：提醒不漏 + 不重复
 *
 * 背景：原实现用内存 ref 记"已提醒"，刷新页面就清空 → 同一提醒反复弹。
 * 这里测"该提醒的要提醒、提醒过的不重复、没到点的不提醒"。
 * 冻结参考时间：2026-09-04 10:00
 */
const NOW = new Date(2026, 8, 4, 10, 0);

const T = (over: Partial<RemindableTask>): RemindableTask => ({
  id: "t1",
  title: "开会",
  completed: false,
  remindAt: "",
  ...over,
});

describe("提醒：该提醒的要提醒", () => {
  it("remindAt 已到点且未完成 → 应提醒", () => {
    const tasks = [T({ id: "a", remindAt: new Date(2026, 8, 4, 9, 55).toISOString() })];
    const due = computeDueReminders(tasks, new Set(), NOW);
    expect(due.map((t) => t.id)).toEqual(["a"]);
  });

  it("提前 1 小时的任务，还没到点 → 不提醒", () => {
    const tasks = [T({ id: "b", remindAt: new Date(2026, 8, 4, 11, 0).toISOString() })];
    expect(computeDueReminders(tasks, new Set(), NOW)).toEqual([]);
  });
});

describe("提醒：提醒过的不重复（修 bug 回归）", () => {
  it("已在已提醒集合里 → 不再提醒（防刷新后重弹）", () => {
    const tasks = [T({ id: "a", remindAt: new Date(2026, 8, 4, 9, 55).toISOString() })];
    const already = new Set(["a"]);
    expect(computeDueReminders(tasks, already, NOW)).toEqual([]);
  });
});

describe("提醒：不该提醒的", () => {
  it("已完成的任务 → 不提醒", () => {
    const tasks = [T({ id: "a", completed: true, remindAt: new Date(2026, 8, 4, 9, 0).toISOString() })];
    expect(computeDueReminders(tasks, new Set(), NOW)).toEqual([]);
  });

  it("没有 remindAt 的任务 → 不提醒", () => {
    const tasks = [T({ id: "a", remindAt: "" })];
    expect(computeDueReminders(tasks, new Set(), NOW)).toEqual([]);
  });

  it("多条同时到点 → 全部提醒（不漏）", () => {
    const tasks = [
      T({ id: "a", remindAt: new Date(2026, 8, 4, 9, 0).toISOString() }),
      T({ id: "b", remindAt: new Date(2026, 8, 4, 9, 30).toISOString() }),
      T({ id: "c", remindAt: new Date(2026, 8, 4, 10, 30).toISOString() }),
    ];
    const due = computeDueReminders(tasks, new Set(), NOW);
    expect(due.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });
});
