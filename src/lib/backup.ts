import type { Memo, Task } from "../types";

interface BackupFile {
  app: "light-todo";
  version: 1;
  exportedAt: number;
  work: { tasks: Task[]; memos: Memo[] };
  personal: { salt: string; iv: string; data: string } | null;
}

export function exportBackup(
  workTasks: Task[],
  workMemos: Memo[],
  personalRecord: string | null,
): string {
  const payload: BackupFile = {
    app: "light-todo",
    version: 1,
    exportedAt: Date.now(),
    work: { tasks: workTasks, memos: workMemos },
    personal: personalRecord ? (JSON.parse(personalRecord) as BackupFile["personal"]) : null,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackup(text: string): BackupFile | null {
  try {
    const parsed = JSON.parse(text) as BackupFile;
    if (
      parsed.app !== "light-todo" ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.work?.tasks) ||
      !Array.isArray(parsed.work?.memos)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
