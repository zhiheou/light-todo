export interface SyncConfig {
  url: string;
  username: string;
  password: string;
}

const STORAGE_KEY = "lighttodo:sync:v1";

export function getSyncConfig(): SyncConfig | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncConfig;
  } catch {
    return null;
  }
}

export function setSyncConfig(config: SyncConfig): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function authHeader(config: SyncConfig): string {
  return `Basic ${btoa(`${config.username}:${config.password}`)}`;
}

export async function pushSync(config: SyncConfig, body: string): Promise<void> {
  const response = await fetch(config.url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/octet-stream",
    },
    body,
  });
  if (!response.ok) throw new Error(`上传失败：HTTP ${response.status}`);
}

export async function pullSync(config: SyncConfig): Promise<string> {
  const response = await fetch(config.url, {
    method: "GET",
    headers: {
      Authorization: authHeader(config),
      Accept: "application/octet-stream",
    },
  });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  return response.text();
}
