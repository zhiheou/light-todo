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

async function deriveKey(password: string, keySalt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBytes(keySalt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
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
): Promise<WorkspacePayload> {
  const key = await deriveKey(password, keySalt);
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
): Promise<AppData | null> {
  try {
    const key = await deriveKey(password, keySalt);
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
