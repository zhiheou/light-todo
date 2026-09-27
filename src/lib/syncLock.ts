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
