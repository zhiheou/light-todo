import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 6 科：连续对话（多轮上下文）
 *
 * 最容易出 bug 的地方：用户一句接一句，机器的"记忆"要跟上。
 * 冻结时间：2026-09-04 10:00
 */
const NOW = new Date(2026, 8, 4, 10, 0);
const mk = (list: Array<Partial<any>> = []) => ({
  tasks: list.map((t, i) => ({
    id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "",
    remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t,
  })),
  persona: "work" as const,
  now: NOW,
});

describe("多轮：建→改→删 的完整流程", () => {
  it("第1轮 建待办 → 有 addTask 动作", () => {
    const r1 = answer("明天下午4点开会", mk());
    expect(r1.action?.type).toBe("addTask");
  });

  it("第2轮 改时间 → 需要知道是哪条（提供上下文后能改）", () => {
    // 模拟第1轮已建成：开会
    const ctx = mk([{ title: "开会", dueDate: "2026-09-05", dueTime: "16:00" }]);
    const r2 = answer("把开会改到明天下午3点", ctx);
    expect(r2.action?.type).toBe("updateTask");
    expect((r2.action as any).patch.dueTime).toBe("15:00");
  });

  it("第3轮 完成 → completeTask", () => {
    const ctx = mk([{ title: "开会", dueDate: "2026-09-05", dueTime: "15:00" }]);
    const r3 = answer("完成了 开会", ctx);
    expect(r3.action?.type).toBe("completeTask");
  });

  it("第4轮 删除 → confirm", () => {
    const ctx = mk([{ title: "开会" }]);
    const r4 = answer("删掉 开会", ctx);
    expect(r4.action?.type).toBe("confirm");
  });
});

describe("多轮：候选选择后的状态（choices 链路）", () => {
  it("列出候选 → 带 choices 且 op 正确", () => {
    const ctx = mk([{ title: "开会" }, { title: "开会纪要" }]);
    const r = answer("删掉 开会", ctx);
    expect(r.choices?.length).toBe(2);
    expect(r.localOnly).toBe(true);
  });

  it("候选的 id 与任务一致，可被上层执行", () => {
    const ctx = mk([{ title: "开会", id: "x1" }, { title: "开会纪要", id: "x2" }]);
    const r = answer("删掉 开会", ctx);
    expect(r.choices?.map((c) => c.id).sort()).toEqual(["x1", "x2"]);
  });
});

describe("多轮：用户改主意/说错话", () => {
  it("「算了」→ 不该产生动作", () => {
    const r = answer("算了", mk([{ title: "开会" }]));
    expect(r.action).toBeUndefined();
  });
  it("「不对，我说的是明天的」→ 不该崩", () => {
    const r = answer("不对，我说的是明天的", mk([{ title: "开会" }]));
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });
  it("「不是这个」→ 不该产生删除动作", () => {
    const r = answer("不是这个", mk([{ title: "开会" }]));
    expect(r.action?.type).not.toBe("deleteTask");
  });
});

describe("多轮：情绪转任务（用户先倾诉后想记）", () => {
  it("先倾诉 → 走共情询问", () => {
    const r = answer("今天真的好累", mk());
    expect(r.action?.type).toBe("askRecordFeeling");
  });
  it("改主意想记成待办 → 能建任务", () => {
    const r = answer("帮我记个待办：明天去医院", mk());
    expect(r.action?.type).toBe("addTask");
  });
});

describe("多轮：同一句话在不同数据下结果不同", () => {
  it("有 1 条『开会』→ 直接确认删除", () => {
    const r = answer("删掉 开会", mk([{ title: "开会" }]));
    expect(r.action?.type).toBe("confirm");
  });
  it("有 3 条含『开会』→ 列候选", () => {
    const r = answer("删掉 开会", mk([{ title: "开会" }, { title: "五点开会" }, { title: "开会纪要" }]));
    expect(r.choices?.length).toBe(3);
  });
  it("没有『开会』→ 明确说没找到（不许假删）", () => {
    const r = answer("删掉 开会", mk([{ title: "买菜" }]));
    expect(r.localOnly).toBe(true);
    expect(r.text).toMatch(/没找到/);
  });
});
