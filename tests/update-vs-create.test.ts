import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 18 科：「新建」与「修改」的意图区分
 *
 * 背景（用户实测反馈）：
 *   > "还是ai智障，明天11点需要修改500promax的链接"
 *   → 桌宠回："没找到要改的任务。说具体点？比如「把开会改到明天下午3点」。"
 *   （用户不得不又说一遍"记录待办，…"，结果**还是**同样的错误回复）
 *
 * 根因：旧规则只要句子里出现「修改」两个字就判定为"改已有任务"，
 * 完全不管「修改」在这里其实是**任务内容的一部分**（要做的事就是"改链接"）。
 *
 * 修法：
 *   ① 先看有没有"新建"意图（记录/帮我记/添加 + 待办/任务）→ 直接走新建
 *   ② 只有出现「改到/改成/改为/推迟到/调整到」这类**明确变更词**才算"改任务"；
 *      光有「修改」不算 —— 那种句子多半是在描述"要做的事"
 *
 * 这组测试同时锁死两侧：
 *   - 带"修改"的**新建**语句必须建任务
 *   - 真正的**修改**语句必须仍然能改任务（别修坏）
 */

const ctx = {
  tasks: [
    { id: "1", title: "开会", completed: false, createdAt: 1, updatedAt: 1 },
    { id: "2", title: "写周报", completed: false, createdAt: 1, updatedAt: 1 },
  ],
  persona: "work" as const,
};

const act = (s: string) => answer(s, ctx).action;

describe("带「修改」的句子要正确识别为【新建】", () => {
  it("【用户原话】明天11点需要修改500promax的链接 → 建任务", () => {
    const a = act("明天11点需要修改500promax的链接");
    expect(a?.type).toBe("addTask");
  });

  it("【用户原话·补前缀】记录待办，明天11点需要修改500promax的链接 → 建任务", () => {
    const a = act("记录待办，明天11点需要修改500promax的链接");
    expect(a?.type).toBe("addTask");
    // 标题不能带"录待办"这种被剥一半的残渣
    const title = (a as { parsed?: { title?: string } }).parsed?.title ?? "";
    expect(title).not.toContain("录待办");
    expect(title).toContain("500promax");
  });

  it("帮我记个待办：明天11点修改链接 → 建任务", () => {
    const a = act("帮我记个待办：明天11点修改链接");
    expect(a?.type).toBe("addTask");
    expect((a as { parsed?: { title?: string } }).parsed?.title).toBe("修改链接");
  });

  it("记一下 明天下午要修改合同 → 建任务", () => {
    const a = act("记一下 明天下午要修改合同");
    expect(a?.type).toBe("addTask");
  });

  it("明天要修改500promax的链接（无前缀）→ 建任务", () => {
    expect(act("明天要修改500promax的链接")?.type).toBe("addTask");
  });

  it("新建的任务要带上解析出的时间", () => {
    const a = act("明天11点需要修改500promax的链接") as { parsed?: { dueTime?: string } };
    expect(a?.parsed?.dueTime).toBe("11:00");
  });
});

describe("真正的【修改】语句不能被修坏", () => {
  it("把开会改成明天下午3点 → 仍然是改任务", () => {
    const a = act("把开会改成明天下午3点");
    expect(a?.type).toBe("updateTask");
  });

  it("开会改到明天 → 仍然是改任务", () => {
    expect(act("开会改到明天")?.type).toBe("updateTask");
  });

  it("把周报推迟到后天 → 仍然是改任务", () => {
    expect(act("把周报推迟到后天")?.type).toBe("updateTask");
  });

  it("改任务的回复里要指明改的是哪一条", () => {
    const r = answer("把开会改成明天下午3点", ctx);
    expect(r.text).toContain("开会");
    expect(r.text).not.toContain("没找到要改的任务");
  });
});
