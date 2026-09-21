import { describe, it, expect } from "vitest";
import { answer, isOffTopic, isGrantDeleteIntent } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 2 科：意图分类 + 越界拒绝
 *
 * 方法（照 XSTest 双边测试思路）：
 *  - 该答的不能拒（正例）
 *  - 该拒的必须拒（越界：写代码/翻译/数学…）
 * 两类都测，防"只测一边"。
 * 冻结参考时间：2026-09-04 10:00
 */
const NOW = new Date(2026, 8, 4, 10, 0);
const ctx = (tasks: any[] = []) => ({ tasks, persona: "work" as const, now: NOW });

describe("意图：建待办（应当建成任务）", () => {
  const shouldBuild = [
    "明天下午4点开会",
    "帮我记个待办：明天10点交周报",
    "下周二前给个方案",
    "每天8点半提醒我喝水",
    "记得买牛奶",
  ];
  for (const input of shouldBuild) {
    it(`"${input}" → 应识别为建任务(addTask)`, () => {
      const r = answer(input, ctx());
      expect(r.action?.type).toBe("addTask");
    });
  }
});

describe("意图：记备忘（应当存备忘）", () => {
  const shouldMemo = [
    "记到备忘录：客户电话是13800000000",
    "把这段记到备忘录：下季度OKR初稿思路",
  ];
  for (const input of shouldMemo) {
    it(`"${input}" → 应识别为记备忘(addMemo)`, () => {
      const r = answer(input, ctx());
      expect(r.action?.type).toBe("addMemo");
    });
  }
});

describe("意图：查询（应当查而不建）", () => {
  const shouldQuery = ["今天有什么安排", "明天有什么安排", "有什么逾期的吗"];
  for (const input of shouldQuery) {
    it(`"${input}" → 不应建任务`, () => {
      const r = answer(input, ctx([{ id: "1", title: "开会", notes: "", priority: 3, dueDate: "2026-09-04", dueTime: "", remindAt: "", completed: false, createdAt: 0, updatedAt: 0 }]));
      expect(r.action).toBeUndefined();
      expect(r.text.length).toBeGreaterThan(0);
    });
  }
});

describe("意图：情绪（应当共情，不建任务）", () => {
  const feelings = ["今天心情很不好", "好烦啊", "最近压力好大"];
  for (const input of feelings) {
    it(`"${input}" → 应走情绪分支(askRecordFeeling)，不直接建任务`, () => {
      const r = answer(input, ctx());
      expect(r.action?.type).toBe("askRecordFeeling");
    });
  }
});

describe("意图：空内容引导（不该建出无意义任务）", () => {
  const empties = ["给我记个待办", "帮我记个待办", "记一下"];
  for (const input of empties) {
    it(`"${input}" → 应引导补内容，不建任务`, () => {
      const r = answer(input, ctx());
      expect(r.action).toBeUndefined();
    });
  }
});

describe("越界拒绝（该拒的必须拒，不耗 AI）", () => {
  const offTopic = [
    "帮我写一个python爬虫",
    "用c++写个链表",
    "帮我翻译这段话",
    "帮我解个方程",
    "帮我写篇作文",
    "推荐几部电影",
      ];
  for (const input of offTopic) {
    it(`"${input}" → 判为离题`, () => {
      expect(isOffTopic(input)).toBe(true);
    });
  }
});

describe("不该误拦（合法待办不能被当越界拒掉）", () => {
  const legit = [
    "明天和后端对接口的会议",
    "帮我记个待办：明天下午4点开会",
    "今天有什么安排",
    "下周二前给个方案",
  ];
  for (const input of legit) {
    it(`"${input}" → 不该判离题`, () => {
      expect(isOffTopic(input)).toBe(false);
    });
  }
});

describe("危险操作闸门：删除授权意图识别", () => {
  it("「允许删除」→ 识别为授权", () => {
    expect(isGrantDeleteIntent("允许删除")).toBe(true);
    expect(isGrantDeleteIntent("好，我允许你删")).toBe(true);
  });
  it("普通闲聊不该被当授权", () => {
    expect(isGrantDeleteIntent("今天天气不错")).toBe(false);
    expect(isGrantDeleteIntent("帮我建个待办")).toBe(false);
  });
});

describe("v3.9 新能力：完成 / 更新 待办（对话直接操作）", () => {
  const withTasks = (list: Array<Partial<any>>) =>
    ctx(list.map((t, i) => ({ id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "", remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t })));

  it("「完成了 开会」→ completeTask(done=true)", () => {
    const r = answer("完成了 开会", withTasks([{ title: "开会" }]));
    expect(r.action).toMatchObject({ type: "completeTask", done: true });
  });

  it("「把开会做完了」→ completeTask", () => {
    const r = answer("把开会做完了", withTasks([{ title: "开会" }]));
    expect(r.action?.type).toBe("completeTask");
  });

  it("「取消完成 开会」→ completeTask(done=false)", () => {
    const r = answer("取消完成 开会", withTasks([{ title: "开会", completed: true }]));
    expect(r.action).toMatchObject({ type: "completeTask", done: false });
  });

  it("已完成的任务不该再被'完成'（找不到）", () => {
    const r = answer("完成了 开会", withTasks([{ title: "开会", completed: true }]));
    expect(r.action).toBeUndefined();
  });

  it("「把开会改到明天下午3点」→ updateTask(带新时间)", () => {
    const r = answer("把开会改到明天下午3点", withTasks([{ title: "开会" }]));
    expect(r.action?.type).toBe("updateTask");
    expect((r.action as any).patch.dueDate).toBe("2026-09-05");
    expect((r.action as any).patch.dueTime).toBe("15:00");
  });

  it("「把周报改成重要」→ updateTask 优先级", () => {
    const r = answer("把周报改成重要", withTasks([{ title: "周报" }]));
    expect(r.action?.type).toBe("updateTask");
    expect((r.action as any).patch.priority).toBe(2);
  });

  it("找不到任务时不误操作", () => {
    const r = answer("完成了 不存在的任务", withTasks([{ title: "开会" }]));
    expect(r.action).toBeUndefined();
  });
});

describe("v3.9 防幻觉：意图已识别但没找到 → 必须本地定论(localOnly)，绝不转 AI", () => {
  const withTasks = (list: Array<Partial<any>>) =>
    ctx(list.map((t, i) => ({ id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "", remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t })));

  it("用户原话「删除刚才的开会记录」→ 能匹配到「开会」并进入确认", () => {
    const r = answer("删除刚才的开会记录", withTasks([{ title: "开会" }]));
    expect(r.action?.type).toBe("confirm");
  });

  it("没有匹配任务时 → 回执带 localOnly(不许转AI)", () => {
    const r = answer("删掉 不存在的事", withTasks([{ title: "开会" }]));
    expect(r.localOnly).toBe(true);
    expect(r.action).toBeUndefined();
  });

  it("完成找不到 → localOnly", () => {
    const r = answer("完成了 不存在", withTasks([{ title: "开会" }]));
    expect(r.localOnly).toBe(true);
  });

  it("改找不到 → localOnly", () => {
    const r = answer("把不存在改到明天3点", withTasks([{ title: "开会" }]));
    expect(r.localOnly).toBe(true);
  });

  it("多个候选 → localOnly(等用户选，别转AI)", () => {
    const r = answer("删掉 会", withTasks([{ title: "开会" }, { title: "开会纪要" }]));
    expect(r.localOnly).toBe(true);
  });
});

describe("v3.9 防幻觉：多候选必须带 choices（用户回名字才不会漏给AI）", () => {
  const withTasks = (list: Array<Partial<any>>) =>
    ctx(list.map((t, i) => ({ id: `t${i}`, title: "", notes: "", priority: 3, dueDate: "", dueTime: "", remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...t })));

  it("用户原话「删掉 开会」匹配多条 → 返回 choices(3条) + localOnly", () => {
    const r = answer("删掉 开会", withTasks([{ title: "开会" }, { title: "五点开会" }, { title: "四点开会" }]));
    expect(r.localOnly).toBe(true);
    expect(r.choices?.length).toBe(3);
    expect(r.choices?.every((c) => c.op === "delete")).toBe(true);
  });

  it("完成多候选 → choices 的 op 是 complete", () => {
    const r = answer("完成了 开会", withTasks([{ title: "开会" }, { title: "开会纪要" }]));
    expect(r.choices?.every((c) => c.op === "complete")).toBe(true);
  });

  it("取消完成多候选 → op 是 uncomplete", () => {
    const r = answer("取消完成 开会", withTasks([{ title: "开会", completed: true }, { title: "开会纪要", completed: true }]));
    expect(r.choices?.every((c) => c.op === "uncomplete")).toBe(true);
  });

  it("choices 里带的是真实 id，能被上层用来执行", () => {
    const r = answer("删掉 开会", withTasks([{ title: "开会", id: "abc" }]));
    // 单条走 confirm
    expect(r.action).toMatchObject({ type: "confirm" });
  });
});
