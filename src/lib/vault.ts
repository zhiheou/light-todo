import type { VaultData } from "../types";
import { legacyPersonalTasks, seedTasks } from "./tasks";
import { legacyPersonalMemos, seedMemos } from "./memos";

const STORAGE_KEY = "lighttodo:vault:v1";
const LEGACY_TASK_KEY = "lighttodo:personal:v1";
const LEGACY_MEMO_KEY = "lighttodo:personal-memos:v1";
const ITERATIONS = 150_000;

interface VaultRecord {
  salt: string;
  iv: string;
  data: string;
}

let currentKey: CryptoKey | null = null;

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

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plain: string, key: CryptoKey): Promise<{ iv: string; data: string }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

async function decrypt(record: VaultRecord, key: CryptoKey): Promise<VaultData> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as VaultData;
}

function readRecord(): VaultRecord | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultRecord;
  } catch {
    return null;
  }
}

function writeRecord(record: VaultRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function hasVault(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function initialPersonalData(): VaultData {
  const now = new Date();
  return {
    tasks: legacyPersonalTasks() ?? seedTasks("personal", now),
    memos: legacyPersonalMemos() ?? seedMemos("personal"),
  };
}

export async function createVault(pin: string, data: VaultData): Promise<void> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await deriveKey(pin, salt);
  const encrypted = await encrypt(JSON.stringify(data), key);
  writeRecord({ salt: bytesToBase64(salt), ...encrypted });
  currentKey = key;
  localStorage.removeItem(LEGACY_TASK_KEY);
  localStorage.removeItem(LEGACY_MEMO_KEY);
}

export async function unlockVault(pin: string): Promise<VaultData | null> {
  const record = readRecord();
  if (!record) return null;
  const key = await deriveKey(pin, base64ToBytes(record.salt));
  try {
    const data = await decrypt(record, key);
    currentKey = key;
    return data;
  } catch {
    currentKey = null;
    return null;
  }
}

export async function saveVault(data: VaultData): Promise<void> {
  if (!currentKey) throw new Error("vault is locked");
  const record = readRecord();
  if (!record) throw new Error("vault record missing");
  const encrypted = await encrypt(JSON.stringify(data), currentKey);
  writeRecord({ salt: record.salt, ...encrypted });
}

export function lockVault(): void {
  currentKey = null;
}

export function vaultRecord(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function importVaultRecord(record: string): boolean {
  try {
    const parsed = JSON.parse(record) as VaultRecord;
    if (
      typeof parsed.salt !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.data !== "string"
    ) {
      return false;
    }
    currentKey = null;
    writeRecord(parsed);
    return true;
  } catch {
    return false;
  }
}
