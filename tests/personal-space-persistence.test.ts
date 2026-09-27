import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 轻宜「考试系统」· 第 26 科：个人空间不许关一下就没了 + 删掉的不许复活
 *
 * 🔴 用户原话（2026-09-27 体检报告 ①②）：
 *   「个人空间的东西，关掉再打开就没了」「登录一下个人空间被清空，云端那份也跟着没了」
 *
 * 事实：
 *   · 个人空间的**任务/备忘/维度/目标**四项全是 `useState([])` —— 根本没有本机存档。
 *     只有"进入个人空间"这一个入口，一关窗口内存就没了，再打开就是空的。
 *   · 更糟的是那个空 state 会顺着 800ms 自动同步把**云端那份覆盖成空**。
 *   · 登录/重开时 `resetAllLocalData()` 清空 → 持久化 effect 立刻把空列表写盘 →
 *     等守卫回头想读回来时，磁盘已经被自己人抹干净了。
 *
 * 修法：
 *   · 四项都补上本机存档（dimensionsLocal.ts / goalsLocal.ts / memos.ts 加了 personal 键）
 *   · 这些存档同样受"认证流程闸门"保护（否则登录一下就被清空）
 *   · 顺带：删除要留**墓碑**，否则删完 30 秒的拉取会把删掉的整条带回来
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

const task = (id: string, title: string, updatedAt = 1) =>
  ({
    id,
    title,
    notes: "",
    priority: 3,
    dueDate: "",
    dueTime: "",
    remindAt: "",
    completed: false,
    createdAt: updatedAt,
    updatedAt,
  }) as never;

// ---------- 1. 个人空间有本机存档 ----------

describe("个人空间要有本机存档（关掉再打开不能没了）", () => {
  it("【本次修复】个人空间的备忘存得下、读得回", async () => {
    const { savePersonalMemos, loadPersonalMemos } = await import("../src/lib/memos");
    savePersonalMemos([{ id: "m1", text: "买菜", pinned: false, createdAt: 1, updatedAt: 1 }] as never);
    expect(loadPersonalMemos().map((m) => m.text)).toEqual(["买菜"]);
  });

  it("个人空间的维度存得下、读得回", async () => {
    const { savePersonalDimensions, loadPersonalDimensions } = await import(
      "../src/lib/dimensionsLocal"
    );
    savePersonalDimensions([
      { id: "d1", name: "生活", color: "rose", sortOrder: 0, createdAt: 1 },
    ] as never);
    expect(loadPersonalDimensions().map((d) => d.name)).toEqual(["生活"]);
  });

  it("个人空间的目标存得下、读得回", async () => {
    const { savePersonalGoals, loadPersonalGoals } = await import("../src/lib/goalsLocal");
    savePersonalGoals([{ id: "g1", title: "跑 100 公里", createdAt: 1, updatedAt: 1 }] as never);
    expect(loadPersonalGoals().map((g) => g.title)).toEqual(["跑 100 公里"]);
  });

  it("工作空间和个人空间互不串（各存各的键）", async () => {
    const { saveWorkMemos, savePersonalMemos, loadWorkMemos, loadPersonalMemos } = await import(
      "../src/lib/memos"
    );
    saveWorkMemos([{ id: "w", text: "周报", pinned: false, createdAt: 1, updatedAt: 1 }] as never);
    savePersonalMemos([{ id: "p", text: "买菜", pinned: false, createdAt: 1, updatedAt: 1 }] as never);
    expect(loadWorkMemos().map((m) => m.text)).toEqual(["周报"]);
    expect(loadPersonalMemos().map((m) => m.text)).toEqual(["买菜"]);
  });

  /**
   * 个人空间**不能**补种子维度。
   * 工作空间那边 `loadDimensions` 在没有存档时会塞「工作/学习/健康」三个兜底维度，
   * 个人空间照抄的话，第一次进去就会凭空冒出「生活/家庭」两个**用户没建过**的维度，
   * 还不等用户反应过来就被当成他的数据上传了。
   */
  it("【反向保护】个人空间第一次读维度时不许凭空造维度", async () => {
    const { loadPersonalDimensions, loadWorkDimensions } = await import(
      "../src/lib/dimensionsLocal"
    );
    expect(loadPersonalDimensions()).toEqual([]);
    // 工作空间保留兜底行为（界面靠它显示默认分类），这里一并锁住，防误删
    expect(loadWorkDimensions().length).toBeGreaterThan(0);
  });
});

// ---------- 2. 认证期间个人空间不许被写空 ----------

describe("登录/重开时，个人空间的空写必须被拦住", () => {
  /**
   * 登录/注册/恢复会话的第一步是 `resetAllLocalData()`（清空 React state，防上个账号残留闪现）。
   * 持久化 effect 随即把 `[]` 写下来 —— 那是"清界面残留"，不是用户删数据。
   * 工作空间的任务/备忘早就有这道闸门了，个人空间这四项是新加的，必须一起上锁。
   */
  it("【本次修复】闸门内：个人空间的备忘空写不落盘", async () => {
    const { savePersonalMemos, loadPersonalMemos } = await import("../src/lib/memos");
    const { beginAuthTransition, endAuthTransition } = await import("../src/lib/syncLock");

    savePersonalMemos([{ id: "m1", text: "买菜", pinned: false, createdAt: 1, updatedAt: 1 }] as never);

    beginAuthTransition();
    savePersonalMemos([] as never); // resetAllLocalData 引发的空写
    expect(loadPersonalMemos().map((m) => m.text)).toEqual(["买菜"]); // 还在

    endAuthTransition();
    savePersonalMemos([] as never); // 关闸后用户真删了 → 这次要落盘
    expect(loadPersonalMemos()).toEqual([]);
  });

  it("闸门内：个人空间的维度空写不落盘", async () => {
    const { savePersonalDimensions, loadPersonalDimensions } = await import(
      "../src/lib/dimensionsLocal"
    );
    const { beginAuthTransition, endAuthTransition } = await import("../src/lib/syncLock");

    savePersonalDimensions([{ id: "d1", name: "生活", color: "rose", sortOrder: 0, createdAt: 1 }] as never);
    beginAuthTransition();
    savePersonalDimensions([] as never);
    expect(loadPersonalDimensions()).toHaveLength(1);
    endAuthTransition();
  });

  it("闸门内：个人空间的目标空写不落盘", async () => {
    const { savePersonalGoals, loadPersonalGoals } = await import("../src/lib/goalsLocal");
    const { beginAuthTransition, endAuthTransition } = await import("../src/lib/syncLock");

    savePersonalGoals([{ id: "g1", title: "跑 100 公里", createdAt: 1, updatedAt: 1 }] as never);
    beginAuthTransition();
    savePersonalGoals([] as never);
    expect(loadPersonalGoals()).toHaveLength(1);
    endAuthTransition();
  });
});

// ---------- 3. 删除必须留墓碑（否则 30 秒后复活） ----------

describe("删掉的任务不许被服务器旧数据带回来", () => {
  /**
   * 删除之后这条任务就没了 —— 水位（各条 updatedAt 的最大值）**抬不动**。
   * 于是「本机比服务器新就留住本机」判不出来，30 秒一次的拉取把服务器旧列表整份铺回来，
   * 刚删的任务原地复活。墓碑就是给这个场景准备的。
   */
  it("【本次修复】本机删掉的，merge 时不许从服务器那份回来", async () => {
    const { noteTaskDeleted, mergeLocalIntoRemote } = await import("../src/lib/tasks");

    const dead = task("dead", "已经删掉的", 100);
    const alive = task("alive", "还留着的", 100);
    noteTaskDeleted("work", "dead", 5000);

    const merged = mergeLocalIntoRemote("work", [alive], [dead, alive]);
    expect(merged.map((t) => t.id)).toEqual(["alive"]);
  });

  it("本机新加的，merge 时不能被服务器那份丢掉", async () => {
    const { mergeLocalIntoRemote } = await import("../src/lib/tasks");
    const mine = task("mine", "刚在桌宠里记的", 9999);
    const merged = mergeLocalIntoRemote("work", [mine], [task("old", "服务器上的", 100)]);
    expect(merged.map((t) => t.id).sort()).toEqual(["mine", "old"]);
  });

  it("两边都有、本机更新 → 听本机的", async () => {
    const { mergeLocalIntoRemote } = await import("../src/lib/tasks");
    const merged = mergeLocalIntoRemote(
      "work",
      [task("x", "本机改过的", 9000)],
      [task("x", "服务器上的旧标题", 100)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("本机改过的");
  });

  it("撤销删除后，墓碑一并撤掉（那条能正常同步回来）", async () => {
    const { noteTaskDeleted, undoTaskDeleted, mergeLocalIntoRemote } = await import(
      "../src/lib/tasks"
    );
    const t = task("x", "删错了", 100);
    noteTaskDeleted("work", "x", 5000);
    undoTaskDeleted("work", "x", 5000);
    expect(mergeLocalIntoRemote("work", [], [t]).map((x) => x.id)).toEqual(["x"]);
  });

  it("只撤同一时刻的那条墓碑（更早删过一次的不受影响）", async () => {
    const { noteTaskDeleted, undoTaskDeleted, isTombstoned } = await import("../src/lib/tasks");
    noteTaskDeleted("work", "x", 1000);
    noteTaskDeleted("work", "x", 5000);
    undoTaskDeleted("work", "x", 5000);
    expect(isTombstoned("work", "x", 100)).toBe(true); // 早先那次的删除仍然有效
  });
});

// ---------- 4. 墓碑要能跨窗口、跨重启 ----------

describe("墓碑要落盘（关掉窗口再打开，删除依然算数）", () => {
  it("【本次修复】删一条 → 写盘 → 另一个窗口读得到", async () => {
    const pet = await import("../src/lib/tasks");
    pet.noteTaskDeleted("work", "dead", 5000);
    pet.saveTasks("work", [task("alive", "还留着的", 100)]);

    const raw = JSON.parse(store.getItem("lighttodo:work:v1") as string);
    expect(Array.isArray(raw)).toBe(false); // 带墓碑时是 { tasks, tombstones }
    expect(raw.tombstones).toHaveLength(1);
    // 隐私：墓碑里**不能有任务内容**
    expect(JSON.stringify(raw.tombstones)).not.toContain("已经删掉的");

    vi.resetModules();
    const main = await import("../src/lib/tasks");
    main.loadTasks("work"); // 吸收磁盘上的墓碑
    const merged = main.mergeLocalIntoRemote("work", [], [task("dead", "已经删掉的", 100)]);
    expect(merged).toEqual([]); // 不复活
  });

  /**
   * 🔴 这条是"两个窗口互相把墓碑压没"的回归测试。
   *
   * 跨窗口重读走的是"从磁盘读回对方的快照"。若本窗口读的时候不把墓碑吸收进来，
   * 下一次它写盘（哪怕只是点了别的按钮）就会写出一份**没有墓碑**的 json 盖回磁盘 ——
   * 那次删除的凭据就没了，30 秒后任务复活。
   */
  it("【本次修复】本窗口重读后写回同样的内容，磁盘上的墓碑不许被压没", async () => {
    const pet = await import("../src/lib/tasks");
    pet.noteTaskDeleted("work", "dead", 5000);
    pet.saveTasks("work", [task("alive", "还留着的", 100)]);
    const before = JSON.parse(store.getItem("lighttodo:work:v1") as string);

    vi.resetModules();
    const main = await import("../src/lib/tasks");
    const read = main.loadTasksIfChanged("work"); // 另一个窗口读到了
    expect(read).not.toBeNull();
    main.saveTasks("work", read as never); // 原样写回（界面重渲染等）

    // 比对内容而不是原字符串：normalizeTask 会把字段顺序规范化，那是正常的。
    // 要守住的是"墓碑还在、任务没变"。
    const after = JSON.parse(store.getItem("lighttodo:work:v1") as string);
    expect(after.tombstones).toEqual(before.tombstones);
    expect(after.tasks).toEqual(before.tasks);
  });

  it("墓碑自己就把水位抬起来了（删除也是改动）", async () => {
    const { noteTaskDeleted, saveTasks } = await import("../src/lib/tasks");
    const { getLocalRevision } = await import("../src/lib/syncLock");

    saveTasks("work", [task("alive", "还留着的", 100)]);
    const before = getLocalRevision();
    await new Promise((r) => setTimeout(r, 3));

    noteTaskDeleted("work", "dead", Date.now());
    saveTasks("work", [task("alive", "还留着的", 100)]);
    expect(getLocalRevision()).toBeGreaterThan(before);
  });

  it("墓碑用完了（服务器数据比它新）才回收，回收后磁盘上是干净的纯列表", async () => {
    const { noteTaskDeleted, saveTasks, clearTombstones, loadTasks } = await import(
      "../src/lib/tasks"
    );
    noteTaskDeleted("work", "dead", 5000);
    saveTasks("work", [task("alive", "还留着的", 100)]);

    clearTombstones("work");
    const raw = JSON.parse(store.getItem("lighttodo:work:v1") as string);
    expect(Array.isArray(raw)).toBe(true);
    expect(loadTasks("work").map((t) => t.id)).toEqual(["alive"]);
  });
});
