// 访问码（藏私门锁）：只锁 UI，不参与数据加密。
// 个人空间数据权威源是账号 workspace；访问码仅决定「进入个人空间要不要输码」。
//
// v3.9.24 🔴 从「只在本机」改成「跟着账号走」：
//   老版本只往 localStorage 存一份，**换个设备就得重设一个**（用户 2026-09-27 报的）。
//   现在真正的存放处是账号加密数据里的 `personalLock` 字段 —— 它跟着账号走到每台设备。
//
//   ⚠️ 但两条路都要留着：
//     ① 本机那份（localStorage）＝ 换账号时的兜底；
//        因为「访问码属于哪个账号」这件事本身也得存下来，否则同一台电脑上换个账号会互相串码。
//     ② 首次升级时把本机旧码**迁移**进账号里 —— 老用户升级后不用重设，直接接着用。

const STORAGE_KEY = "lighttodo:personal-lock:v1";
const ITERATIONS = 150_000;

interface LockRecord {
  salt: string;
  hash: string;
}

/** 账号数据里存的那份：salt + hash，不含明文 */
export interface StoredLock {
  salt: string;
  hash: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveHash(pin: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function readEnvelope(): { owner?: string; lock?: LockRecord } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LockRecord | { owner?: string; lock?: LockRecord };
    if (!parsed || typeof parsed !== "object") return null;
    /**
     * ⚠️ 这里必须**兼容升级前的旧格式**。
     *
     * 旧版本直接存 `{ salt, hash }`，没有 owner 外壳。要是只认新格式，
     * 老用户升级后这份码会被当成脏数据丢掉 → **又得重设一个**，
     * 正好是这次要修的那个毛病。（这条是测试抓出来的，不是我想到的。）
     */
    if (typeof (parsed as LockRecord).salt === "string" && typeof (parsed as LockRecord).hash === "string") {
      return { owner: "", lock: parsed as LockRecord };
    }
    return parsed as { owner?: string; lock?: LockRecord };
  } catch {
    return null;
  }
}

/**
 * 本机这份访问码**属于哪个账号**。
 *
 * 为什么需要：同一台电脑换个账号登录时，不能把上一个账号的访问码当成自己的 ——
 * 否则新账号会莫名其妙要求输入一个别人的码。
 * 返回 `""` 表示"这份码是升级前留下的旧记录，还不知道属于谁"（会被当成可以迁移的遗产）。
 */
export function localLockOwner(): string {
  const env = readEnvelope();
  if (!env) return "";
  return typeof env.owner === "string" ? env.owner : "";
}

function isValidLock(lock: LockRecord | undefined | null): lock is LockRecord {
  return !!lock && typeof lock.salt === "string" && typeof lock.hash === "string";
}

/** 本机记录的访问码（不管属于谁）—— 只在"迁移旧码"时用 */
export function localLock(): StoredLock | null {
  const lock = readEnvelope()?.lock;
  return isValidLock(lock) ? { salt: lock.salt, hash: lock.hash } : null;
}

/** 把本机记录的 owner 补上（迁移完成后调用，防止被重复迁移到别的账号） */
export function claimLocalLock(owner: string): void {
  const env = readEnvelope();
  if (!env || !isValidLock(env.lock)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, lock: env.lock }));
}

/** 本机存的这份访问码是不是**当前账号**的 */
export function localLockMatches(account: string): boolean {
  return localLockOwner() === account && localLock() !== null;
}

/** 校验一串 PIN 是否匹配某个 salt+hash 记录 */
export async function verifyLockAgainst(pin: string, lock: StoredLock): Promise<boolean> {
  const hash = await deriveHash(pin, base64ToBytes(lock.salt));
  return hash === lock.hash;
}

/** 生成一份新的访问码记录（不落盘，交给调用方决定存哪） */
export async function buildLock(pin: string): Promise<StoredLock> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await deriveHash(pin, salt);
  return { salt: bytesToBase64(salt), hash };
}

/** 把访问码记到本机，并标注它属于哪个账号 */
export function writeLocalLock(lock: StoredLock, account: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: account, lock }));
}

export function clearPersonalLock(): void {
  localStorage.removeItem(STORAGE_KEY);
}
