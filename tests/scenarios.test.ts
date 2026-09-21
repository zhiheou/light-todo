import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 8 科：真实场景（工作/生活/领导安排）
 * 按"用户会怎么用"编场景，而不是孤立句子。
 */
const NOW = new Date(2026, 8, 4, 10, 0); // 周五 10:00
const mk = (list: Array<Partial<any>> = []) => ({
  tasks: list.map((t, i) => ({
    id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "",
    remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t,
  })),
  persona: "work" as const,
  now: NOW,
});

describe("场景：领导突然安排活", () => {
  const boss = [
    "下周二前给个方案",
    "这周五之前把报表发我",
    "月底前完成预算",
    "明天上午10点开个会",
    "周三下午跟客户对接一下",
    "尽快把合同整理好",
  ];
  for (const q of boss) {
    it(`"${q}" → 能建任务`, () => {
      const r = answer(q, mk());
      expect(r.action?.type).toBe("addTask");
    });
  }
});

describe("场景：生活琐事", () => {
  const life = [
    "明天记得取快递",
    "晚上八点去健身房",
    "周末买点菜",
    "下个月交房租",
    "每天喝八杯水",
    "下周一体检",
  ];
  for (const q of life) {
    it(`"${q}" → 能建任务`, () => {
      const r = answer(q, mk());
      expect(r.action?.type).toBe("addTask");
    });
  }
});

describe("场景：早上开工（查看今天）", () => {
  const ctx = mk([
    { title: "开会", dueDate: "2026-09-04", dueTime: "16:00" },
    { title: "写周报", dueDate: "2026-09-04" },
    { title: "交报告", dueDate: "2026-09-01" }, // 逾期
  ]);
  for (const q of ["今天有什么安排", "今天要做什么", "我今天有啥事", "帮我看看今天的"]) {
    it(`"${q}" → 列出今天`, () => {
      const r = answer(q, ctx);
      expect(r.action).toBeUndefined();
      expect(r.text).not.toMatch(/没太懂|没找到要/);
    });
  }
});

describe("场景：下班前收尾", () => {
  const ctx = mk([
    { title: "买菜", completed: true },
    { title: "写周报" },
    { title: "开会" },
  ]);
  it("「今天完成了啥」→ 应回答（不答非所问）", () => {
    const r = answer("今天完成了啥", ctx);
    expect(r.text).not.toMatch(/没太懂/);
  });
  it("「还剩什么没做」→ 给出剩余", () => {
    const r = answer("还剩什么没做", ctx);
    expect(r.text).toMatch(/还有|剩|没完成/);
  });
});

describe("场景：用户表达情绪（陪伴定位）", () => {
  const feelings = ["今天累死了", "领导又加活了，好烦", "总算下班了", "今天心情不错"];
  for (const q of feelings) {
    it(`"${q}" → 共情，不报错`, () => {
      const r = answer(q, mk());
      expect(r.text).not.toMatch(/没太懂|没找到要/);
      expect(r.action?.type === "askRecordFeeling" || r.text.length > 4).toBe(true);
    });
  }
});

describe("场景：用户想找东西", () => {
  const ctx = mk([{ title: "交房租", dueDate: "2026-09-15" }, { title: "买牛奶" }]);
  it("「交房租是什么时候」→ 应能找到并回答", () => {
    const r = answer("交房租是什么时候", ctx);
    // 要么明确答复，要么不答非所问
    expect(r.text).not.toMatch(/没找到要(删|完成)/);
  });
});

describe("场景：连说两件事（真人常这样）", () => {
  it("「明天开会，顺便提醒我买牛奶」→ 至少处理一件，不崩", () => {
    const r = answer("明天开会，顺便提醒我买牛奶", mk());
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe("场景：口语试探/犹豫", () => {
  for (const q of ["那个…", "嗯…我想想", "算了没事", "没事了"]) {
    it(`"${q}" → 友好回应，不报错`, () => {
      const r = answer(q, mk());
      expect(typeof r.text).toBe("string");
      expect(r.text).not.toMatch(/没太懂/);
    });
  }
});
