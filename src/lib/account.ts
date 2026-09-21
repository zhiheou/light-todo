import type { AppData } from "../types";

const ITERATIONS = 150_000;

export interface WorkspacePayload {
  iv: string;
  data: string;
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

// v3.9.2 perf：同一 (password,keySalt) 只派生一次密钥。PBKDF2 150k 是首屏最大单点耗时，
// 30s 轮询/自动保存每次都会重新派生；CryptoKey 不可导出（extractable=false），缓存它不降低安全性。
//
// 安全纪律（v3.9.2 加固，防跨账号串号）：
//  - 缓存键必须含**账号**（username），不能只靠 password+keySalt —— 否则同名/换账号时会误命中
//  - **登出/切账号必须调 clearKeyCache()**，绝不留上一个账号的密钥在内存里
const keyCache = new Map<string, CryptoKey>();
let lastKey: { account: string; password: string; keySalt: string; key: CryptoKey } | null = null;

/** 登出/切账号时调用：清空密钥缓存，杜绝"用上个账号的密钥解密本账号密文" */
export function clearKeyCache(): void {
  keyCache.clear();
  lastKey = null;
}

async function deriveKey(password: string, keySalt: string, account = ""): Promise<CryptoKey> {
  // 缓存键含 account：避免"同一浏览器换账号后误命中上个账号的密钥"
  const cacheKey = `${account}${keySalt}${password}`;
  const hit = keyCache.get(cacheKey);
  if (hit) return hit;
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBytes(keySalt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  if (keyCache.size > 4) keyCache.clear(); // 上限，防内存膨胀（登出仍会主动清）
  keyCache.set(cacheKey, key);
  lastKey = { account, password, keySalt, key };
  return key;
}

export function newKeySalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export async function encryptAppData(
  data: AppData,
  password: string,
  keySalt: string,
  account = "",
): Promise<WorkspacePayload> {
  const key = await deriveKey(password, keySalt, account);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

export async function decryptAppData(
  payload: WorkspacePayload,
  password: string,
  keySalt: string,
  account = "",
): Promise<AppData | null> {
  // v3.9.2 perf：刷新/恢复会话时先用上次缓存的密钥立即解密首屏，PBKDF2 校验推迟到后台。
  // 安全性不变：解密成功即证明密码正确（AES-GCM 认证失败会抛错）；后台 deriveKey 真错时仍做完整校验。
  // 安全加固：必须同时匹配 account，防"换账号后误用上个账号的密钥"。
  if (lastKey && lastKey.account === account && lastKey.password === password && lastKey.keySalt === keySalt) {
    return decryptWithKey(payload, lastKey.key);
  }
  const key = await deriveKey(password, keySalt, account);
  return decryptWithKey(payload, key);
}

/** 解不开（密码/盐不同）返回 null，交给调用方回退到完整 PBKDF2 派生 */
export async function decryptAppDataFast(
  payload: WorkspacePayload,
  password: string,
  keySalt: string,
  account = "",
): Promise<AppData | null> {
  if (
    !lastKey ||
    lastKey.account !== account ||
    lastKey.password !== password ||
    lastKey.keySalt !== keySalt
  ) {
    return null;
  }
  return decryptWithKey(payload, lastKey.key);
}

async function decryptWithKey(payload: WorkspacePayload, key: CryptoKey): Promise<AppData | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as AppData;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let message = `请求失败：HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export interface RegisterPayload extends WorkspacePayload {
  keySalt: string;
}

export async function registerAccount(
  username: string,
  password: string,
  payload: RegisterPayload,
): Promise<{ username: string }> {
  return request("/register", {
    method: "POST",
    body: JSON.stringify({ username, password, ...payload }),
  });
}

export async function loginAccount(
  username: string,
  password: string,
): Promise<{ keySalt: string }> {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutAccount(): Promise<void> {
  await request("/logout", { method: "POST", body: "{}" });
}

export async function fetchWorkspace(): Promise<{
  keySalt: string;
  iv: string | null;
  data: string | null;
} | null> {
  return request("/workspace");
}

export async function saveWorkspace(payload: WorkspacePayload): Promise<void> {
  await request("/workspace", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
