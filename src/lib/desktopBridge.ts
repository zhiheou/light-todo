import { getStoredSession } from "./session";

/**
 * 桌面版（Electron）桥接：页面 ←→ 主进程
 *
 * 为什么要这层：桌面版主进程需要知道"用户登录了没"，才能决定
 *   - 已登录 → 直接显示桌宠（用户要的"打开就是桌宠"）
 *   - 未登录 → 弹出主窗口让用户登录（否则桌宠对着一个没数据的空壳）
 *
 * 所有调用都做存在性判断：网页版没有 window.petAPI，静默跳过。
 */
interface PetAPI {
  setIgnoreMouseEvents: (b: boolean) => void;
  setMouseTakeover?: (locked: boolean) => void;
  reportMouseHeld?: (held: boolean) => void;
  moveWindow: (dx: number, dy: number) => void;
  openMainWindow: () => void;
  quitApp?: () => void;
  closeMainWindow: () => void;
  setPetSize: (px: number) => void;
  reportLogin: (loggedIn: boolean) => void;
  setHitbox?: (r: HitRect[] | null) => void;
  setChatOpen?: (open: boolean) => void;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (on: boolean) => Promise<boolean>;
  isDesktop: boolean;
}

export function petAPI(): PetAPI | null {
  const api = (window as unknown as { petAPI?: PetAPI }).petAPI;
  return api && api.isDesktop ? api : null;
}

/** 是否运行在桌面版里 */
export function isDesktopApp(): boolean {
  return petAPI() !== null;
}

/**
 * 回报登录状态（主进程据此决定显示桌宠还是弹登录窗）。
 *
 * 主进程会响应**每一次**上报（不是只认第一次）—— 因为时序可能是
 * "乐观 true → 校验失败补 false"，也可能是"未登录 false → 登录成功 true"。
 * 带重试：桌面版冷启动时页面可能先于主进程 IPC 监听就绪。
 */
export function reportLoginState(loggedIn: boolean): void {
  const api = petAPI();
  if (!api?.reportLogin) return;
  const send = () => {
    try {
      api.reportLogin(loggedIn);
    } catch {
      /* 忽略 */
    }
  };
  send();
  window.setTimeout(send, 500);
  window.setTimeout(send, 1500);
}

/**
 * 可交互区域登记（v3.9.7 重做）。
 *
 * 桌面版桌宠窗是**铺满整屏的透明窗 + 鼠标穿透**，主进程靠"鼠标是否落在可交互矩形内"
 * 决定要不要接管鼠标。所以**任何能点的东西都必须登记进来**，漏一个就会"点了没反应"
 * （鼠标事件直接穿透到桌面上去了）。
 *
 * 踩过的坑：最初只登记了宠物本体 + 聊天面板两个来源，于是**右键菜单**（渲染在宠物
 * 之外的兄弟节点）漏掉了 → 用户反馈"动作设置隐藏回右下角全部都没法用，没有任何反应"。
 *
 * 现在的做法：改成**多来源登记 + 合并**。任何组件都能按 id 登记自己的矩形，
 * 宠物/面板/菜单/气泡各自登记，最终合并成一个并集上报给主进程。
 * 以后再加新的弹出层，只要调一次 registerHitArea 就不会重犯。
 */
type Rect = { x: number; y: number; w: number; h: number };

/** v3.9.14：主进程按这个格式接收"可交互矩形列表"（逐个精确判定，不合并包围盒） */
export type HitRect = Rect;

/** 已登记的可交互区域（key = 来源 id） */
const hitAreas = new Map<string, Rect>();
/** 有变化时上报一次（避免每次 pointermove 都发 IPC） */
let lastSent = "";

function flushHitAreas(): void {
  const api = petAPI();
  if (!api?.setHitbox) return;
  if (hitAreas.size === 0) {
    if (lastSent !== "none") {
      lastSent = "none";
      api.setHitbox(null);
    }
    return;
  }
  const list: HitRect[] = [...hitAreas.values()].map((r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h),
  }));
  /**
   * v3.9.14 🔴 兼容格式：**同一个对象里同时带包围盒和矩形列表**。
   *
   * 血泪教训（用户报"完全点不动、拖不动"的根因）：
   * 前端会自动更新（加载线上站点），但**桌面外壳（main.js）装在用户电脑上、不会自动更新**。
   * 我一度把这里改成只发**数组**，而用户装的旧外壳只认 `{x,y,w,h}` 对象 →
   * 它读到的是 undefined → hitbox 永远为空 → **永远穿透 → 完全点不动**。
   *
   * 所以协议必须**双向兼容**：
   *  - 顶层 x/y/w/h：旧外壳用（能跑，只是两矩形之间那片空白也会被接管）
   *  - rects 数组：新外壳优先用（逐个矩形精确判定，没有死区）
   *  - single 标记：告诉外壳"只有一个矩形，直接用包围盒即可"
   *
   * 以后**任何时候改这个协议，都必须保留旧字段**，否则老用户会立刻"点不动"。
   */
  const bbox = list.reduce(
    (acc, r) => ({
      x: Math.min(acc.x, r.x),
      y: Math.min(acc.y, r.y),
      w: Math.max(acc.x + acc.w, r.x + r.w) - Math.min(acc.x, r.x),
      h: Math.max(acc.y + acc.h, r.y + r.h) - Math.min(acc.y, r.y),
    }),
    { x: list[0].x, y: list[0].y, w: list[0].w, h: list[0].h },
  );
  const payload = {
    x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, // 旧外壳读这四个字段
    rects: list,                                 // 新外壳优先读这个
  };
  const key = list.map((r) => `${r.x},${r.y},${r.w},${r.h}`).sort().join("|");
  if (key === lastSent) return;
  lastSent = key;
  api.setHitbox(payload as unknown as HitRect[]);
}

/**
 * v3.9.13：上报"鼠标键是否按着"，并在按住期间强制主进程保持接管。
 *
 * 背景（用户反馈）："右键之后页面出来了，但里面的内容都没法点击，
 * 点击直接跳到页面下面的东西了"。
 * 根因：菜单项 pointerdown 即响应 → 菜单立刻消失 → 可点区域上报瞬间缩小 →
 * 主进程判定"鼠标不在可交互区" → **在用户松手前就把窗口设成穿透** →
 * mouseup 落到桌面 → 用户看到"点到了下面的东西"。
 *
 * 这里用 window 的 pointerdown/pointerup（捕获阶段，任何目标都能收到）跟踪按键状态：
 * 只要还有键按着就保持接管；全部松开后延迟 450ms 再解除，
 * 覆盖 click/mouseup/contextmenu 等后续事件，保证整个"按下-抬起"都发生在窗口内。
 */
export function startMouseHeldWatch(): void {
  if (typeof window === "undefined") return;
  const api = petAPI();
  if (!api?.reportMouseHeld) return;

  let releaseTimer: number | null = null;
  let lastSentHeld: boolean | null = null;
  /**
   * v3.9.21 指针事件最近一次汇报的状态（**是否认为鼠标键还按着**）。
   * 用途：鼠标事件兜底里判断"敢不敢用 buttons=0 去解除接管"——
   * 拖拽中如果我们认为还按着，就不能被一个过时的 buttons=0 误伤（会让拖拽当场断掉）。
   * 不能复用 lastSentHeld：那个表示"已上报给主进程的值"，会被去重逻辑滞后。
   */
  let dragLikeHeld = false;

  const sync = (held: boolean) => {
    if (held === lastSentHeld) return;
    lastSentHeld = held;
    try {
      api.reportMouseHeld?.(held);
    } catch {
      /* 忽略 */
    }
  };

  /**
   * v3.9.14 🔴 用 `e.buttons` 位掩码，不用 Set 记 `e.button`。
   *
   * 独立审查发现的真 bug：按 Pointer Events 规范，
   * `pointerdown` **只在第一个按键按下时**触发（后续按键只发 pointermove），
   * `pointerup` **只在最后一个按键释放时**触发，且 `e.button` 是"这一个"而不是"全部"。
   * 于是"按住左键 → 再按右键 → 先松左键 → 后松右键"会让集合里永远剩下一个键 →
   * `mouseHeld` 永久为 true → **整块屏幕都不再穿透**（桌面图标全点不动，只能重启程序）。
   *
   * `e.buttons` 是**当前所有按下键的位掩码**，天然规避顺序问题：
   * 只要它变成 0，就说明真的全松开了。
   */
  const onPointer = (e: PointerEvent) => {
    const held = (e.buttons ?? 0) !== 0;
    dragLikeHeld = held;
    if (held) {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      sync(true);
      return;
    }
    // 全部松开：延迟一小段再解除，覆盖 click / contextmenu 等后续事件
    if (releaseTimer !== null) window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      releaseTimer = null;
      sync(false);
    }, 450);
  };

  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("pointermove", onPointer, true); // 关键：多键时只有 move 事件能反映最新 buttons
  window.addEventListener("pointerup", onPointer, true);
  window.addEventListener("pointercancel", onPointer, true);

  /**
   * v3.9.21 🔴 独立于指针事件的兜底（Mac 上尤其关键）。
   *
   * 为什么要第二重监听：
   * 上面那几个 pointer 事件在**正常**情况下够用，但它们有一个共同的前提 ——
   * **事件能送到页面**。而桌宠窗是铺满整屏的透明窗，穿透由主进程轮询控制；
   * 拖拽中途一旦 pointer capture 丢失、或窗口被切回穿透，
   * 后续的 pointermove / pointerup **页面一个都收不到** → 页面停在旧状态上再也不更新。
   *
   * Windows 上这个洞被 `startMouseButtonWatcher()`（常驻 PowerShell 读系统按键）兜住了；
   * **Mac 上没有那个** → 只能靠页面自己，于是这个洞在 Mac 上必然踩中：
   * 用户表现就是「拖到一半拖不动了」。
   *
   * 这里挂一重**走不同派发链**的鼠标事件监听（`mousemove` / `mouseup`）：
   * 意义不在于"比 pointer 更准"，而在于**只要还有一条通道活着，状态就能恢复**。
   * 两者都读同一个 `e.buttons` 位掩码，互相纠偏。
   *
   * ⚠️ 只在"我们没有正在按着"的前提下才敢用鼠标事件去**解除**接管；
   * 报 true 时则无条件采纳（那一定是在救"按着却以为松了"的状态）。
   * 反之会误伤：拖拽中窗口刚被接管、页面开始收到 mousemove 时，
   * 若拿一个过时的 buttons=0 去解除，拖拽会当场断掉。
   */
  const onMouseFallback = (e: MouseEvent) => {
    if ((e.buttons ?? 0) !== 0) {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer);
        releaseTimer = null;
      }
      dragLikeHeld = false;
      sync(true);
    } else if (!dragLikeHeld) {
      onPointer(e as unknown as PointerEvent);
    }
  };
  window.addEventListener("mousemove", onMouseFallback, true);
  window.addEventListener("mouseup", onMouseFallback, true);

  // 兜底：窗口失焦时强制清空（避免按键状态卡住导致永远接管）
  window.addEventListener("blur", () => {
    if (releaseTimer !== null) {
      window.clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    dragLikeHeld = false;
    sync(false);
  });
}

/**
 * v3.9.17 🔴 通用兜底：把页面上**所有可见的浮层**自动登记为可点击区域。
 *
 * 为什么做这个（血泪教训）：桌面版桌宠窗铺满整屏 + 鼠标穿透，**任何能点的东西
 * 都必须登记**，漏一个就"点了没反应、点到桌面去了"。而这个"漏登记"已经犯了 4 次：
 *   ① 右键菜单 `.pet-menu`      ② 召回按钮 `.pet-summon`
 *   ③ 聊天面板 `.mascot-panel`  ④ 动作与设置面板 `.pet-config`
 * 每次都是用户报上来才补。所以改成**自动扫描**：
 * 任何带这些类名的元素一出现就被登记，不用再靠人记得加。
 *
 * 实现：用 MutationObserver 监听 DOM 变化 + 定时兜底扫描，
 * 把所有匹配的可见元素的位置合并登记到 "auto-layers" 这一个来源下。
 * 手动登记的（宠物/菜单/面板）仍然保留，两者取并集。
 */
const AUTO_LAYER_SELECTORS = [
  ".pet-config", // 动作与设置面板（形态馆/皮肤/行为）
  /**
   * v3.9.20 🔴 补 `.pet-config-overlay`（设置面板的全屏蒙层）。
   *
   * 这是**同类事故第 5 次**：蒙层铺满全屏、点击它应该关闭设置面板，
   * 但它没被登记 → 点击直接穿到桌面（蒙层不关、面板挂着、还选中了桌面图标）。
   * 用户视角就是"点了没反应 + 点到底下的东西"。
   */
  ".pet-config-overlay",
  ".pet-menu", // 桌宠右键菜单
  ".pet-summon", // 召回按钮
  ".mascot-panel", // 聊天面板
  ".mascot-bubble", // 聊天/提醒气泡
  ".pet-microtip", // 灵动小字气泡
  ".pet-saved-hint", // "已保存"提示（压在宠物角上）
  ".pet-config-tip", // 设置面板里的说明气泡
  ".pet-skin-panel", // 皮肤面板
  ".ability-panel", // 助手能力设置面板
  ".ability-learn-hint", // 学习记录提示
];

export function startAutoHitAreaScan(): void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;

  const scan = () => {
    const rects: Rect[] = [];
    for (const sel of AUTO_LAYER_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          rects.push({ x: r.x, y: r.y, w: r.width, h: r.height });
        }
      });
    }
    if (rects.length === 0) {
      registerHitArea("auto-layers", null);
      return;
    }
    // 合并成一个包围盒（这些浮层通常挨在一起；分开登记会让主进程要处理很多矩形）
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const r of rects) {
      x1 = Math.min(x1, r.x);
      y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w);
      y2 = Math.max(y2, r.y + r.h);
    }
    registerHitArea("auto-layers", { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  };

  // 1) DOM 变化时扫描（面板开/关、菜单弹出等）
  try {
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
  } catch {
    /* 忽略 */
  }
  // 2) 定时兜底（有些变化不触发 MutationObserver，比如 CSS 动画/位置变化）
  window.setInterval(scan, 500);
  scan();
}

/**
 * 定时重发当前的可点区域（保险机制）。
 *
 * 为什么需要：主进程靠"页面上报的矩形"判定要不要接管鼠标，而上报只在**变化时**才发。
 * 如果判定停在旧值（比如拖动结束后），会出现"明明点在按钮上却穿透"。
 * 定时重发（1.5s 一次）把这种状态自动纠正回来。
 */
export function startHitAreaHeartbeat(): void {
  if (typeof window === "undefined") return;
  const tick = () => {
    if (hitAreas.size === 0) return; // 没有可点区域就不用发
    lastSent = ""; // 强制下一次 flush 真的发出去
    flushHitAreas();
  };
  window.setInterval(tick, 1500);
}

/**
 * 拖动/飞行期间"钉住"鼠标接管状态。
 *
 * 为什么需要：拖拽依赖 pointer capture，而 pointer capture 的前提是**窗口处于接管状态**。
 * 一旦中途被设成穿透，capture 立即失效 → 后续 pointermove/pointerup 全部收不到 →
 * **拖动断在半路**（用户表现："拖不动"、"点一下宠物直接跳到左上角"）。
 * 拖动开始时钉住、结束时释放，中途任何判定都不会把它关掉，从而彻底杜绝断线。
 */
export function setMouseTakeover(locked: boolean): void {
  petAPI()?.setMouseTakeover?.(locked);
}

/**
 * 某个点是否落在"可点区域"内（页面侧与主进程共用同一判定源）。
 *
 * v3.9.12：桌面版必须用它来判断"鼠标在不在宠物/菜单/面板上"，
 * 而**不能**像旧代码那样只看 event.target 是不是 .pet-shell
 * —— 旧写法在拖动时会误判（指针捕获后 target 一直是被捕获的元素），
 * 导致拖动中途把鼠标设成穿透、拖拽立刻断掉，后续点击也全部落空。
 */

/**
 * 登记 / 更新一个可交互区域。传 null 表示该来源当前不存在（例如菜单已关闭）。
 * @param id 来源标识，如 "pet" / "panel" / "menu"
 */
export function registerHitArea(id: string, rect: Rect | null): void {
  if (!rect || rect.w <= 0 || rect.h <= 0) hitAreas.delete(id);
  else hitAreas.set(id, rect);
  flushHitAreas();
}

/** 清空登记（例如宠物被隐藏、整个界面都不可交互时） */
export function clearHitAreas(): void {
  hitAreas.clear();
  flushHitAreas();
}

/**
 * 某个点是否落在任一已登记的可交互矩形内。
 *
 * v3.9.14：与主进程的判定逻辑保持一致（主进程也是逐个矩形判断，**不合并包围盒**）。
 * 用于测试与页面侧的调试；主进程有自己的等价实现（desktop/main.js 的 startPetHoverWatch）。
 */
export function isPointInHitAreas(x: number, y: number): boolean {
  for (const r of hitAreas.values()) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

/** 通知主进程聊天面板开/关（打开时窗口需放大，否则面板被裁掉） */
export function reportChatOpen(open: boolean): void {
  petAPI()?.setChatOpen?.(open);
}

/** 桌面版：把主界面窗口叫回来（主窗口关掉后只剩桌宠时的入口） */
export function openMainWindow(): void {
  petAPI()?.openMainWindow?.();
}

/** 桌面版：彻底退出整个程序（桌宠 + 窗口一起关） */
export function quitApp(): void {
  petAPI()?.quitApp?.();
}

/**
 * 本机是否有可用登录态（同步判断，用于首帧快速回报）。
 * 桌面版两个窗口（主窗口 / 桌宠窗口）同源同 partition，
 * 会话存在 localStorage 里 → **两边都能读到**（这是 v3.9.4 修的关键点：
 * 之前用 sessionStorage，桌宠窗口读不到主窗口写的会话，导致登录后桌宠不出现）。
 */
export function hasStoredSession(): boolean {
  return getStoredSession() !== null;
}
