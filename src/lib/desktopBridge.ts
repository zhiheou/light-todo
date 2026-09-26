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

/** 登录完成后收起主窗口（只留桌宠）——仅桌面版有主窗口 */
export function collapseMainWindow(): void {
  petAPI()?.closeMainWindow();
}

/**
 * 上报"可交互区域"（宠物本体 + 打开的聊天面板），让主进程精确判定鼠标命中。
 *
 * 为什么需要：主进程默认把**整个窗口矩形**当作命中区，而窗口 = 宠物 + 56px 透明留白，
 * 于是宠物周围那圈虽然看不见，却会抢走鼠标（点桌面图标点不中）。
 * 上报真实矩形后，那圈恢复穿透。
 */
export function reportInteractiveRect(
  rect: { x: number; y: number; w: number; h: number } | null,
): void {
  petAPI()?.setHitbox?.(rect);
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
