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
 * 带重试：桌面版冷启动时页面可能先于主进程 IPC 监听就绪。
 * 主进程只认第一次回报，重复调用无害。
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
 * 本机是否有可用登录态（同步判断，用于首帧快速回报）。
 * 注意：只代表"存过会话"，真实有效性由后续网络校验决定；
 * 因此登录失败/登出时 App 会再回报一次 false。
 */
export function hasStoredSession(): boolean {
  return getStoredSession() !== null;
}
