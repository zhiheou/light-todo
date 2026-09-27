import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 轻宜「考试系统」· 第 27 科：桌宠窗口必须自己会提醒
 *
 * 🔴 用户原话（2026-09-27）：「留桌宠，让桌宠提醒」
 *   —— 他平时只开着桌宠，主窗口是关着的。
 *
 * 事实：提醒逻辑**只写在主窗口 App 里**（一个 10 秒的 setInterval），
 * 桌宠窗口（DesktopPetApp）一行都没有。主窗口不开 = 提醒永远不响，
 * 不管待办上的时间设得多准。
 *
 * 修法：桌宠窗自己扫、自己弹（气泡 + 聊天消息），两个窗口靠同一份
 * `lighttodo:notified:v1:<空间>` 去重。
 */

// ---------- 假 localStorage ----------
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

let store: ReturnType<typeof makeStorage>;

beforeEach(() => {
  store = makeStorage();
  vi.resetModules();
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    localStorage: store,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
});

const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();

const task = (id: string, title: string, remindAt: string, completed = false) =>
  ({
    id,
    title,
    notes: "",
    priority: 3,
    dueDate: "",
    dueTime: "",
    remindAt,
    completed,
    createdAt: 1,
    updatedAt: 1,
  }) as never;

describe("到点判断（桌宠窗与主窗口共用同一套纯函数）", () => {
  it("【本次修复】到点了、没提醒过的任务，会被挑出来", async () => {
    const { computeDueReminders } = await import("../src/lib/reminder");
    const due = computeDueReminders(
      [task("a", "开会", at(-1))],
      new Set<string>(),
      new Date(),
    );
    expect(due.map((t) => t.id)).toEqual(["a"]);
  });

  it("时间还没到 → 不提醒", async () => {
    const { computeDueReminders } = await import("../src/lib/reminder");
    const due = computeDueReminders([task("a", "开会", at(5))], new Set<string>(), new Date());
    expect(due).toEqual([]);
  });

  it("已经提醒过 → 不再重复提醒", async () => {
    const { computeDueReminders } = await import("../src/lib/reminder");
    const due = computeDueReminders([task("a", "开会", at(-1))], new Set(["a"]), new Date());
    expect(due).toEqual([]);
  });

  it("已完成的任务不提醒（哪怕时间到了）", async () => {
    const { computeDueReminders } = await import("../src/lib/reminder");
    const due = computeDueReminders([task("a", "开会", at(-1), true)], new Set<string>(), new Date());
    expect(due).toEqual([]);
  });

  it("没设提醒时间的任务不提醒", async () => {
    const { computeDueReminders } = await import("../src/lib/reminder");
    const due = computeDueReminders([task("a", "开会", "")], new Set<string>(), new Date());
    expect(due).toEqual([]);
  });

  it("提醒时间是脏数据（不是合法 ISO）→ 跳过，不崩", async () => {
    const { computeDueReminders } = await import("../src/lib/reminder");
    expect(() =>
      computeDueReminders([task("a", "开会", "明天下午")], new Set<string>(), new Date()),
    ).not.toThrow();
  });
});

describe("「已提醒」要落盘（关掉桌宠再打开，同一条不该再响一次）", () => {
  it("【本次修复】存了就读得回来", async () => {
    const { saveNotified, loadNotified } = await import("../src/lib/reminder");
    saveNotified("work", new Set(["a", "b"]));
    expect([...loadNotified("work")].sort()).toEqual(["a", "b"]);
  });

  it("两个空间各存各的（工作提醒过的不影响个人空间）", async () => {
    const { saveNotified, loadNotified } = await import("../src/lib/reminder");
    saveNotified("work", new Set(["a"]));
    expect([...loadNotified("personal")]).toEqual([]);
  });

  it("只存 id，不存任务内容（隐私）", async () => {
    const { saveNotified } = await import("../src/lib/reminder");
    saveNotified("work", new Set(["secret-id"]));
    expect(store.getItem("lighttodo:notified:v1:work")).toBe('["secret-id"]');
  });

  /**
   * 🔴 两个窗口同时开着时的去重依据就是这份落盘记录：
   *   主窗口扫到 → 弹出 + 写下"提醒过了" → 桌宠窗下一轮读到，不再弹。
   * 所以它必须是**共享的、按空间分仓的同一份**，任何一个窗口另存一份都会双重提醒。
   */
  it("【去重依据】A 窗口写下之后，B 窗口能读到", async () => {
    const winA = await import("../src/lib/reminder");
    const due = winA.computeDueReminders([task("a", "开会", at(-1))], new Set<string>(), new Date());
    expect(due).toHaveLength(1);
    const seen = new Set<string>();
    for (const t of due) seen.add(t.id);
    winA.saveNotified("work", seen);

    vi.resetModules();
    const winB = await import("../src/lib/reminder");
    const again = winB.computeDueReminders([task("a", "开会", at(-1))], winB.loadNotified("work"), new Date());
    expect(again).toEqual([]);
  });
});
