import { describe, it, expect } from "vitest";
import { computeDueReminders } from "../src/lib/reminder";
import { needsConfirm, isBlocked, ABILITIES } from "../src/lib/assistantAbility";

/**
 * 轻宜「考试系统」· 第 10 科：纯逻辑（提醒 + 权限）深度边界
 */
const NOW = new Date(2026, 8, 4, 10, 0);
const T = (o: Partial<any>) => ({ id: "t", title: "x", completed: false, remindAt: "", ...o });

describe("提醒：时间边界", () => {
  it("提醒时间正好=现在 → 应提醒", () => {
    const due = computeDueReminders([T({ id: "a", remindAt: NOW.toISOString() })], new Set(), NOW);
    expect(due.length).toBe(1);
  });
  it("提醒时间=1秒后 → 不提醒", () => {
    const later = new Date(NOW.getTime() + 1000);
    expect(computeDueReminders([T({ id: "a", remindAt: later.toISOString() })], new Set(), NOW)).toEqual([]);
  });
  it("提醒时间已过很久 → 仍提醒（补提醒，别漏）", () => {
    const past = new Date(NOW.getTime() - 86400000); // 昨天
    expect(computeDueReminders([T({ id: "a", remindAt: past.toISOString() })], new Set(), NOW).length).toBe(1);
  });
  it("非法 remindAt → 跳过不崩", () => {
    expect(computeDueReminders([T({ id: "a", remindAt: "not-a-date" })], new Set(), NOW)).toEqual([]);
  });
  it("大量任务（500条）性能可接受", () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      T({ id: `t${i}`, remindAt: new Date(NOW.getTime() - 1000).toISOString() }),
    );
    const t0 = Date.now();
    const due = computeDueReminders(many, new Set(), NOW);
    expect(due.length).toBe(500);
    expect(Date.now() - t0).toBeLessThan(100);
  });
});

describe("权限：交叉组合全覆盖（3档 × 4操作 × 开关）", () => {
  const ops = ["query", "create", "update", "delete"] as const;
  const levels = ["readonly", "standard", "full"] as const;
  it("查询：任何档位/开关都不确认", () => {
    for (const l of levels) for (const c of [true, false]) {
      expect(needsConfirm("query", l, c)).toBe(false);
    }
  });
  it("只读档：所有改动类都需确认（且会被 isBlocked 拦住）", () => {
    for (const op of ["create", "update", "delete"] as const) {
      expect(needsConfirm(op, "readonly", false)).toBe(true);
      expect(isBlocked(op, "readonly")).toBe(true);
    }
  });
  it("标准档：仅删除要确认", () => {
    expect(needsConfirm("create", "standard", false)).toBe(false);
    expect(needsConfirm("update", "standard", false)).toBe(false);
    expect(needsConfirm("delete", "standard", false)).toBe(true);
  });
  it("全权档：全都不确认", () => {
    for (const op of ops) expect(needsConfirm(op, "full", false)).toBe(false);
  });
  it("开关开启：建/改也确认（删除本来就确认）", () => {
    expect(needsConfirm("create", "standard", true)).toBe(true);
    expect(needsConfirm("update", "standard", true)).toBe(true);
    expect(needsConfirm("delete", "standard", true)).toBe(true);
  });
  it("只读档不是 isBlocked=false（安全底线）", () => {
    expect(isBlocked("delete", "full")).toBe(false);
    expect(isBlocked("delete", "standard")).toBe(false);
  });
});

describe("权限：档位定义健壮", () => {
  it("三档 key 唯一", () => {
    const keys = ABILITIES.map((a) => a.key);
    expect(new Set(keys).size).toBe(3);
  });
  it("每档描述不超过合理长度（UI 放得下）", () => {
    for (const a of ABILITIES) {
      expect(a.desc.length).toBeLessThan(40);
      expect(a.example.length).toBeLessThan(60);
    }
  });
});
