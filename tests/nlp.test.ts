import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "../src/lib/nlp";

/**
 * 轻宜「考试系统」· 第 1 科：自然语言建待办（解析器）
 *
 * 方法（照 chrono-node 业界标准）：**冻结参考时间** + 每条用例断言"期望标题/日期/时间/循环"。
 * 冻结时间 = 结果可复现，改坏了立刻知道。
 *
 * 参考时间：2026-09-04（周五）10:00
 * 指标要求：字段级分开算（标题/日期/时间/循环各自准确率），防"标题对日期错"被平均掩盖。
 */
const NOW = new Date(2026, 8, 4, 10, 0); // 2026-09-04 周五 10:00

function parse(title: string, notes = "") {
  return parseQuickAdd({ title, notes, now: NOW });
}

describe("解析器：基础日期", () => {
  it("明天10点提交周报", () => {
    const p = parse("明天10点提交周报");
    expect(p.title).toBe("提交周报");
    expect(p.dueDate).toBe("2026-09-05");
    expect(p.dueTime).toBe("10:00");
  });

  it("明天下午4点开会", () => {
    const p = parse("明天下午4点开会");
    expect(p.title).toBe("开会");
    expect(p.dueDate).toBe("2026-09-05");
    expect(p.dueTime).toBe("16:00");
  });

  it("今天下午3点开会（当天）", () => {
    const p = parse("今天下午3点开会");
    expect(p.dueDate).toBe("2026-09-04");
    expect(p.dueTime).toBe("15:00");
  });

  it("后天交材料", () => {
    const p = parse("后天交材料");
    expect(p.title).toBe("交材料");
    expect(p.dueDate).toBe("2026-09-06");
  });

  it("无时间任务：记得买牛奶 → 默认无日期", () => {
    const p = parse("记得买牛奶");
    expect(p.title).toBe("买牛奶");
    expect(p.dueDate).toBe("");
  });
});

describe("解析器：周几（含'这/下'限定）", () => {
  // 2026-09-04 是周五
  it("下周二前给个方案 → 09-08（不是 09-15）", () => {
    const p = parse("下周二前给个方案");
    expect(p.dueDate).toBe("2026-09-08");
    expect(p.title).toBe("给个方案");
  });

  it("下周五之前把PPT发我 → 09-11", () => {
    const p = parse("下周五之前把PPT发我");
    expect(p.dueDate).toBe("2026-09-11");
  });

  it("下周三下午3点开会 → 09-09 15:00", () => {
    const p = parse("下周三下午3点开会");
    expect(p.dueDate).toBe("2026-09-09");
    expect(p.dueTime).toBe("15:00");
    expect(p.title).toBe("开会");
  });

  it("每周一例会 → 循环 weekly，下次周一", () => {
    const p = parse("每周一例会");
    expect(p.repeat?.freq).toBe("weekly");
    expect(p.dueDate).toBe("2026-09-07"); // 下周一
    expect(p.title).toBe("例会");
  });
});

describe("解析器：期限词（X前/月底/下班前）", () => {
  it("月底前完成预算 → 当月最后一天 09-30", () => {
    const p = parse("月底前完成预算");
    expect(p.dueDate).toBe("2026-09-30");
    expect(p.title).toBe("完成预算");
  });

  it("周五下班前把周报发我 → 当天 18:00（今天就是周五）", () => {
    const p = parse("周五下班前把周报发我");
    expect(p.dueTime).toBe("18:00");
    expect(p.title).toBe("把周报发我");
  });

  it("明天中午前给回复 → 明天 12:00", () => {
    const p = parse("明天中午前给回复");
    expect(p.dueDate).toBe("2026-09-05");
    expect(p.dueTime).toBe("12:00");
    expect(p.title).toBe("给回复");
  });

  it("3天之内交材料 → 09-07", () => {
    const p = parse("3天之内交材料");
    expect(p.dueDate).toBe("2026-09-07");
  });
});

describe("解析器：循环规则", () => {
  it("每天8点半提醒我喝水 → daily + 08:30", () => {
    const p = parse("每天8点半提醒我喝水");
    expect(p.repeat?.freq).toBe("daily");
    expect(p.dueTime).toBe("08:30");
    expect(p.title).toBe("喝水");
  });

  it("每月15号交房租 → monthly，日=15", () => {
    const p = parse("每月15号交房租");
    expect(p.repeat?.freq).toBe("monthly");
    expect(p.repeat?.dayOfMonth).toBe(15);
    expect(p.title).toBe("交房租");
  });

  it("每隔3天浇花 → interval=3", () => {
    const p = parse("每隔3天浇花");
    expect(p.repeat?.freq).toBe("interval");
    expect(p.repeat?.interval).toBe(3);
    expect(p.title).toBe("浇花");
  });

  it("每个工作日打卡", () => {
    const p = parse("每个工作日打卡");
    expect(p.repeat?.freq).toBe("weekday");
  });
});

describe("解析器：标题不被污染（不许残留乱码/助词）", () => {
  const cases: Array<[string, string]> = [
    ["明天10点提交周报", "提交周报"],
    ["帮我记个待办：明天下午4点开会", "开会"],
    ["下周二前给个方案", "给个方案"],
    ["每天8点半提醒我喝水", "喝水"],
    ["每月15号交房租", "交房租"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" 的标题应为「${expected}」`, () => {
      expect(parse(input).title).toBe(expected);
    });
  }
});
