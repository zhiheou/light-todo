import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 19 科：空内容 / 泛指指代
 *
 * 两个用户实测出来的真 bug：
 *   ① 输入「明天」→ 建了一个叫「**未命名任务**」的空壳
 *      （NLP 剥完只剩时间词时会填这个占位符，而对话层没拦它）
 *   ② 输入「把这个任务改到明天」→ 回"没找到要改的任务"
 *      （关键词里"这个/任务"被剥光 → 拿空串去匹配 → 匹配不到；
 *        而库里明明有任务，用户会觉得"这 AI 瞎了"）
 */

const ctx = {
  tasks: [
    { id: "1", title: "开会", completed: false, createdAt: 1, updatedAt: 1 },
    { id: "2", title: "写周报", completed: false, createdAt: 1, updatedAt: 1 },
  ],
  persona: "work" as const,
};
const oneTask = {
  tasks: [{ id: "1", title: "开会", completed: false, createdAt: 1, updatedAt: 1 }],
  persona: "work" as const,
};
const noTask = { tasks: [], persona: "work" as const };

describe("空内容不能建任务", () => {
  it("【回归】只输入「明天」→ 不能建「未命名任务」", () => {
    const r = answer("明天", ctx);
    expect(r.action).toBeUndefined();
    expect(r.text).not.toContain("未命名任务");
    expect(r.text).toContain("想记什么待办");
  });

  it("只输入日期/时间的各种写法都不建空任务", () => {
    for (const s of ["明天", "后天", "下周一", "11点", "月底", "明天下午3点"]) {
      const r = answer(s, ctx);
      expect(r.action, `「${s}」不该建任务`).toBeUndefined();
    }
  });
});

describe("泛指指代要能正确处理", () => {
  it("【回归】「把这个任务改到明天」+ 库里只有一条 → 直接改那一条", () => {
    const r = answer("把这个任务改到明天", oneTask);
    expect(r.action?.type).toBe("updateTask");
    expect(r.text).not.toContain("没找到要改的任务");
  });

  it("【回归】「把这个任务改到明天」+ 库里多条 → 列出来让用户选（不瞎猜）", () => {
    const r = answer("把这个任务改到明天", ctx);
    expect(r.action).toBeUndefined(); // 不直接改，先问
    expect(r.text).toContain("哪一个");
    expect(r.text).toContain("开会");
    expect(r.text).toContain("写周报");
    expect((r as { choices?: unknown[] }).choices?.length).toBe(2);
  });

  it("泛指 + 库里没有任何未完成任务 → 友好提示，不报「没找到」", () => {
    const r = answer("把这个任务改到明天", noTask);
    expect(r.text).not.toContain("没找到要改的任务");
    expect(r.action).toBeUndefined();
  });
});
