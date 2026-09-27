import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 轻宜「考试系统」· 第 20 科：跨窗口数据不许被抹掉
 *
 * 🔴 用户原话（2026-09-27）：
 *   「明天要跟进vivo锁机事项」→ 轻宜回「好，我帮你记下了：\n「要跟进vivo锁机事项」\n⏰ 2026-09-28」
 *   → **待办列表里根本没有这条** → "他说给我添加了，问题待办里面根本没有找到"
 *
 * 查清的事实（不是猜的）：
 *   · 大脑是对的 —— 复现原话，它确实吐出 `addTask` 动作，桌宠窗口也确实写盘了
 *   · 用户机器上 `lighttodo:work:v1` 里 41 条任务，**没有这一条**，最近一条建于 9/22
 *   · 关键在这里：桌面版是**两个窗口共用一份 localStorage**
 *       ① 主窗口（完整网页界面）  ② 桌宠窗口（常驻桌面那只）
 *     主窗口的任务列表在**内存**里，只在"自己"改动时才更新；
 *     它的防覆盖时间戳 `lastLocalEdit` 也**只有主窗口自己会赋值**。
 *     而它每 30 秒 / 每次窗口获得焦点，就会把**服务器上的旧数据整份替换**本地并回写。
 *   → 桌宠刚记的那条，**存活最多 30 秒**。更糟的是：用户去主窗口找它，
 *     这个"点一下窗口"的动作正好触发拉取 —— 于是永远找不到。
 *
 * 修法（见 lib/syncLock.ts）：写盘即"登记"水位 + 跨窗口 storage 事件互相重读 + 旧数据不许盖新的。
 * 这组测试锁死这条链上最容易再断的三处。
 */

// ---------- 假 localStorage（跨"窗口"共享） ----------
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
    _dump: () => Object.fromEntries(map),
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

// ---------- 1. 写盘即登记 ----------

describe("写盘必须登记水位（否则服务器旧数据会把新数据盖掉）", () => {
  it("【本次事故】saveTasks 后水位必须前进", async () => {
    const { saveTasks } = await import("../src/lib/tasks");
    const { getLocalRevision } = await import("../src/lib/syncLock");

    const before = getLocalRevision();
    await new Promise((r) => setTimeout(r, 3));
    saveTasks("work", [
      {
        id: "t1",
        title: "要跟进vivo锁机事项",
        notes: "",
        priority: 3,
        dueDate: "2026-09-28",
        dueTime: "",
        remindAt: "",
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ] as never);

    expect(getLocalRevision()).toBeGreaterThan(before);
  });

  it("【本次事故】桌宠窗口写的那条，必须能被主窗口的水位算出来（dataWatermark 认 updatedAt）", async () => {
    const { saveTasks } = await import("../src/lib/tasks");
    const { dataWatermark } = await import("../src/lib/syncLock");

    await new Promise((r) => setTimeout(r, 3));
    const stamp = Date.now();
    saveTasks("work", [
      {
        id: "t1",
        title: "要跟进vivo锁机事项",
        notes: "",
        priority: 3,
        dueDate: "2026-09-28",
        dueTime: "",
        remindAt: "",
        completed: false,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ] as never);

    // 主窗口拿自己内存里的服务器数据来比水位时，必须看出"本地更新"
    const serverData = {
      updatedAt: stamp - 60_000,
      workTasks: [{ updatedAt: stamp - 60_000 }],
    };
    const local = JSON.parse(store.getItem("lighttodo:work:v1") as string);
    const localMark = Math.max(0, dataWatermark({ workTasks: local }));

    expect(localMark).toBeGreaterThan(dataWatermark(serverData));
  });

  it("保存不会篡改条目内容（updatedAt 是排版依据，不能被批量刷成同一个值）", async () => {
    const { saveTasks } = await import("../src/lib/tasks");
    saveTasks("personal", [
      {
        id: "a",
        title: "甲",
        notes: "",
        priority: 3,
        dueDate: "",
        dueTime: "",
        remindAt: "",
        completed: false,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "b",
        title: "乙",
        notes: "",
        priority: 3,
        dueDate: "",
        dueTime: "",
        remindAt: "",
        completed: false,
        createdAt: 2,
        updatedAt: 2,
      },
    ] as never);
    const saved = JSON.parse(store.getItem("lighttodo:personal:v1") as string);
    // 备忘列表按 updatedAt 排序（"最近改过的排前面"），全部盖成同一时刻会把这个顺序抹平
    expect(saved[0].updatedAt).toBe(1);
    expect(saved[1].updatedAt).toBe(2);
  });
});

// ---------- 2. normalizeTask 不许刷新 updatedAt ----------

describe("normalizeTask 不许刷新 updatedAt（否则水位会被读取动作自己抬高）", () => {
  it("【关键】已有的 updatedAt 必须原样保留", async () => {
    const { normalizeTask } = await import("../src/lib/tasks");
    const t = normalizeTask({
      id: "x",
      title: "跟进vivo锁机",
      createdAt: 100,
      updatedAt: 12345,
    } as never);
    // 若这里被刷成 Date.now()，每次"读一下"都会把水位抬到"现在"，
    // 结果旧数据反而会盖掉新数据 —— 修完还是白修。
    expect(t.updatedAt).toBe(12345);
    expect(t.createdAt).toBe(100);
  });
});

// ---------- 2.5 水位口径 ----------

describe("水位口径：只看条目自己的 updatedAt，不看信封", () => {
  it("【反向保护】信封上的 updatedAt 不算数（它每次同步都会刷新）", async () => {
    const { dataWatermark } = await import("../src/lib/syncLock");
    // collectAppData() 每次都把信封 updatedAt 刷成"现在"。
    // 若拿它当水位，本机永远显得比服务器新 → 服务器数据再也进不来。
    const w = dataWatermark({
      updatedAt: 9_999_999_999_999,
      workTasks: [{ updatedAt: 100 }],
    });
    expect(w).toBe(100);
  });

  it("两边一条数据都没有时，才退回用信封时间", async () => {
    const { dataWatermark } = await import("../src/lib/syncLock");
    expect(dataWatermark({ updatedAt: 555, workTasks: [], workMemos: [] })).toBe(555);
  });

  it("取所有条目里最新的那个", async () => {
    const { dataWatermark } = await import("../src/lib/syncLock");
    expect(
      dataWatermark({
        workTasks: [{ updatedAt: 10 }, { updatedAt: 70 }],
        workMemos: [{ updatedAt: 40 }],
        personalTasks: [{ updatedAt: 25 }],
      }),
    ).toBe(70);
  });
});

// ---------- 3. 跨窗口重读 ----------

describe("跨窗口重读：另一个窗口改了，本窗口要读得到（同窗口自己写的不重读）", () => {
  it("【本次事故】桌宠写了一条 → 主窗口 loadTasksIfChanged 必须拿到它", async () => {
    const pet = await import("../src/lib/tasks");
    // 模拟"桌宠窗口"写盘（同一个 localStorage）
    pet.saveTasks("work", [
      {
        id: "vivo",
        title: "要跟进vivo锁机事项",
        notes: "",
        priority: 3,
        dueDate: "2026-09-28",
        dueTime: "",
        remindAt: "",
        completed: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ] as never);

    // 主窗口模块是"另一个窗口"的一份实例：它没写过，所以必须看到变化
    vi.resetModules();
    const main = await import("../src/lib/tasks");
    const got = main.loadTasksIfChanged("work");
    expect(got).not.toBeNull();
    expect(got?.map((t) => t.title)).toContain("要跟进vivo锁机事项");
  });

  it("自己刚写完的，不应被自己当成'外部改动'（否则两个窗口无限对写）", async () => {
    const win = await import("../src/lib/tasks");
    win.saveTasks("work", []);
    expect(win.loadTasksIfChanged("work")).toBeNull();
  });

  /**
   * 这条是防"修好了这个、弄坏了那个"：
   * 主窗口挂载时会 loadTasks() 再原样 saveTasks() 一次。
   * 如果把这次"什么都没改的回写"也算成改动 → 水位立刻变成"现在" →
   * 服务器数据（就算更新）也被判成"更旧"永远拒绝 → **多端同步静默失效**。
   */
  it("【反向保护】把读出来的东西原样写回，不算改动（否则多端同步会失效）", async () => {
    const { saveTasks } = await import("../src/lib/tasks");
    const { getLocalRevision } = await import("../src/lib/syncLock");

    const list = [
      {
        id: "t1",
        title: "已有任务",
        notes: "",
        priority: 3,
        dueDate: "",
        dueTime: "",
        remindAt: "",
        completed: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    saveTasks("work", list as never);
    const after1 = getLocalRevision();

    await new Promise((r) => setTimeout(r, 3));
    const again = JSON.parse(store.getItem("lighttodo:work:v1") as string);
    saveTasks("work", again);

    expect(getLocalRevision()).toBe(after1); // 水位没动
  });

  it("真的改了内容，水位才前进", async () => {
    const { saveTasks } = await import("../src/lib/tasks");
    const { getLocalRevision } = await import("../src/lib/syncLock");

    saveTasks("work", [] as never);
    const before = getLocalRevision();
    await new Promise((r) => setTimeout(r, 3));
    saveTasks("work", [{ id: "x", title: "新任务", updatedAt: 1, createdAt: 1 }] as never);

    expect(getLocalRevision()).toBeGreaterThan(before);
  });

  it("没变化时返回 null，不制造多余的 state 更新", async () => {
    const win = await import("../src/lib/tasks");
    expect(win.loadTasksIfChanged("work")).toBeNull();
  });

  it("store 里是脏数据时返回 null，不抛异常", async () => {
    store.setItem("lighttodo:work:v1", "{不是合法 JSON");
    const win = await import("../src/lib/tasks");
    expect(() => win.loadTasksIfChanged("work")).not.toThrow();
    expect(win.loadTasksIfChanged("work")).toBeNull();
  });
});

// ---------- 4. 备忘同样受保护 ----------

describe("备忘走同一套跨窗口保护", () => {
  it("桌宠写的备忘，主窗口也读得到", async () => {
    const pet = await import("../src/lib/memos");
    pet.saveWorkMemos([
      {
        id: "m1",
        text: "锁机事项要跟进",
        pinned: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ] as never);

    vi.resetModules();
    const main = await import("../src/lib/memos");
    const got = main.loadMemosIfChanged("work");
    expect(got?.map((m) => m.text)).toContain("锁机事项要跟进");
  });

  it("自己写完不重读", async () => {
    const win = await import("../src/lib/memos");
    win.saveWorkMemos([]);
    expect(win.loadMemosIfChanged("work")).toBeNull();
  });
});

// ---------- 5. 订阅机制 ----------

describe("订阅：storage 事件到达时，订阅者必须被叫醒", () => {
  it("非本 App 的键不打扰订阅者", async () => {
    const listeners: Array<(e: { key: string | null }) => void> = [];
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: store,
      addEventListener: (t: string, fn: (e: { key: string | null }) => void) => {
        if (t === "storage") listeners.push(fn);
      },
      removeEventListener: () => {},
    };
    const { ensureExternalWriteWatch, subscribeExternalWrite } = await import("../src/lib/syncLock");
    ensureExternalWriteWatch();

    let hits = 0;
    subscribeExternalWrite(() => {
      hits += 1;
    });

    listeners.forEach((fn) => fn({ key: "别的应用的键" }));
    expect(hits).toBe(0);

    listeners.forEach((fn) => fn({ key: "lighttodo:work:v1" }));
    expect(hits).toBe(1);
  });
});
