import { describe, it, expect } from "vitest";
import { answer, isOffTopic } from "../src/lib/mascotBrain";
import { parseQuickAdd } from "../src/lib/nlp";

/**
 * 轻宜「考试系统」· 第 11 科：对抗测试回归（来自独立挑刺测试员实测的 20 个问题）
 * 每修一个就锁一条，防复发。
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

describe("高危1：完成类说法不许被反向建任务", () => {
  const ctx = mk([{ title: "写周报" }, { title: "开会" }]);
  it("『周报写完了』→ 标完成，不是建任务", () => {
    const r = answer("周报写完了", ctx);
    expect(r.action?.type).toBe("completeTask");
  });
  it("『开完会了』→ 不该建出『开完会了』任务", () => {
    const r = answer("开完会了", ctx);
    expect(r.action?.type).not.toBe("addTask");
  });
});

describe("高危2：情绪+任务混合，任务不能丢", () => {
  it("『烦死了明天还要开会』→ 该建任务（明天开会）", () => {
    const r = answer("烦死了明天还要开会", mk());
    expect(r.action?.type).toBe("addTask");
  });
});

describe("高危3：『帮我+日常事务』是交代办，不是越界", () => {
  for (const q of ["帮我买牛奶", "帮我取快递", "帮我发个周报", "帮我把方案发给老王"]) {
    it(`"${q}" → 不该判离题`, () => {
      expect(isOffTopic(q)).toBe(false);
    });
  }
});

describe("高危4：标点不该破坏操作识别", () => {
  const ctx = mk([{ title: "开会" }]);
  it("『完成开会。』→ 标完成", () => {
    expect(answer("完成开会。", ctx).action?.type).toBe("completeTask");
  });
  it("『？？？完成开会』→ 标完成", () => {
    expect(answer("？？？完成开会", ctx).action?.type).toBe("completeTask");
  });
  it("『删掉开会。』→ 进删除确认", () => {
    expect(answer("删掉开会。", ctx).action?.type).toBe("confirm");
  });
});

describe("中危5：下下周", () => {
  it("『下下周一开会』→ 不是下周一", () => {
    const p = parseQuickAdd({ title: "下下周一开会", notes: "", now: NOW });
    expect(p.dueDate).toBe("2026-09-14"); // 09-07 是下周一，09-14 才是下下周
  });
});

describe("中危6：相对时间", () => {
  it("『两个小时后开会』→ 算出时间", () => {
    const p = parseQuickAdd({ title: "两个小时后开会", notes: "", now: NOW });
    expect(p.dueTime).toBe("12:00");
  });
  it("『半小时后开会』→ 10:30", () => {
    const p = parseQuickAdd({ title: "半小时后开会", notes: "", now: NOW });
    expect(p.dueTime).toBe("10:30");
  });
  it("『今晚12点睡觉』→ 别当中午12点", () => {
    const p = parseQuickAdd({ title: "今晚12点睡觉", notes: "", now: NOW });
    expect(p.dueTime).not.toBe("12:00");
  });
});

describe("中危7：候选列表带日期（能分清同名任务）", () => {
  it("3 个『开会』→ 列表里带日期信息", () => {
    const ctx = mk([
      { title: "开会", dueDate: "2026-09-23", dueTime: "09:00" },
      { title: "开会", dueDate: "2026-09-24" },
      { title: "开会" },
    ]);
    const r = answer("完成开会", ctx);
    expect(r.text).toMatch(/2026-09-23|09-23/);
    expect(r.text).toMatch(/未设日期/);
  });
});

describe("中危8：『取消』不是新建", () => {
  it("『取消明天的会议』→ 不该建成任务", () => {
    const r = answer("取消明天的会议", mk());
    expect(r.action?.type).not.toBe("addTask");
  });
});

describe("中危10：空备忘录不该被记下", () => {
  it("『记到备忘录：』→ 引导，不记空", () => {
    const r = answer("记到备忘录：", mk());
    expect(r.action?.type).not.toBe("addMemo");
  });
});

describe("中危11：『记录：xxx』不该啃掉字", () => {
  it("『记录：今天学到很多』→ 标题不含『录：』", () => {
    const r = answer("记录：今天学到很多", mk());
    if (r.action?.type === "addTask") {
      expect((r.action as any).parsed.title).not.toMatch(/^录/);
    }
  });
});

describe("中危12：问日期不该建任务", () => {
  for (const q of ["今天几号", "今天星期几", "明天几号"]) {
    it(`"${q}" → 不建任务`, () => {
      expect(answer(q, mk()).action?.type).not.toBe("addTask");
    });
  }
});

describe("低危13：月初/下个月X号", () => {
  it("『下个月5号交房租』→ 10-05 不是 09-05", () => {
    const p = parseQuickAdd({ title: "下个月5号交房租", notes: "", now: NOW });
    expect(p.dueDate).toBe("2026-10-05");
  });
});

describe("低危14：疑问句不该引导记垃圾", () => {
  it("『现在几点』→ 不该建议记成待办", () => {
    const r = answer("现在几点", mk());
    expect(r.quickAdd).toBeUndefined();
  });
});

describe("低危15：天气闲聊该放行", () => {
  it("『今天天气不错』→ 不判离题", () => {
    expect(isOffTopic("今天天气不错")).toBe(false);
  });
});

describe("低危16：『明天（明天）』重复文案", () => {
  it("『看看明天的安排』→ 不出现重复的『明天（明天）』", () => {
    const r = answer("看看明天的安排", mk());
    expect(r.text).not.toMatch(/明天（明天）/);
  });
});

describe("低危18：记账/记事 → 按备忘", () => {
  it("『记事：今天学到很多』→ 存备忘", () => {
    const r = answer("记事：今天学到很多", mk());
    expect(r.action?.type).toBe("addMemo");
  });
});

describe("低危19：政治/报复类越界该拦", () => {
  for (const q of ["你怎么看中美关系", "特朗普最近怎么样", "怎么报复同事"]) {
    it(`"${q}" → 判离题`, () => {
      expect(isOffTopic(q)).toBe(true);
    });
  }
});
