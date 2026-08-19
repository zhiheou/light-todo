// 账号会话持久化。策略：刷新免登录（sessionStorage），关闭标签页后需重新登录。
// 存储内容：用户名 + 密码 + keySalt。E2EE 下解密 workspace 需要密码派生密钥，
// 所以密码必须保存；配合 HttpOnly cookie（服务器 30 天会话）实现刷新免登录。
const KEY = "lighttodo:account:v1";

export interface StoredSession {
  username: string;
  password: string;
  keySalt: string;
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.keySalt !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // sessionStorage 满/禁用时静默失败，仅影响刷新免登录
  }
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// fetch 型网络错误（TypeError，无响应）→ true；HTTP 401/409 等业务错误 → false
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
