import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "../src/lib/nlp";
import { readConfirm } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 16 科：v3.9.14 独立审查发现问题的回归测试
 *
 * 这一批 bug 全部来自"多轮独立审查"（专业做法：多视角 + 交叉验证），
 * 类型包括：数据丢失、误删、解析错误。每条都先用真实代码复现、再修、再锁死。
 */

const NOW = new Date(2026, 8, 4, 10, 0); // 2026-09-04 周五 10:00
const P = (t: string) => parseQuickAdd({ title: t, now: NOW });

describe("NLP：'X天后' 不能丢日期、不能留残渣", () => {
  it("【数据丢失】3天后交房租 → 必须算出 9-07，标题干净", () => {
    const r = P("3天后交房租");
    expect(r.title).toBe("交房租");
    expect(r.dueDate).toBe("2026-09-07");
  });

  it("【数据丢失】三天后交材料（中文数字）同样要认", () => {
    const r = P("三天后交材料");
    expect(r.title).toBe("交材料");
    expect(r.dueDate).toBe("2026-09-07");
  });

  it("大后天 = 今天+3（不能被'后天'抢先匹配成+2）", () => {
    const r = P("大后天开会");
    expect(r.dueDate).toBe("2026-09-07"); // 9-04 + 3 天
  });

  it("今天/明天/后天 仍正确（别修坏）", () => {
    expect(P("今天开会").dueDate).toBe("2026-09-04");
    expect(P("明天开会").dueDate).toBe("2026-09-05");
    expect(P("后天开会").dueDate).toBe("2026-09-06");
  });
});

describe("NLP：数字不能被当时间吃掉", () => {
  it("【标题损坏】买3斤苹果 → 数字要保留", () => {
    expect(P("买3斤苹果").title).toBe("买3斤苹果");
  });

  it("把3个文件发我 → 数量词要保留", () => {
    expect(P("把3个文件发我").title).toBe("把3个文件发我");
  });

  it("但真正的时间表达仍要被剥离", () => {
    const r = P("3天后交房租");
    expect(r.title).not.toContain("3天");
  });
});

describe("NLP：循环任务识别补齐", () => {
  it("【功能缺失】每个月15号交房租 → 要有每月循环 + 干净标题", () => {
    const r = P("每个月15号交房租");
    expect(r.title).toBe("交房租");
    expect((r as { repeat?: { freq: string; dayOfMonth?: number } }).repeat?.freq).toBe("monthly");
    expect((r as { repeat?: { freq: string; dayOfMonth?: number } }).repeat?.dayOfMonth).toBe(15);
  });

  it("每月15号交房租（无'个'）仍然正确", () => {
    const r = P("每月15号交房租");
    expect(r.title).toBe("交房租");
    expect((r as { repeat?: { freq: string } }).repeat?.freq).toBe("monthly");
  });

  it("【功能缺失】每周交周报 → 识别成每周循环", () => {
    const r = P("每周交周报");
    expect(r.title).toBe("交周报");
    expect((r as { repeat?: { freq: string } }).repeat?.freq).toBe("weekly");
  });

  it("每周一开会 仍然正确（别修坏）", () => {
    const r = P("每周一开会");
    expect(r.title).toBe("开会");
    expect((r as { repeat?: { freq: string; weekday?: number } }).repeat?.weekday).toBe(1);
  });
});

describe("AI 回复判定：否定必须优先于肯定（防误删）", () => {
  it("【高危·误删】'好的，先别删' 绝不能被当成确认", () => {
    expect(readConfirm("好的，先别删")).toEqual({ yes: false });
  });

  it("【高危】'好，不用了' 是否定", () => {
    expect(readConfirm("好，不用了")).toEqual({ yes: false });
  });

  it("【高危】'对，不过先等等' 是否定", () => {
    expect(readConfirm("对，不过先等等")).toEqual({ yes: false });
  });

  it("真心的'好的' 仍然算确认（别修坏）", () => {
    expect(readConfirm("好的")).toEqual({ yes: true });
    expect(readConfirm("确认")).toEqual({ yes: true });
    expect(readConfirm("删吧")).toEqual({ yes: true });
  });

  it("明确的否定仍然算否定", () => {
    expect(readConfirm("不要")).toEqual({ yes: false });
    expect(readConfirm("算了")).toEqual({ yes: false });
    expect(readConfirm("取消")).toEqual({ yes: false });
  });

  it("含糊不清的回答 → 返回 null（交给上层再问一次，不能默认执行）", () => {
    expect(readConfirm("嗯……让我想想")).toBeNull();
    expect(readConfirm("这个嘛")).toBeNull();
  });
});
