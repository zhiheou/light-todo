import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 7 科：刁钻输入（歧义/错别字/省略/方言味）
 * 目的：真人不会说得标准，机器要接得住。
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

describe("省略说法（真人常省字）", () => {
  // [输入, 期望标题包含, 期望时间(可空)]
  const cases: Array<[string, string, string]> = [
    ["明天四点开会", "开会", "04:00"],
    ["周三 例会", "例会", ""],
    ["下月十号 交房租", "房租", ""],
    ["明早 交材料", "材料", ""],
    ["今晚八点 健身", "健身", "20:00"],
  ];
  for (const [input, shouldContain, expectTime] of cases) {
    it(`"${input}" → 应建任务，标题含「${shouldContain}」${expectTime ? "，时间 " + expectTime : ""}`, () => {
      const r = answer(input, mk());
      expect(r.action?.type).toBe("addTask");
      if (r.action?.type === "addTask") {
        const p = (r.action as any).parsed;
        expect(p.title).toContain(shouldContain);
        if (expectTime) expect(p.dueTime).toBe(expectTime);
      }
    });
  }
});

describe("歧义：'改' 在无上下文时不该乱改", () => {
  it("「改一下」→ 不该产生 updateTask", () => {
    const r = answer("改一下", mk([{ title: "开会" }]));
    expect(r.action?.type).not.toBe("updateTask");
  });
  it("「把开会改到明天」→ 有目标才改", () => {
    const r = answer("把开会改到明天", mk([{ title: "开会" }]));
    expect(r.action?.type).toBe("updateTask");
  });
});

describe("错别字/同音（容错）", () => {
  it("「明天下五3点开会」→ 不该崩", () => {
    const r = answer("明天下五3点开会", mk());
    expect(typeof r.text).toBe("string");
  });
  it("「删掉开汇」→ 找不到就明说，不假删", () => {
    const r = answer("删掉 开汇", mk([{ title: "开会" }]));
    expect(r.text).toMatch(/没找到|找不到/);
    expect(r.localOnly).toBe(true);
  });
});

describe("模糊指代（'那个'）", () => {
  it("「把那个删了」无上下文 → 不该假删", () => {
    const r = answer("把那个删了", mk([{ title: "开会" }]));
    // 关键词为空 → 可能匹配到全部或没找到；但绝不该静默产生删除
    if (r.action?.type === "confirm") {
      // 若只有一条，直接确认也是合理的
      expect(r.text).toMatch(/确定|删除/);
    } else {
      expect(r.localOnly).toBe(true);
    }
  });
});

describe("多意图混合", () => {
  it("「明天开会，另外记一下买牛奶」→ 至少能处理第一个", () => {
    const r = answer("明天开会，另外记一下买牛奶", mk());
    expect(r.text.length).toBeGreaterThan(0);
  });
  it("「今天有什么安排？还有多少没做？」→ 查询类，不该建任务", () => {
    const r = answer("今天有什么安排？还有多少没做？", mk([{ title: "开会" }]));
    expect(r.action).toBeUndefined();
  });
});

describe("超长输入（防崩）", () => {
  it("200 字的句子 → 不该崩", () => {
    const long = "明天下午三点".repeat(30);
    const r = answer(long, mk());
    expect(typeof r.text).toBe("string");
  });
});

describe("特殊字符/emoji", () => {
  for (const q of ["😀", "开会🎉", "！！！", "。。。", "@#$%"]) {
    it(`"${q}" → 有回应不崩`, () => {
      const r = answer(q, mk());
      expect(typeof r.text).toBe("string");
      expect(r.text.length).toBeGreaterThan(0);
    });
  }
});
