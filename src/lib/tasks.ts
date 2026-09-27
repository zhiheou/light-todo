import type { Mode, RepeatFreq, RepeatRule, Task, ViewFilter, SortMode } from "../types";
import { nextOccurrence, toDateString } from "./repeat";
import type { Tombstone } from "./syncLock";
import { authTransitionActive, bumpLocalRevision, makeTombstone, TOMBSTONE_MARKER } from "./syncLock";

const WORK_KEY = "lighttodo:work:v1";
const PERSONAL_KEY = "lighttodo:personal:v1";

function keyFor(mode: Mode): string {
  return mode === "work" ? WORK_KEY : PERSONAL_KEY;
}

export function makeTask(partial: Partial<Task> = {}): Task {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "",
    notes: "",
    priority: 3,
    dueDate: "",
    dueTime: "",
    remindAt: "",
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function seedTasks(mode: Mode, now: Date): Task[] {
  void now; // 引导任务不设日期（绝不逾期）；保留签名兼容 loadTasks 调用
  const base = {
    notes: "",
    completed: false,
    dueDate: "",
    dueTime: "",
    remindAt: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (mode === "work") {
    // v3.8 E：新用户引导任务——全无日期、绝不逾期，边玩边学会用桌宠与建待办
    return [
      { ...base, id: crypto.randomUUID(), title: "试试右击我 → 说说话 / 玩动作", priority: 4 as const },
      { ...base, id: crypto.randomUUID(), title: "左键拖住我用力甩甩看 🚀", priority: 4 as const },
      { ...base, id: crypto.randomUUID(), title: "点我聊天，试试「明天下午4点开会」", priority: 4 as const },
    ];
  }

  // 个人空间：纯生活引导，无日期不逾期（v3.8 E）
  return [
    { ...base, id: crypto.randomUUID(), title: "这是你的个人空间 🏠", priority: 4 as const },
    { ...base, id: crypto.randomUUID(), title: "点右上角 + 建第一条待办", priority: 4 as const },
  ];
}

/**
 * 从磁盘读任务（**不碰**墓碑）。
 *
 * v3.9.23：工作空间的磁盘格式是 `{ tasks, tombstones }`，也兼容老的纯数组格式。
 * **增量同步用这个**，不要用 loadTasks —— loadTasks 是给"新建空间"用的，会把墓碑烧进去。
 */
function readTasksOnly(key: string): Task[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Task[] | { tasks?: unknown };
    const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
    return Array.isArray(list) ? normalizeTasks(list) : [];
  } catch {
    return [];
  }
}

/**
 * v3.9.23：删除墓碑 —— 见 syncLock.ts 的 makeTombstone。
 *
 * 为什么需要：删除之后新版数据里**没有这条任务了**，水位（取各条 updatedAt 的最大值）
 * 抬不动。于是「本机有更新的数据就留住本机」的判据会判成"本机不比服务器新"，
 * 把刚从服务器拉下来的旧列表整份铺回来 —— **删掉的任务复活**。
 * 墓碑记下"这个 id 在此刻被删"，自己就把水位抬起来了，
 * 同时把"删除时刻之前"的服务器数据挡在外面。
 *
 * 它不是只活在内存里的：跟着任务列表一起写盘（`tombstones` 字段），
 * 所以**关掉窗口再打开，删除也不会被服务器那份带回来**。
 * **不存任务内容**（隐私安全）；用户主动清空已完成时跟任务一起清掉。
 *
 * 生命周期（三段，缺一段都会漏）：
 *   ① 记下：`noteTaskDeleted` 往内存表里塞一条
 *   ② 写盘：`saveTasks` 把整表和任务一起写下去，然后**清空内存表**
 *   ③ 回收：某次拉取里服务器数据已经晚于墓碑（说明这次删除已经进了服务器）
 *          → `clearTombstones` 连磁盘那份一起清掉
 * 跨窗口靠"读盘时重新吸收"（`absorbTombstones`）接上 —— 所以磁盘那份**不能**
 * 被本窗口的旧快照压回去，见 saveTasks 里的说明。
 */
const tombstones: Partial<Record<Mode, Tombstone[]>> = {};

/**
 * 从磁盘把墓碑读进内存。
 *
 * 两个窗口共用一份 localStorage：桌宠删掉一条 → 主窗口据此知道"这条是被删的"，
 * 30 秒后拉取时才能把服务器那份里同样的旧条目挡掉。
 */
function absorbTombstones(mode: Mode, key: string): void {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Task[] | { tombstones?: Tombstone[] };
    if (Array.isArray(parsed)) return; // 老格式：没有墓碑
    const stored = parsed?.tombstones;
    if (!Array.isArray(stored) || stored.length === 0) return;
    const merged = tombstones[mode] ?? [];
    for (const t of stored) {
      if (!t || !t[TOMBSTONE_MARKER] || typeof t.id !== "string") continue;
      if (!merged.some((x) => x.id === t.id && x.updatedAt === t.updatedAt)) merged.push(t);
    }
    tombstones[mode] = merged;
  } catch {
    /* 读不到就算了 */
  }
}

/** 本窗口最近一次任务写盘的内容 —— 用于"没变就别写"，防两个窗口互相写回旧值 */
const lastWritten: Partial<Record<Mode, string>> = {};

/**
 * v3.9.23：内容变了才抬水位。
 *
 * 写得完全一样（比如另一个窗口改了、本窗口把同样的内容写回去）不算"本机动过"——
 * 抬了水位会让服务器的合理更新再也进不来。
 * 读不到旧值（首次写盘）时按"变了"处理：磁盘上的现状无从比较，保守一点。
 */
function bumpIfChanged(key: string, json: string): void {
  try {
    if (localStorage.getItem(key) === json) return;
  } catch {
    /* 读不到 → 当作变了 */
  }
  bumpLocalRevision();
}

/** 记一条"这个任务在此刻被删了"。下一次写盘时随任务列表一起落盘。 */
export function noteTaskDeleted(mode: Mode, id: string, at = Date.now()): void {
  const list = tombstones[mode] ?? [];
  list.push(makeTombstone(id, at));
  tombstones[mode] = list;
}

/** 读任务，并把磁盘上的墓碑一并吸收进内存（不烧掉，见 loadTasks 的说明） */
export function loadTasks(mode: Mode, _now = new Date()): Task[] {
  absorbTombstones(mode, keyFor(mode));
  return readTasksOnly(keyFor(mode));
}

/**
 * v3.9.23：读任务但**连吸收都不做**。
 *
 * 给"读一眼就走"的路径用（算水位、算提醒）。语义上和 loadTasks 一样不烧墓碑，
 * 单独留个名字是为了让调用处一眼看出：这里只是看看，不是加载。
 */
export function loadTasksNoTombstoneBurn(mode: Mode): Task[] {
  return readTasksOnly(keyFor(mode));
}

/**
 * v3.9.23 🔴 本机删过哪些任务（含删除时刻）—— 内存 + 磁盘合起来看。
 *
 * 「留住本机」那条分支上，光把本机列表铺回去还不够：
 * 服务器那份里可能还有**本机刚删掉**的那条，得用墓碑把它剔出去。
 */
export function diskTombstones(mode: Mode): Tombstone[] {
  const out: Tombstone[] = [...(tombstones[mode] ?? [])];
  try {
    const raw = localStorage.getItem(keyFor(mode));
    if (!raw) return out;
    const parsed = JSON.parse(raw) as { tombstones?: Tombstone[] } | Task[];
    const stored = Array.isArray(parsed) ? [] : parsed.tombstones ?? [];
    for (const t of stored) {
      if (!t || !t[TOMBSTONE_MARKER] || typeof t.id !== "string") continue;
      if (!out.some((x) => x.id === t.id && x.updatedAt === t.updatedAt)) out.push(t);
    }
  } catch {
    /* 读不到就用内存那份 */
  }
  return out;
}

/** 墓碑里的最新时刻（没有墓碑返回 0）—— 判断"服务器数据晚于墓碑"用 */
export function tombstoneWatermark(mode: Mode): number {
  let max = 0;
  for (const t of diskTombstones(mode)) if (t.updatedAt > max) max = t.updatedAt;
  return max;
}

/**
 * v3.9.23 🔴 本机数据为新时，把本机改动并进服务器那份。
 *
 * 直接 `setTasks(local)` 会**丢掉服务器上本机没有的东西**（另一台设备新加的），
 * 而且刚在这台机器上删掉的任务会从服务器那份里**复活**。
 * 所以按条目合并：
 *   · 谁新听谁的（比 `updatedAt`），条目相同则保留服务器那份（省得无谓抬水位）
 *   · 本机墓碑挡住的，一律不要 —— 那是用户明确删掉的
 *
 * 用于登录/恢复会话的「留住本机」分支（见 App.tsx 的 handleLogin）。
 */
export function mergeLocalIntoRemote(
  mode: Mode,
  local: Task[],
  remote: Task[],
): Task[] {
  const graves = diskTombstones(mode);
  const localById = new Map(local.map((t) => [t.id, t]));
  const merged: Task[] = [];
  for (const item of remote) {
    const mine = localById.get(item.id);
    if (mine) {
      // 本机删过 → 别复活；两边都一样新 → 留服务器那份
      if (graves.some((g) => g.id === item.id && g.updatedAt >= item.updatedAt)) continue;
      merged.push((mine.updatedAt ?? 0) > (item.updatedAt ?? 0) ? mine : item);
    } else if (graves.some((g) => g.id === item.id)) {
      continue;
    } else {
      merged.push(item);
    }
  }
  // 服务器没有、本机有 → 本机新加的，带上
  for (const t of local) {
    if (!merged.some((x) => x.id === t.id)) merged.push(t);
  }
  return merged;
}

export function legacyPersonalTasks(): Task[] | null {
  const raw = localStorage.getItem(PERSONAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Task[];
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

const REPEAT_FREQS: RepeatFreq[] = ["daily", "weekday", "weekly", "monthly", "interval"];

// 归一化单条任务：兜底脏数据、校验 repeat 合法性。所有任务数据入口都要过一遍。
export function normalizeTask(raw: unknown): Task {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Task>;
  const task: Task = {
    id: typeof t.id === "string" ? t.id : crypto.randomUUID(),
    title: typeof t.title === "string" ? t.title : "",
    notes: typeof t.notes === "string" ? t.notes : "",
    priority: t.priority === 1 || t.priority === 2 || t.priority === 3 || t.priority === 4 ? t.priority : 3,
    dueDate: typeof t.dueDate === "string" ? t.dueDate : "",
    dueTime: typeof t.dueTime === "string" ? t.dueTime : "",
    remindAt: typeof t.remindAt === "string" ? t.remindAt : "",
    completed: Boolean(t.completed),
    completedAt: typeof t.completedAt === "number" ? t.completedAt : undefined,
    // v3.9.22：updatedAt 必须原样保留 —— 它是"这条最后被改于何时"的水位线，
    // 用作拉取覆盖判据（见 lib/syncLock.ts）。若在这里刷成 Date.now()，
    // 每次读取都会把水位抬高，旧数据反而会盖掉新数据。
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
  };
  const r = t.repeat;
  if (r && typeof r === "object" && REPEAT_FREQS.includes(r.freq)) {
    const rule: RepeatRule = {
      freq: r.freq,
      interval: typeof r.interval === "number" && r.interval >= 1 ? Math.floor(r.interval) : 1,
    };
    if (typeof r.weekday === "number") {
      const wd = Math.floor(r.weekday);
      if (wd >= 0 && wd <= 6) rule.weekday = wd;
    }
    if (typeof r.dayOfMonth === "number") {
      const dm = Math.floor(r.dayOfMonth);
      if (dm >= 1 && dm <= 31) rule.dayOfMonth = dm;
    }
    task.repeat = rule;
  }
  task.memoId = typeof t.memoId === "string" ? t.memoId : undefined;
  task.dimensionId = typeof t.dimensionId === "string" ? t.dimensionId : undefined;
  task.goalId = typeof t.goalId === "string" ? t.goalId : undefined;
  return task;
}

export function normalizeTasks(list: unknown[]): Task[] {
  return Array.isArray(list) ? list.map(normalizeTask) : [];
}

// 生成循环任务的下一实例。只在"未完成→完成"时调用。
// 规则：dueDate 按规则前进到严格晚于今天；提醒偏移沿用旧实例"截止-提醒"间隔（无则默认提前10分钟）。
export function nextTaskInstance(task: Task, now: Date): Task | null {
  if (!task.repeat) return null;
  const anchor = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = nextOccurrence(task.repeat, anchor, now);
  const dueDate = toDateString(due);

  // 提醒偏移：沿用旧实例"截止 - 提醒"间隔；非法/无提醒时默认提前 10 分钟
  let lead = 10 * 60 * 1000;
  if (task.remindAt && task.dueDate) {
    const oldDue = new Date(`${task.dueDate}T${task.dueTime || "09:00"}:00`);
    const diff = oldDue.getTime() - new Date(task.remindAt).getTime();
    if (diff > 0) lead = diff;
  }
  let remindAt = "";
  if (task.dueTime) {
    const at = new Date(`${dueDate}T${task.dueTime}:00`);
    remindAt = new Date(at.getTime() - lead).toISOString();
  }

  return makeTask({
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    dueDate,
    dueTime: task.dueTime,
    remindAt,
    repeat: task.repeat,
    memoId: task.memoId,
    completed: false,
  });
}

// 勾选完成切换。仅在 未完成→完成 方向为循环任务生成下一实例（spawned 插入列表顶部）。
export function toggleCompleted(
  tasks: Task[],
  id: string,
  now: Date,
): { tasks: Task[]; spawned: Task | null } {
  let spawned: Task | null = null;
  const next = tasks.map((task) => {
    if (task.id !== id) return task;
    const wasDone = task.completed;
    if (!wasDone && task.repeat) spawned = nextTaskInstance(task, now);
    return {
      ...task,
      completed: !wasDone,
      // 完成时记录完成时间；取消完成时清除，避免旧时间残留
      completedAt: !wasDone ? now.getTime() : undefined,
      updatedAt: now.getTime(),
    };
  });
  if (spawned) next.unshift(spawned);
  return { tasks: next, spawned };
}

/**
 * v3.9.23：撤销刚才那次删除 —— 把 `at` 这个时刻的墓碑撤掉。
 *
 * 只撤**同一时刻**那一条（`id` + `updatedAt` 都对得上），
 * 免得把"更早删过一次、后来又删"的记录一起抹掉。
 * 撤销后跟着的 `saveTasks` 会把"任务回来了"这件事写盘 ——
 * 内容变了、水位自然也抬得动，不怕被服务器旧数据盖回去。
 */
export function undoTaskDeleted(mode: Mode, id: string, at: number): void {
  const list = tombstones[mode];
  if (list) {
    tombstones[mode] = list.filter((t) => !(t.id === id && t.updatedAt === at));
  }
  // 磁盘上那份也要撤：写盘是异步的（React 状态更新后触发），此刻墓碑可能已经落盘了
  try {
    const key = keyFor(mode);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { tasks?: Task[]; tombstones?: Tombstone[] } | Task[];
    if (Array.isArray(parsed)) return;
    const stored = parsed.tombstones;
    if (!Array.isArray(stored)) return;
    const kept = stored.filter((t) => !(t && t.id === id && t.updatedAt === at));
    if (kept.length === stored.length) return;
    localStorage.setItem(key, JSON.stringify({ tasks: parsed.tasks ?? [], tombstones: kept }));
  } catch {
    /* 读不到就算了：内存那份已撤，下次写盘就干净了 */
  }
}

export function saveTasks(mode: Mode, tasks: Task[]): void {
  const key = keyFor(mode);
  const tombstonesNow = tombstones[mode] ?? [];
  const json = JSON.stringify(
    tombstonesNow.length > 0 ? { tasks, tombstones: tombstonesNow } : tasks,
  );
  // 首次写盘时，拿**磁盘上的现状**当基准：
  // 挂载时"把刚读出来的东西原样写回去"不是改动，不能抬高水位。
  // 否则主窗口一启动水位就是"现在"，服务器数据再也同步不进来（多端同步会静默失效）。
  const prev = lastWritten[mode] !== undefined ? lastWritten[mode] : localStorage.getItem(key);
  /**
   * v3.9.22 🔴 登录/注册/恢复会话期间的写盘一律不落盘。
   * 那些流程开头会 `resetAllLocalData()` 清空 state，持久化 effect 随即把空列表写下来 ——
   * 那是"清界面残留"，**不是用户删数据**。真写下去就会把桌宠刚记的待办从磁盘删掉，
   * 等守卫回头 `loadTasks()` 想读回来时已经晚了（详见 syncLock.ts 的 beginAuthTransition）。
   *
   * ⚠️ 必须在**更新 `lastWritten` 之前**返回：否则这次被拦下的写会被记成"已经写过"，
   * 关闸后真正的写反而被去重逻辑当成重复而跳过 —— 磁盘会永远停在旧值上。
   * ⚠️ v3.9.23：墓碑也**一起留着**，等关闸后随真正的写落盘。
   */
  if (authTransitionActive()) return;
  lastWritten[mode] = json;
  /**
   * v3.9.23：写盘成功就烧掉这一批墓碑 —— 它们已经**身为数据**出去了。
   *
   * 光靠 push 同步永远赢不了：主窗口从磁盘读到的旧快照就是带着墓碑的，
   * 下一次它自己写盘（比如你在主窗口点了一下别的）就把旧墓碑原样压回来，
   * 谁也没变 → 那次真删除永远进不了服务器，30 秒后任务复活。
   * 现在每次写盘都是一份"清空 + 重新吸收"的最新快照，两边不会互相压回旧值。
   *
   * ⚠️ 必须在 `lastWritten` 之后、`setItem` 之前清：清了内存表不等于数据丢了，
   * 马上要写下去的 json 里就含着这一批。
   */
  tombstones[mode] = [];
  // 内容没变就到此为止 —— 否则「另一个窗口改了 → 本窗口重读 → 又写回去」会无限对写
  if (prev === json) return;
  /**
   * v3.9.23 🔴 水位**只在这里登记**（原来是散在界面各个按钮里的，漏一个就丢数据）。
   * 写盘 = 本机动过 = 水位抬高，服务器的旧数据才盖不回来。
   */
  bumpIfChanged(key, json);
  localStorage.setItem(key, json);
}

/**
 * v3.9.23：墓碑用完了，连磁盘那份一起清掉。
 *
 * ⚠️ 只有**服务器数据已经晚于墓碑**时才该调（见 App 拉取逻辑）——
 * 那证明这次删除已经安全地进了服务器，再留着它只会挡住合法的旧数据。
 * 别处（比如清空已完成）不要随手调，会把还没上传的删除凭据毁掉。
 *
 * 只清墓碑、不写盘 —— 但会**重写一次 lastWritten**，让紧随其后的 `saveTasks`
 * 认得出"内容变了"，把新的（没有墓碑的）列表真正写下去。
 */
export function clearTombstones(mode: Mode): void {
  tombstones[mode] = [];
  const key = keyFor(mode);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { tasks?: unknown; tombstones?: unknown } | Task[];
    const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
    if (!Array.isArray(list)) return;
    const cleaned = JSON.stringify(normalizeTasks(list));
    localStorage.setItem(key, cleaned);
    lastWritten[mode] = cleaned;
  } catch {
    /* 读不到就算了：内存那份已清，下次写盘自然是干净的 */
  }
}

/**
 * 从 localStorage 读回任务（跨窗口同步用）。
 * 只在**另一个窗口**改动过时才会返回新内容，同窗口自己写的返回 null（防止自激）。
 *
 * v3.9.23：磁盘格式可能是 `{ tasks, tombstones }`（有墓碑时），要能读出来；
 * 同时把对方窗口的墓碑灌进本窗口内存 —— 「本机删掉的别被服务器复活」靠它跨窗口生效。
 */
export function loadTasksIfChanged(mode: Mode): Task[] | null {
  const key = keyFor(mode);
  const raw = localStorage.getItem(key);
  if (raw === null || raw === lastWritten[mode]) return null;
  try {
    const parsed = JSON.parse(raw) as Task[] | { tasks?: unknown };
    const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
    if (!Array.isArray(list)) return null;
    absorbTombstones(mode, key);
    return normalizeTasks(list);
  } catch {
    return null;
  }
}

/**
 * v3.9.23：这个任务是否在 `at` **之后**被本机删过。
 *
 * 用途：本机水位高于服务器数据时，把任务列表并进服务器那份时，
 * 用墓碑把"删除时刻之前"的旧任务挡掉 —— 否则它会被原样带回来。
 */
export function isTombstoned(mode: Mode, id: string, at: number): boolean {
  const list = tombstones[mode];
  if (!list || list.length === 0) return false;
  return list.some((t) => t.id === id && t.updatedAt >= at);
}

/** 磁盘上的墓碑时刻（跨窗口可见：桌宠删的、主窗口也能据此挡回来） */
export function deletedAt(mode: Mode, id: string): number {
  let max = 0;
  for (const t of tombstones[mode] ?? []) {
    if (t.id === id && t.updatedAt > max) max = t.updatedAt;
  }
  try {
    const raw = localStorage.getItem(keyFor(mode));
    if (!raw) return max;
    const parsed = JSON.parse(raw) as { tombstones?: Tombstone[] } | Task[];
    const stored = Array.isArray(parsed) ? [] : parsed.tombstones ?? [];
    for (const t of stored) {
      if (t && t[TOMBSTONE_MARKER] && t.id === id && typeof t.updatedAt === "number" && t.updatedAt > max) {
        max = t.updatedAt;
      }
    }
  } catch {
    /* 读不到就算了，返回内存里那份 */
  }
  return max;
}

export function isOverdue(task: Task, now: Date): boolean {
  if (task.completed || !task.dueDate) return false;
  const due = new Date(`${task.dueDate}T${task.dueTime || "23:59"}:59`);
  return due.getTime() < now.getTime();
}

// 是否在今天完成（按 completedAt 所在自然日判断）
export function isCompletedToday(task: Task, now: Date): boolean {
  if (!task.completed || typeof task.completedAt !== "number") return false;
  return toDateString(new Date(task.completedAt)) === toDateString(now);
}

export function filterTasks(
  tasks: Task[],
  view: ViewFilter,
  search: string,
  now: Date,
  opts?: { showCompleted?: boolean },
): Task[] {
  const query = search.trim().toLowerCase();
  const filtered = tasks.filter((task) => {
    if (query) {
      const haystack = `${task.title} ${task.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (view === "done") return task.completed;
    if (task.completed) return !!opts?.showCompleted;
    if (view === "today") {
      return isOverdue(task, now) || task.dueDate === toDateString(now);
    }
    return true;
  });
  return filtered;
}

function dueKey(task: Task): string {
  return `${task.dueDate || "9999-12-31"}T${task.dueTime || "23:59"}`;
}

export function sortTasks(tasks: Task[], sortMode: SortMode): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (sortMode === "due") {
      return (
        dueKey(a).localeCompare(dueKey(b)) ||
        a.priority - b.priority ||
        b.createdAt - a.createdAt
      );
    }
    return (
      a.priority - b.priority ||
      dueKey(a).localeCompare(dueKey(b)) ||
      b.createdAt - a.createdAt
    );
  });
}

export function formatDue(task: Task, now: Date): string {
  if (!task.dueDate) return "";
  const today = toDateString(now);
  const tomorrow = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const [, m, d] = task.dueDate.split("-").map(Number);
  const dateLabel =
    task.dueDate === today
      ? "今天"
      : task.dueDate === tomorrow
        ? "明天"
        : `${m}月${d}日`;
  return task.dueTime ? `${dateLabel} ${task.dueTime}` : dateLabel;
}

// 完成时间标签：「完成于 今天 09:30」/「完成于 昨天 21:00」/「完成于 8月31日」
export function formatCompletedAt(task: Task, now: Date): string {
  if (!task.completed || typeof task.completedAt !== "number") return "";
  const at = new Date(task.completedAt);
  const atKey = toDateString(at);
  const today = toDateString(now);
  const yesterday = toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const dateLabel =
    atKey === today ? "今天" : atKey === yesterday ? "昨天" : `${at.getMonth() + 1}月${at.getDate()}日`;
  return `${dateLabel} ${time}`;
}
