import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "../src/lib/nlp";
import { answer, readConfirm, splitMultiTasks } from "../src/lib/mascotBrain";
import type { Task } from "../src/types";

/**
 * 轻宜「考试系统」· 第 29 科：聊天助手记错、改错、不听指挥（2026-09-27 体检报告 8~15 条）
 *
 * 这一科全是**用户实测出来的真 bug**，每一条都先复现、再修、再锁住。
 * ⚠️ 全程不许碰 `localOnly` / `choices` / `pendingChoices` 三道防幻觉闸门。
 */

// 2026-09-27 是周日
const NOW = new Date(2026, 8, 27, 10, 0, 0);
const task = (id: string, title: string, dueDate = "", completed = false): Task =>
  ({
    id,
    title,
    notes: "",
    priority: 3,
    dueDate,
    dueTime: "",
    remindAt: "",
    completed,
    createdAt: 1,
    updatedAt: 1,
  }) as Task;

const parse = (s: string) => parseQuickAdd({ title: s, notes: "", now: NOW });
const ask = (s: string, tasks: Task[] = []) => answer(s, { tasks, persona: "work", now: NOW });

// ────────────────────────────────────────────────────────────
// 第 9 条：「买一点水果」被当成「凌晨 1 点」
// ────────────────────────────────────────────────────────────
describe("① 一点/两点：是钟点还是「一点点」", () => {
  it("【本次修复】「买一点水果」不再变成 01:00，标题也不许被啃掉", () => {
    const p = parse("买一点水果");
    expect(p.dueTime).toBe("");
    expect(p.dueDate).toBe("");
    expect(p.title).toBe("买一点水果");
  });

  it("「一点小事」「有一点点累」同样不动", () => {
    expect(parse("一点小事").dueTime).toBe("");
    expect(parse("一点小事").title).toBe("一点小事");
    expect(parse("有一点点累").dueTime).toBe("");
    expect(parse("有一点点累").title).toBe("有一点点累");
  });

  it("「买两斤排骨」的「两斤」不是 02:00", () => {
    const p = parse("买两斤排骨");
    expect(p.dueTime).toBe("");
    expect(p.title).toBe("买两斤排骨");
  });

  it("【本次修复】有日期垫底时，「一点」就是下午一点", () => {
    expect(parse("明天一点开会").dueTime).toBe("13:00");
    expect(parse("明天一点开会").dueDate).toBe("2026-09-28");
  });

  it("有「下午」前缀时，一点/两点 = 13/14 点", () => {
    expect(parse("下午一点开会").dueTime).toBe("13:00");
    expect(parse("下午两点开会").dueTime).toBe("14:00");
  });

  it("【本次修复】带分钟的一定是钟点：「一点半」是 13:30", () => {
    expect(parse("一点半开会").dueTime).toBe("13:30");
    expect(parse("明天两点一刻见").dueTime).toBe("14:15");
  });

  it("「凌晨/上午/晚上」在场时按字面走 —— 一点就是 01:00", () => {
    expect(parse("凌晨一点开会").dueTime).toBe("01:00");
    expect(parse("明天上午一点开会").dueTime).toBe("01:00");
    expect(parse("晚上十一点开会").dueTime).toBe("23:00");
  });

  it("其余钟点（三点…十点）照旧", () => {
    expect(parse("明天三点开会").dueTime).toBe("03:00");
    expect(parse("明天十点开会").dueTime).toBe("10:00");
  });

  it("「明天两点见」默认按下午两点 —— 中文里两点天生自带下午", () => {
    expect(parse("明天两点见").dueTime).toBe("14:00");
  });
});

// ────────────────────────────────────────────────────────────
// 第 12 条：「下周/礼拜/N周后」不给日期
// ────────────────────────────────────────────────────────────
describe("② 整周相对日期（原来一条都不认）", () => {
  it("【本次修复】「下周交房租」= 下周一，标题不留残渣", () => {
    const p = parse("下周交房租");
    expect(p.dueDate).toBe("2026-09-28"); // 09-27 周日 → 下周一
    expect(p.title).toBe("交房租");
  });

  it("【本次修复】「两周后交房租」= 今天 +14 天", () => {
    const p = parse("两周后交房租");
    expect(p.dueDate).toBe("2026-10-11");
    expect(p.title).toBe("交房租");
  });

  it("「下下周开会」= 下下周一", () => {
    expect(parse("下下周开会").dueDate).toBe("2026-10-05");
  });

  it("「隔周开会」= 今天 +7 天（不是循环，是一次性的那一天）", () => {
    expect(parse("隔周开会").dueDate).toBe("2026-10-04");
  });

  it("「每两周开会」仍然是**循环**，不被「隔周」规则抢走", () => {
    const p = parse("每两周开会");
    expect(p.repeat).toEqual({ freq: "weekly", interval: 2, weekday: 0 });
  });

  it("【本次修复】「礼拜五」= 周五（礼拜/星期/周 三个词等价）", () => {
    expect(parse("礼拜五交材料").dueDate).toBe("2026-10-02");
    expect(parse("下礼拜五交材料").dueDate).toBe("2026-10-02");
    expect(parse("这礼拜三开会").dueDate).toBe("2026-09-30");
    expect(parse("礼拜五交材料").title).toBe("交材料");
  });

  it("【本次修复】「这个月最后一天」= 本月最后一天（原来算成下月同日 10-27）", () => {
    const p = parse("这个月最后一天交房租");
    expect(p.dueDate).toBe("2026-09-30");
    expect(p.title).toBe("交房租");
  });

  it("原有的周几解析没被带坏", () => {
    expect(parse("下周五交材料").dueDate).toBe("2026-10-02");
    expect(parse("每周一开周会").repeat).toEqual({ freq: "weekly", interval: 1, weekday: 1 });
    expect(parse("3天后交房租").dueDate).toBe("2026-09-30");
  });
});

// ────────────────────────────────────────────────────────────
// 第 8 条：「周报还没写完」被标成已完成
// ────────────────────────────────────────────────────────────
describe("③「还没写完」是汇报进度，不是完成", () => {
  it("【本次修复】undoWord 认「没写完」——不再把任务划掉", () => {
    const tasks = [task("1", "写周报"), task("2", "开会")];
    const r = ask("周报还没写完", tasks);
    expect(r.action?.type === "completeTask" && r.action.done).not.toBe(true);
  });

  it("有了「写周报」这条任务时，直接说它本来就是未完成", () => {
    const r = ask("周报还没写完", [task("1", "写周报")]);
    expect(r.text).toContain("本来就是未完成");
    expect(r.action).toBeUndefined();
  });

  it("反向仍然管用：「周报写完了」才标完成", () => {
    const r = ask("周报写完了", [task("1", "写周报")]);
    expect(r.action).toEqual({ type: "completeTask", id: "1", done: true });
  });

  it("【本次修复】库里只有一条未完成任务时，宁可问一句也不说「没找到」", () => {
    const r = ask("周报还没写完", [task("1", "交房租")]);
    expect(r.text).toContain("你是说");
    expect(r.text).toContain("交房租");
    // ⚠️ 只是**问**：不许直接给动作，必须等用户点确认（防幻觉闸门没动）
    expect(r.action).toBeUndefined();
    expect(r.choices?.[0]).toMatchObject({ id: "1", op: "confirmDone", done: false });
  });
});

// ────────────────────────────────────────────────────────────
// 第 10 条：它教用户回「记下来」，照做却建出「下来」
// ────────────────────────────────────────────────────────────
describe("④「记下来」不许再变成任务「下来」", () => {
  it("【本次修复】光说「记下来」→ 引导补内容，不建垃圾任务", () => {
    const r = ask("记下来");
    expect(r.action).toBeUndefined();
    expect(r.text).toContain("想记什么");
  });

  it("【本次修复】「帮我记下来，明天开会」→ 标题是「开会」", () => {
    const r = ask("帮我记下来，明天开会");
    expect(r.action?.type).toBe("addTask");
    if (r.action?.type === "addTask") {
      expect(r.action.parsed.title).toBe("开会");
      expect(r.action.parsed.dueDate).toBe("2026-09-28");
    }
  });

  it("「帮我记下，交房租」也剥得干净", () => {
    const r = ask("帮我记下，交房租");
    if (r.action?.type === "addTask") expect(r.action.parsed.title).toBe("交房租");
    else expect(r.text).not.toContain("下来");
  });
});

// ────────────────────────────────────────────────────────────
// 第 11 条：删除确认框里点「删除」永远删不掉
// ────────────────────────────────────────────────────────────
describe("⑤ 确认按钮发的话必须被认出来", () => {
  it("【本次修复】「是，删掉」（老按钮原话）算确认", () => {
    expect(readConfirm("是，删掉")).toEqual({ yes: true });
  });

  it("新的按钮原话「删吧」也算", () => {
    expect(readConfirm("删吧")).toEqual({ yes: true });
  });

  it("其它口语确认一起收：确定删除 / 确认删除 / 删掉吧", () => {
    expect(readConfirm("确定删除")).toEqual({ yes: true });
    expect(readConfirm("确认删除")).toEqual({ yes: true });
    expect(readConfirm("删掉吧")).toEqual({ yes: true });
  });

  it("🔴 否定依然优先 —— 「好的，先别删」绝不能变成确认", () => {
    expect(readConfirm("好的，先别删")).toEqual({ yes: false });
    expect(readConfirm("好，不用了")).toEqual({ yes: false });
    expect(readConfirm("对，不过先等等")).toEqual({ yes: false });
  });

  it("拿不准的回复仍然是 null（不替用户做主）", () => {
    expect(readConfirm("这个嘛")).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// 第 13 条：一句话说两件事，只记第一件
// ────────────────────────────────────────────────────────────
describe("⑥ 一句话两件事", () => {
  it("【本次修复】「明天开会，另外记得买牛奶」切得开", () => {
    expect(splitMultiTasks("明天开会，另外记得买牛奶")).toEqual(["明天开会", "买牛奶"]);
  });

  it("【本次修复】两条各自带自己的日期，后天的信息不再丢", () => {
    const r = ask("明天开会，后天交材料");
    expect(r.action?.type).toBe("addTasks");
    if (r.action?.type === "addTasks") {
      expect(r.action.items.map((i) => i.title)).toEqual(["开会", "交材料"]);
      expect(r.action.items[0].dueDate).toBe("2026-09-28");
      expect(r.action.items[1].dueDate).toBe("2026-09-29");
    }
  });

  it("🔴 同一件事的补充说明不许被切开：「开会，讨论预算」还是一条", () => {
    expect(splitMultiTasks("开会，讨论预算")).toEqual([]);
    const r = ask("开会，讨论预算");
    expect(r.action?.type ?? "addTask").not.toBe("addTasks");
  });

  it("疑问句、撤销句不切也不建", () => {
    expect(ask("明天开会吗，另外买牛奶呢").action).toBeUndefined();
    expect(ask("明天不开会了，另外也不买牛奶了").action).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 第 14 条：「把它删了」一律回「没找到」
// ────────────────────────────────────────────────────────────
describe("⑦ 指代删除 / 指代完成", () => {
  it("【本次修复】只有一条未完成任务时，「把它删了」直接进删除确认", () => {
    const r = ask("把它删了", [task("1", "交房租", "2026-09-30")]);
    expect(r.action).toEqual({ type: "confirm", candidateId: "1" });
    expect(r.text).toContain("交房租");
  });

  it("「刚说的那条删了」同样认得", () => {
    const r = ask("刚说的那条删了", [task("1", "交房租")]);
    expect(r.action).toEqual({ type: "confirm", candidateId: "1" });
  });

  it("🔴 多条时**绝不瞎猜**：列出来让用户选，一条也不许删", () => {
    const tasks = [task("1", "交房租"), task("2", "开会"), task("3", "买牛奶")];
    const r = ask("把它删了", tasks);
    expect(r.action).toBeUndefined();
    expect(r.choices?.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(r.choices?.every((c) => c.op === "delete")).toBe(true);
  });

  it("🔴 点了名的任务不许走指代：「把会议纪要删了」不能被当成「随便删一条」", () => {
    const tasks = [task("1", "交房租"), task("2", "开会")];
    const r = ask("把会议纪要删了", tasks);
    expect(r.action).toBeUndefined();
    expect(r.choices).toBeUndefined();
  });

  it("指代完成也认（原来只有改任务认指代）", () => {
    const r = ask("把刚说的那个标完成", [task("1", "交房租")]);
    expect(r.choices?.[0]).toMatchObject({ id: "1", op: "confirmDone", done: true });
  });
});

// ────────────────────────────────────────────────────────────
// 第 15 条：「帮我查一下交房租」被当成离题
// ────────────────────────────────────────────────────────────
describe("⑧「帮我查一下交房租」不是离题", () => {
  it("【本次修复】不再回「这些我可帮不上忙」", () => {
    const r = ask("帮我查一下交房租", [task("1", "交房租", "2026-09-30")]);
    expect(r.text).not.toContain("帮不上忙");
    expect(r.text).toContain("交房租");
  });

  it("【本次修复】真去查了那条任务的状态和时间", () => {
    const r = ask("帮我查一下交房租", [task("1", "交房租", "2026-09-30")]);
    expect(r.text).toContain("2026-09-30");
    expect(r.text).toContain("还没完成");
  });

  it("已经完成的会说已完成", () => {
    const r = ask("帮我查一下交房租", [task("1", "交房租", "2026-09-30", true)]);
    expect(r.text).toContain("已经完成");
  });

  it("查不到就说查不到（本地定论，不转 AI 编）", () => {
    const r = ask("帮我查一下交房租", [task("1", "开会")]);
    expect(r.text).toContain("没找到");
    expect(r.localOnly).toBe(true);
  });

  it("🔴 「查」指向外部世界时仍然拦（天气/股票/新闻）", () => {
    expect(ask("帮我查天气").text).toContain("帮不上忙");
    expect(ask("帮我查一下明天的股票").text).toContain("帮不上忙");
  });

  it("🔴 原来的整句查询没被带坏", () => {
    const tasks = [task("1", "开会", "2026-09-28"), task("2", "交房租", "2026-09-30")];
    expect(ask("查一下明天的安排", tasks).text).toContain("开会");
    expect(ask("今天有什么安排", tasks).text).toContain("今天");
    expect(ask("还有多少没做", tasks).text).toContain("2 件");
  });
});
