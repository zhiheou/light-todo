/**
 * v3.9.22 跨窗口写入登记（修「说了记下了、列表里却没有」）
 *
 * 🔴 修的是什么：
 *   桌面版是**两个窗口共用一个 localStorage**（`partition: persist:lighttodo`）：
 *     ① 主窗口（App，完整网页界面）
 *     ② 桌宠窗口（`?desktop=pet`，常驻桌面的那只）
 *   用户在桌宠里说「明天要跟进vivo锁机事项」，大脑判定 `addTask`，
 *   **桌宠窗口当场写盘、当场回「好，我帮你记下了」** —— 到这里都是对的。
 *
 *   但主窗口不知道这件事：
 *     · 它的任务列表在内存里（React state），只在**自己**改动时才更新
 *     · `lastLocalEdit`（防覆盖用的时间戳）也**只有主窗口自己会赋值**
 *     · 每 30 秒 / 每次窗口获得焦点，它会把**服务器上的旧数据整份替换**本地并回写
 *       （`applyAppData` + `saveTasks`）
 *   → 桌宠刚记的那条被它从内存里"原样写回旧值"抹掉了。**存活最多 30 秒。**
 *   更糟的是：用户去主窗口找它，这个"点击窗口"的动作正好触发拉取 —— 于是永远找不到。
 *
 * 🔑 为什么时间戳要"登记"而不是"猜"：
 *   只给主窗口自己的按钮加时间戳是不够的 —— 那样桌宠的写入对主窗口依然不可见，
 *   还是会重演同一个 bug。**所有写盘的地方都必须登记**，判据才完整。
 *
 * 配套：`saveTasks`/`saveWorkMemos` 里"内容没变就不写"的保护，
 * 防止两个窗口互相把对方的新数据写回去、无限对写。
 */

/** 内存态时间戳：本窗口最近一次写盘的时刻（不落盘，重启即清零） */
let revision = 0;

/** 记一次本窗口写入，返回该时刻。需落盘的数据把返回值存进 `updatedAt` 一起持久化。 */
export function bumpLocalRevision(): number {
  revision = Date.now();
  return revision;
}

export function getLocalRevision(): number {
  return revision;
}

/**
 * v3.9.22 🔴 登录/注册/恢复会话时，**清空前**用它抓一份水位快照，存进**局部变量**。
 *
 * 踩的坑（本 bug 最后一道、也是最隐蔽的一道）：
 *   这些流程的第一步是 `resetAllLocalData()`（清空 React state，防上个账号残留闪现）。
 *   但持久化 effect 是 `useEffect(() => saveTasks("work", workTasks), [workTasks])` ——
 *   **state 一空，下一帧就把 `[]` 写进磁盘**。
 *   于是等 `handleLogin` 慢吞吞地解密完服务器数据、再回头看水位时，
 *   桌宠刚记的那条**连同它自己的水位痕迹一起没了**：
 *   就算后面对 `setWorkTasks(loadTasks("work"))`，读回来的也只是被抹干净的空列表。
 *   → 守卫还没来得及判断，证据就先被自己人销毁了。
 *
 * 所以顺序必须是：**先在内存里记下水位 → 再清**。
 * 用局部变量而不是模块级全局 —— 全局会被 register/logout 之间的陈旧值污染。
 */
export function snapshotWatermark(
  ...lists: Array<Array<{ updatedAt?: number }> | undefined>
): number {
  return Math.max(getLocalRevision(), itemsWatermark(...lists));
}

/**
 * v3.9.22 🔴 「认证流程进行中」闸门：这期间**不许把空数据写进磁盘**。
 *
 * 光记住水位还不够 —— 清空 state 引发的空写会**在 `await` 解密期间真的落到磁盘上**，
 * 把桌宠刚记的那条从磁盘上删掉。等守卫回过头 `loadTasks("work")` 想把它读回来，
 * 读到的已经是被自己人抹干净的空列表了 —— 记不记水位都没用。
 *
 * 语义上这也更对：**`resetAllLocalData()` 是"清掉界面上的旧账号残留"，不是"删用户数据"。**
 * 登出那种真要删的场景，`handleLogout` 自己会显式删键，不靠这个。
 */
let authTransitionDepth = 0;

export function beginAuthTransition(): void {
  authTransitionDepth += 1;
}

export function endAuthTransition(): void {
  authTransitionDepth = Math.max(0, authTransitionDepth - 1);
}

export function authTransitionActive(): boolean {
  return authTransitionDepth > 0;
}

/**
 * 登出时清掉本窗口的水位。
 * 不变量：**登出 = 本机没有需要保护的数据**。
 * 否则登出触发的空写会把水位顶到"现在"，重登同账号时又会被判成"本机更新"而留住空列表。
 */
export function resetLocalRevision(): void {
  revision = 0;
}

// ---------- 本机数据归属（防串号） ----------

/**
 * v3.9.22：本机这份数据**属于哪个账号**。
 *
 * "本机数据更新就留住本机、别被服务器旧数据盖掉"这类分支，
 * 只有在"本机数据确实是当前登录这个账号的"前提下才安全。不加这道判断会**串号**：
 * 上一个账号登出/会话过期后数据还留在盘上 → 换一个账号登录 →
 * 把上一账号的待办当成"本机更新的数据"留下来并上传到新账号。
 *
 * ⚠️ 认领规则（两处都要，缺一会让修复失效）：
 *   · 主窗口：登录/注册/恢复会话成功时认领，**且只在"本机数据的水位胜过服务器"时才认领**
 *     （否则新设备上会拦住服务器数据，见 App.tsx 的 handleLogin）
 *   · 桌宠窗口：**主动写数据时认领** —— 用户可能只开过桌宠没登录过主窗口，
 *     不认领的话它记的待办照样会被主窗口登录时当成"别人的数据"清掉，本 bug 原样复发
 */
const OWNER_KEY = "lighttodo:local-owner:v1";

/** 新手引导标记（每个用过的账号一个）—— 老装机没有归属键时，用它回溯判断"这台机器是谁在用" */
const ONBOARDED_PREFIX = "lighttodo:onboarded:v1:";

export function localDataOwner(): string | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
  if (stored) return stored;
  /**
   * 老装机回溯：v3.9.22 之前没有归属键，但"这台机器用过哪个账号"有痕迹 ——
   * 新手引导按账号留下了 `lighttodo:onboarded:v1:<用户名>`。
   * **恰好只有一个**时才认（两个以上说明换过账号，无法判断 → 返回 null 走安全路径）。
   * 登出的兜底清扫会删掉这些键，所以换账号后这里自然失效，不会串号。
   */
  try {
    const names = new Set<string>();
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ONBOARDED_PREFIX)) names.add(k.slice(ONBOARDED_PREFIX.length));
    }
    return names.size === 1 ? [...names][0] : null;
  } catch {
    return null;
  }
}

/**
 * v3.9.23：**只读**的归属判断 —— 先在 localStorage 里找，找不到再看桩值。
 *
 * 桌面版里 localStorage **就是权威**（两个窗口共用一份）。
 * 「桩值」只用在 localStorage 读不到的场景（被禁用、或以后 E2EE 密钥改成不落盘的方案）。
 */
let ownerStub: string | null = null;

export function effectiveOwner(): string | null {
  return localDataOwner() ?? ownerStub;
}

export function localOwnedBy(username: string): boolean {
  return effectiveOwner() === username;
}

export function claimLocalData(username: string): void {
  ownerStub = username;
  try {
    localStorage.setItem(OWNER_KEY, username);
  } catch {
    /* 隐私模式等，忽略：effectiveOwner() 会用桩值兜底 */
  }
}

export type ExternalWriteListener = () => void;

const listeners = new Set<ExternalWriteListener>();

/**
 * 订阅「另一个窗口改了任务/备忘」。
 *
 * 走 `window.storage` 事件 —— **同一 partition 的不同窗口之间会互相通知**
 * （已实测确认；同窗口自己写的不会触发，所以不存在自激循环）。
 * 之前只有桌宠窗听、主窗口不听，是这次数据被抹掉的另一半原因。
 */
export function subscribeExternalWrite(fn: ExternalWriteListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const WATCHED_KEYS = [
  "lighttodo:work:v1",
  "lighttodo:personal:v1",
  "lighttodo:work-memos:v1",
  "lighttodo:personal-memos:v1",
  // v3.9.23：维度/目标也进了本机存档，另一个窗口改了同样要立刻重读
  "lighttodo:work-dimensions:v1",
  "lighttodo:personal-dimensions:v1",
  "lighttodo:work-goals:v1",
  "lighttodo:personal-goals:v1",
];

let watching = false;

/** 装一次全局监听：任何被监视的键被别的窗口改动 → 逐个通知订阅者 */
export function ensureExternalWriteWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("storage", (e) => {
    if (e.key && !WATCHED_KEYS.includes(e.key)) return;
    for (const fn of Array.from(listeners)) fn();
  });
}

/**
 * 从一份已解密的数据里算出"它最后一次被改动"的时间。
 *
 * ⚠️ **只看条目自己的 `updatedAt`，不看信封上的 `updatedAt`**：
 * 信封那个字段由 `collectAppData()` 每次采集时刷成"现在"，**每次同步都会前进** ——
 * 拿它当水位的话，本机永远显得比服务器新，服务器数据就再也同步不进来了（多端同步会静默失效）。
 * 只有在"两边一条数据都没有"时（比如把待办全删光了）才退回用信封时间。
 */
export function dataWatermark(
  data: {
    updatedAt?: number;
    workTasks?: Array<{ updatedAt?: number }>;
    workMemos?: Array<{ updatedAt?: number }>;
    personalTasks?: Array<{ updatedAt?: number }>;
    personalMemos?: Array<{ updatedAt?: number }>;
  } | null,
): number {
  if (!data) return 0;
  const itemMax = itemsWatermark(data.workTasks, data.workMemos, data.personalTasks, data.personalMemos);
  if (itemMax > 0) return itemMax;
  return typeof data.updatedAt === "number" ? data.updatedAt : 0;
}

/**
 * v3.9.23：刻意为空的「已删除任务墓碑」。
 *
 * 背景：v3.9.23 给个人空间加本机存档后，删除立刻从磁盘消失、水位抬不动，
 * 于是「本机有更新的数据就留住本机」那个判据会**判成"本机不比服务器新"**，
 * 把刚从服务器拉下来的旧列表铺回来 —— **删掉的任务会复活**。
 *
 * 现在每次删除都往磁盘写一条墓碑（含删除时刻），水位自然被抬高；
 * 这个时间戳同时用来把更早的服务器数据挡在外面。
 * 墓碑里**不存任务内容**（隐私安全），只在用户主动清空已完成时跟任务一起清掉。
 */
export const TOMBSTONE_MARKER = "__deleted";

export interface Tombstone {
  id: string;
  updatedAt: number;
  [TOMBSTONE_MARKER]: true;
}

export function makeTombstone(id: string, at: number): Tombstone {
  return { id, updatedAt: at, [TOMBSTONE_MARKER]: true };
}

/** 一组条目里最新的 `updatedAt`（没有条目返回 0） */
export function itemsWatermark(...lists: Array<Array<{ updatedAt?: number }> | undefined>): number {
  let max = 0;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const t = item && typeof item.updatedAt === "number" ? item.updatedAt : 0;
      if (t > max) max = t;
    }
  }
  return max;
}
