import { describe, it, expect } from "vitest";
import { answer } from "../src/lib/mascotBrain";

/**
 * 轻宜「考试系统」· 第 20 科：否定句 / 疑问句 / 错别字
 *
 * 这一批全是**独立审查员实跑复现**出来的真 bug，共同特征：
 * 「规则只认用户可能说的那几种句式，换个说法就**朝相反方向执行**」——
 * 这比听不懂更危险（会改错数据）。
 *
 *   ① 「别删除交房租那条」  → 变成"确认删除"（用户回"好的"就真删了）
 *   ② 「周报写完了吗」      → 直接把周报标成完成（用户只是在问！）
 *   ③ 「把开会标回未完成」  → 反向执行成"完成"
 *   ④ 「明天不开会了」      → 建成任务「不开会了」
 *   ⑤ 「明天不用提醒我交房租了」→ 建成任务（还自带 09:00 提醒）
 *   ⑥ 「我明天要去医院复查，记一下」→ 任务没建，回"明天没有安排"
 *   ⑦ 「明天有安排吗」      → 建成任务「有安排吗」
 *   ⑧ 「周5交方案」        → 日期整个丢失
 *   ⑨ 「明天下五3点开会」  → 算成凌晨 03:00（"下五"是"下午"的错字）
 */

const ctx = {
  tasks: [
    { id: "1", title: "交房租", completed: false, createdAt: 1, updatedAt: 1 },
    { id: "2", title: "写周报", completed: false, createdAt: 1, updatedAt: 1 },
    { id: "3", title: "开会", completed: false, createdAt: 1, updatedAt: 1 },
  ],
  persona: "work" as const,
};

describe("否定句：不能朝反方向执行", () => {
  it("【高危】「别删除交房租那条」→ 绝不能进入删除流程", () => {
    const r = answer("别删除交房租那条", ctx);
    expect(r.action).toBeUndefined();
    expect(r.text).not.toContain("确定要删除");
    expect(r.text).toContain("不删");
  });

  it("「这个不用删掉」同样不能删", () => {
    const r = answer("这个不用删掉", ctx);
    expect(r.action).toBeUndefined();
  });

  it("【高危】「把开会标回未完成」→ 绝不能反向标成「完成」", () => {
    const r = answer("把开会标回未完成", ctx);
    // 关键：不能出现 done:true（那正是被修掉的反向 bug）
    if (r.action) {
      expect((r.action as { done?: boolean }).done).not.toBe(true);
    }
    // "开会"本来就是未完成的 → 如实说明、不动作（这也是对的）
    expect(r.text).not.toContain("完成「开会」");
  });

  it("【高危】已完成的任务说「标回未完成」→ 真的标回去", () => {
    const doneCtx = {
      tasks: [{ id: "1", title: "开会", completed: true, createdAt: 1, updatedAt: 1 }],
      persona: "work" as const,
    };
    const r = answer("把开会标回未完成", doneCtx);
    expect(r.action?.type).toBe("completeTask");
    expect((r.action as { done?: boolean }).done).toBe(false);
  });

  it("「取消完成开会」在未完成状态下如实说明（不反向执行）", () => {
    const r = answer("取消完成开会", ctx);
    if (r.action) expect((r.action as { done?: boolean }).done).not.toBe(true);
    expect(r.text).not.toContain("完成「开会」");
  });

  it("否定句不能建成任务", () => {
    for (const s of ["明天不开会了", "周一的会取消了", "明天的面试不去了", "这个任务不用做了"]) {
      const r = answer(s, ctx);
      expect(r.action, `「${s}」不该建任务`).toBeUndefined();
    }
  });

  it("「明天不用提醒我交房租了」不能建成带提醒的任务", () => {
    const r = answer("明天不用提醒我交房租了", ctx);
    expect(r.action).toBeUndefined();
  });
});

describe("疑问句：只回答，不改数据", () => {
  it("【高危】「周报写完了吗」→ 不能把周报标成完成", () => {
    const r = answer("周报写完了吗", ctx);
    expect(r.action).toBeUndefined();
  });

  it("同类反问句都不能改数据", () => {
    for (const s of ["开会开完了吗", "体检做完了吗", "周报完成了么", "开会是不是做完了"]) {
      expect(answer(s, ctx).action, `「${s}」不该有动作`).toBeUndefined();
    }
  });

  it("【回归】「明天有安排吗」不能建成任务「有安排吗」", () => {
    const r = answer("明天有安排吗", ctx);
    expect(r.action).toBeUndefined();
  });

  it("常见疑问句都不建任务", () => {
    for (const s of ["早上有什么安排", "下周什么安排", "明天有事吗", "这周还有什么没做"]) {
      expect(answer(s, ctx).action, `「${s}」不该建任务`).toBeUndefined();
    }
  });

  it("但正常的陈述句仍然要建任务（别修坏）", () => {
    expect(answer("明天下午三点开会", ctx).action?.type).toBe("addTask");
  });
});

describe("带「记一下」的任务不能被查询劫走", () => {
  it("【回归】「我明天要去医院复查，记一下」→ 必须建任务", () => {
    const r = answer("我明天要去医院复查，记一下", ctx);
    expect(r.action?.type).toBe("addTask");
    expect(r.text).toContain("记下了");
  });

  it("句中含「查/看看」也要建任务", () => {
    for (const s of ["帮我记一下，明天要去银行查账", "记得明天要看看快递到没到", "帮我记一下，明天要检查身体"]) {
      expect(answer(s, ctx).action?.type, `「${s}」应建任务`).toBe("addTask");
    }
  });
});

describe("错别字 / 简写的时间解析", () => {
  it("【回归】「周5交方案」→ 要认出周五", () => {
    const r = answer("周5交方案", ctx);
    const p = (r.action as { parsed?: { dueDate?: string; title?: string } } | undefined)?.parsed;
    expect(p?.dueDate).toBeTruthy();
    expect(p?.title).toBe("交方案");
  });

  it("「星期3开会」同样识别", () => {
    const p = (answer("星期3开会", ctx).action as { parsed?: { dueDate?: string } } | undefined)?.parsed;
    expect(p?.dueDate).toBeTruthy();
  });

  it("【回归】「明天下五3点开会」→ 15:00（「下五」是「下午」的错字），不是凌晨3点", () => {
    const p = (answer("明天下五3点开会", ctx).action as { parsed?: { dueTime?: string } } | undefined)?.parsed;
    expect(p?.dueTime).toBe("15:00");
  });
});
