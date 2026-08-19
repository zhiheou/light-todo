// 本机访问码（藏私门锁）：只锁 UI，不参与数据加密。
// 个人空间数据权威源是账号 workspace；访问码仅决定「本机进入个人空间要不要输码」。
// 存储只落 PIN 的 PBKDF2 摘要（salt + hash），不存明文，纯本地（不随账号同步）。

const STORAGE_KEY = "lighttodo:personal-lock:v1";
const ITERATIONS = 150_000;

interface LockRecord {
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

function readRecord(): LockRecord | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LockRecord;
    if (typeof parsed.salt !== "string" || typeof parsed.hash !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasPersonalLock(): boolean {
  return readRecord() !== null;
}

export async function savePersonalLock(pin: string): Promise<void> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await deriveHash(pin, salt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ salt: bytesToBase64(salt), hash }));
}

export async function verifyPersonalLock(pin: string): Promise<boolean> {
  const record = readRecord();
  if (!record) return false;
  const hash = await deriveHash(pin, base64ToBytes(record.salt));
  return hash === record.hash;
}

export function clearPersonalLock(): void {
  localStorage.removeItem(STORAGE_KEY);
}
