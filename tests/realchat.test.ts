import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 5 科：真人会怎么说话（大规模问法覆盖）
 *
 * 目的：不再"用户撞见一个我修一个"。把同一意图的各种口语说法都罗列出来测试，
 * 找出"答非所问/该答不答/不该答乱答"。
 * 冻结时间：2026-09-04 10:00
 */
const NOW = new Date(2026, 8, 4, 10, 0);
const mk = (list: Array<Partial<any>>) => ({
  tasks: list.map((t, i) => ({
    id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "",
    remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t,
  })),
  persona: "work" as const,
  now: NOW,
});
/** 有 2 条未完成 + 1 条已完成 */
const CTX = mk([
  { title: "开会", dueDate: "2026-09-04", dueTime: "16:00" },
  { title: "写周报" },
  { title: "买菜", completed: true },
]);

describe("问『还有多少没做』类（各种口语说法）→ 都应给出数量，不该答非所问", () => {
  const asked = [
    "检查一下还有多少未完成的任务",
    "还有多少没完成的",
    "有多少任务未完成",
    "我还有几件事没做",
    "我还剩哪些事没做",
    "还有哪些待办",
    "还有啥没干的",
    "未完成的有几个",
    "我一共有多少待办",
    "剩下的任务还有多少",
  ];
  for (const q of asked) {
    it(`"${q}"`, () => {
      const r = answer(q, CTX);
      // 不该是"没找到要完成/取消完成的任务"这种操作类误答
      expect(r.text).not.toMatch(/没找到要(完成|取消完成|删)/);
      // 应给出数量或列表（含数字 或 列出任务名）
      const gaveCount = /\d|[一二三四五六七八九十]/.test(r.text) || r.text.includes("开会") || r.text.includes("写周报");
      expect(gaveCount).toBe(true);
    });
  }
});

describe("问『今天/明天安排』类 → 应列出", () => {
  const asks = ["今天有什么安排", "今天的待办", "我今天要做啥", "明天有什么安排", "明天有事吗"];
  for (const q of asks) {
    it(`"${q}"`, () => {
      const r = answer(q, CTX);
      expect(r.action).toBeUndefined(); // 查询不该产生动作
      expect(r.text).not.toMatch(/没找到要(完成|取消完成|删)/);
    });
  }
});

describe("问『逾期』类", () => {
  const overdueCtx = mk([{ title: "交报告", dueDate: "2026-09-01" }]);
  for (const q of ["有什么逾期的吗", "逾期了几个", "有没有过期的", "哪些事拖了"]) {
    it(`"${q}"`, () => {
      const r = answer(q, overdueCtx);
      expect(r.text).not.toMatch(/没找到要(完成|取消完成|删)/);
    });
  }
});

describe("常见闲聊/问候 → 应友好回应，不报错不说没懂", () => {
  for (const q of ["你好", "嗨", "在吗", "你是谁", "谢谢", "辛苦了"]) {
    it(`"${q}"`, () => {
      const r = answer(q, CTX);
      expect(r.text).not.toMatch(/暂时没太懂/);
      expect(r.text.length).toBeGreaterThan(4);
    });
  }
});

describe("该拒绝的（越界）→ 都该拒", () => {
  for (const q of ["帮我写代码", "翻译这句", "推荐个电影", "算道数学题", "今天天气怎样"]) {
    it(`"${q}"`, () => {
      const r = answer(q, CTX);
      expect(r.text).toMatch(/帮不上|答不上|只擅长|待办|备忘/);
    });
  }
});

describe("真人口语·省字/随意说法 → 不该说『没太懂』", () => {
  const casual = [
    "记一下 明天开会",
    "明天开会 记下",
    "帮我加个 下午三点 面试",
    "买菜",
    "提醒我 明天交房租",
    "周报还没写 记一下",
  ];
  for (const q of casual) {
    it(`"${q}"`, () => {
      const r = answer(q, CTX);
      // 要么建任务，要么给有帮助的回应；不该是干瘪的"没太懂"
      const helpful = r.action || !/暂时没太懂/.test(r.text);
      expect(helpful).toBeTruthy();
    });
  }
});

describe("真人闲聊·情绪/吐槽 → 该共情，不该说没懂", () => {
  for (const q of ["今天好累啊", "烦死了", "总算忙完了", "今天真开心"]) {
    it(`"${q}"`, () => {
      const r = answer(q, CTX);
      expect(r.text).not.toMatch(/暂时没太懂/);
    });
  }
});

describe("边界：空/超短/乱输入 → 不该崩，应有回应", () => {
  for (const q of ["", " ", "?", "。", "aaaaaaaa", "123"]) {
    it(`"${JSON.stringify(q)}"`, () => {
      const r = answer(q, CTX);
      expect(typeof r.text).toBe("string");
      expect(r.text.length).toBeGreaterThan(0);
    });
  }
});

describe("易混：'完成了' vs '完成了几个' → 一个操作一个查询", () => {
  it("「完成了 开会」→ 是操作", () => {
    const r = answer("完成了 开会", CTX);
    expect(r.action?.type).toBe("completeTask");
  });
  it("「完成了几个」→ 是查询，不该去完成某任务", () => {
    const r = answer("完成了几个", CTX);
    expect(r.action).toBeUndefined();
  });
});

describe("易混：'删掉开会' vs '怎么删掉任务' → 问法不该真删", () => {
  it("「怎么删除任务」→ 不该产生删除动作", () => {
    const r = answer("怎么删除任务", CTX);
    expect(r.action).toBeUndefined();
  });
});

describe("兜底升级：绝不说『听不懂』，改为猜+确认（调研最佳实践）", () => {
  it("无实义的含时间句 → 不胡乱建任务，而是给帮助", () => {
    const r = answer("明天三点那事", CTX);
    expect(r.text).not.toMatch(/暂时没太懂/);
    expect(r.action).toBeUndefined(); // 无实义不建
  });

  it("含『怎么/如何』的疑问句 → 给帮助/能力，不建任务", () => {
    const r = answer("这个怎么弄啊", CTX);
    expect(r.text).not.toMatch(/暂时没太懂/);
    expect(r.action).toBeUndefined();
  });

  it("完全不懂的句子 → 给能力菜单(带例子)，不说没懂", () => {
    const r = answer("阿巴阿巴", CTX);
    expect(r.text).not.toMatch(/暂时没太懂/);
    expect(r.text).toMatch(/在行|记个待办|建待办/);
  });

  it("兜底话术里带上用户原话（显得在听）", () => {
    const r = answer("xyzqwer", CTX);
    expect(r.text).toContain("xyzqwer");
  });

  it("任何输入都不该出现『暂时没太懂』", () => {
    for (const q of ["啊这", "嗯嗯嗯", "你说啥", "qwerty", "哈哈哈哈哈"]) {
      const r = answer(q, CTX);
      expect(r.text).not.toMatch(/暂时没太懂/);
    }
  });
});
