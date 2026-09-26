// 账号会话持久化。
//
// 存储介质：**localStorage + 时间戳**，不用 sessionStorage。
// 为什么改（v3.9.4 踩的坑）：桌面版有两个窗口（主窗口 + 桌宠窗口），
// sessionStorage 是**每个标签页/窗口各自独立**的 —— 用户在主窗口登录后，
// 桌宠窗口读不到会话，于是永远认为自己没登录 → 主窗口一收起，屏幕上就一只桌宠都没有。
// localStorage 按"源 + 分区"共享（两个窗口同源同 partition），这才是我们要的。
//
// 但原语义是"关掉标签页后需重新登录"（sessionStorage 天然如此），
// 换 localStorage 后要自己实现：记写入时间，超过 TTL 就算过期。
// 网页 12 小时（大致"这次使用"）；桌面版 30 天（用户要"打开就是桌宠"）。
//
// 存储内容：用户名 + 密码 + keySalt。E2EE 下解密 workspace 需要密码派生密钥，
// 所以密码必须保存；配合 HttpOnly cookie（服务器 30 天会话）实现免登录。
const KEY = "lighttodo:account:v1";
const REVALIDATED_KEY = "lighttodo:account-revalidated:v1";

/** 普通网页：会话有效期 12 小时 */
const TTL_MS = 12 * 60 * 60 * 1000;
/** 桌面版：30 天（与服务器会话 cookie 对齐） */
const TTL_DESKTOP_MS = 30 * 24 * 60 * 60 * 1000;

export interface StoredSession {
  username: string;
  password: string;
  keySalt: string;
  /** 写入时间戳（毫秒）。老数据没有此字段 → 视作过期，让用户重新登录一次 */
  savedAt?: number;
}

function isDesktop(): boolean {
  try {
    return !!(window as unknown as { petAPI?: { isDesktop?: boolean } }).petAPI?.isDesktop;
  } catch {
    return false;
  }
}

function ttl(): number {
  return isDesktop() ? TTL_DESKTOP_MS : TTL_MS;
}

/** 会话是否在有效期内 */
function isFresh(s: StoredSession): boolean {
  if (typeof s.savedAt !== "number") return false; // 老格式，无法判断 → 重新登录
  return Date.now() - s.savedAt < ttl();
}

// v3.9.2 perf：本次窗口内已完整校验过（PBKDF2+解密成功），刷新时跳过完整校验、直接用缓存密钥出首屏
// 这个标记仍用 sessionStorage —— 它天然是"本次窗口"语义，正合适
export function wasSessionRevalidated(username: string): boolean {
  try {
    return sessionStorage.getItem(REVALIDATED_KEY) === username;
  } catch {
    return false;
  }
}

export function markSessionRevalidated(username: string): void {
  try {
    sessionStorage.setItem(REVALIDATED_KEY, username);
  } catch {
    // ignore
  }
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.keySalt !== "string"
    ) {
      return null;
    }
    if (!isFresh(parsed)) {
      localStorage.removeItem(KEY); // 过期即清，要求重新登录
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: Omit<StoredSession, "savedAt">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    // localStorage 满/禁用时静默失败，仅影响刷新免登录
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(REVALIDATED_KEY);
  } catch {
    // ignore
  }
}

// fetch 型网络错误（TypeError，无响应）→ true；HTTP 401/409 等业务错误 → false
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
