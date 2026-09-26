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
  moveWindow: (dx: number, dy: number) => void;
  openMainWindow: () => void;
  closeMainWindow: () => void;
  setPetSize: (px: number) => void;
  reportLogin: (loggedIn: boolean) => void;
  setHitbox?: (r: { x: number; y: number; w: number; h: number } | null) => void;
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
  // 合并成一个包围盒（矩形并集）
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of hitAreas.values()) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  const merged = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  const key = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;
  if (key === lastSent) return; // 没变就不发
  lastSent = key;
  api.setHitbox(merged);
}

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

/** 通知主进程聊天面板开/关（打开时窗口需放大，否则面板被裁掉） */
export function reportChatOpen(open: boolean): void {
  petAPI()?.setChatOpen?.(open);
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
