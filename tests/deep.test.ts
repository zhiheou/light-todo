import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";
import { parseQuickAdd } from "../src/lib/nlp";

/**
 * 轻宜「考试系统」· 第 9 科：深度/边界（还没覆盖的角落）
 */
const NOW = new Date(2026, 8, 4, 10, 0); // 周五
const mk = (list: Array<Partial<any>> = []) => ({
  tasks: list.map((t, i) => ({
    id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "",
    remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t,
  })),
  persona: "work" as const,
  now: NOW,
});
const P = (title: string) => parseQuickAdd({ title, notes: "", now: NOW });

describe("NLP 深挖：日期边界", () => {
  it("跨月：8月31日的'明天'是9月1日", () => {
    const p = parseQuickAdd({ title: "明天开会", notes: "", now: new Date(2026, 7, 31, 10, 0) });
    expect(p.dueDate).toBe("2026-09-01");
  });
  it("跨年：12月31日的'明天'是次年1月1日", () => {
    const p = parseQuickAdd({ title: "明天开会", notes: "", now: new Date(2026, 11, 31, 10, 0) });
    expect(p.dueDate).toBe("2027-01-01");
  });
  it("闰年 2月28日的'明天'", () => {
    const p = parseQuickAdd({ title: "明天交表", notes: "", now: new Date(2028, 1, 28, 10, 0) }); // 2028闰年
    expect(p.dueDate).toBe("2028-02-29");
  });
  it("每月31号在2月 → 取月末28/29号", () => {
    const p = parseQuickAdd({ title: "每月31号交租", notes: "", now: new Date(2026, 1, 5, 10, 0) });
    expect(p.dueDate).toBe("2026-02-28");
  });
});

describe("NLP 深挖：时间表达", () => {
  it("12:30 保持原样", () => expect(P("明天12:30开会").dueTime).toBe("12:30"));
  it("晚上11点 → 23:00", () => expect(P("晚上11点睡").dueTime).toBe("23:00"));
  it("中午12点 → 12:00", () => expect(P("明天中午12点吃饭").dueTime).toBe("12:00"));
  it("8点15分 → 08:15", () => expect(P("明天8点15分开会").dueTime).toBe("08:15"));
  it("点三刻 → :45", () => expect(P("明天9点三刻开会").dueTime).toBe("09:45"));
});

describe("NLP 深挖：优先级", () => {
  it("紧急 → p1", () => expect(P("紧急 明天交报告").priority).toBe(1));
  it("重要 → p2", () => expect(P("重要 明天开会").priority).toBe(2));
  it("普通 → p3(默认)", () => expect(P("明天开会").priority).toBe(3));
});

describe("NLP 深挖：标题干净（不许残留）", () => {
  const cases: Array<[string, string]> = [
    ["明天下午3点开会", "开会"],
    ["每周一例会", "例会"],
    ["每天8点吃药", "吃药"],
    ["下周三前交报告", "交报告"],
    ["明天上午10点开个会", "开个会"],
  ];
  for (const [input, want] of cases) {
    it(`"${input}" → "${want}"`, () => {
      expect(P(input).title).toBe(want);
    });
  }
});

describe("对话：同一功能的多种说法都要通", () => {
  const buildVariants = [
    "明天下午3点开会",
    "明天3点开会",
    "明天下午三点开会",
    "开会 明天下午3点",
    "帮我建个 明天下午3点开会",
  ];
  for (const v of buildVariants) {
    it(`建任务："${v}"`, () => {
      expect(answer(v, mk()).action?.type).toBe("addTask");
    });
  }
});

describe("对话：上下文依赖（有任务才能操作）", () => {
  it("空任务列表时'删掉开会'→ 明确说没找到（不假删）", () => {
    const r = answer("删掉开会", mk([]));
    expect(r.text).toMatch(/没找到/);
    expect(r.localOnly).toBe(true);
  });
  it("空任务列表时'完成了开会'→ 明确说没找到", () => {
    const r = answer("完成了 开会", mk([]));
    expect(r.text).toMatch(/没找到/);
  });
  it("有任务时才能删", () => {
    const r = answer("删掉开会", mk([{ title: "开会" }]));
    expect(r.action?.type).toBe("confirm");
  });
});

describe("对话：连续操作不串味", () => {
  it("先建再查：建完任务后查询应正常", () => {
    const ctx = mk([{ title: "开会", dueDate: "2026-09-04" }]);
    const r = answer("今天有什么安排", ctx);
    expect(r.text).toContain("开会");
  });
  it("备忘与任务不混：'记到备忘录'不产生任务", () => {
    const r = answer("记到备忘录：客户电话123", mk());
    expect(r.action?.type).toBe("addMemo");
  });
});

describe("性能/健壮：极端输入", () => {
  it("1000 字输入不超时/不崩", () => {
    const long = "明天开会".repeat(250);
    const t0 = Date.now();
    const r = answer(long, mk());
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(typeof r.text).toBe("string");
  });
  it("全是标点", () => expect(answer("。。。！！？", mk()).text.length).toBeGreaterThan(0));
  it("纯数字", () => expect(answer("12345", mk()).text.length).toBeGreaterThan(0));
  it("换行/制表符", () => expect(answer("明天\n\t开会", mk()).text.length).toBeGreaterThan(0));
});
