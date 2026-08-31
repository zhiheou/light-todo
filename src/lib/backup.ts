import type { Dimension, Goal, Memo, Task } from "../types";

export interface BackupFile {
  app: "light-todo";
  version: 1 | 2;
  exportedAt: number;
  work: { tasks: Task[]; memos: Memo[] };
  /** v2+：维度与目标；v1 备份缺省 */
  workDimensions?: Dimension[];
  workGoals?: Goal[];
  personalDimensions?: Dimension[];
  personalGoals?: Goal[];
  /**
   * 旧版个人空间 vault 密文（PIN 派生密钥）。账号体系下个人数据走 workspace，
   * 不再写入 vault；personalRecord 恒传 null（旧备份的该字段导入时忽略）。
   */
  personal: { salt: string; iv: string; data: string } | null;
}

export function exportBackup(
  workTasks: Task[],
  workMemos: Memo[],
  personalRecord: string | null,
  extra?: {
    workDimensions?: Dimension[];
    workGoals?: Goal[];
    personalDimensions?: Dimension[];
    personalGoals?: Goal[];
  },
): string {
  const payload: BackupFile = {
    app: "light-todo",
    version: 2,
    exportedAt: Date.now(),
    work: { tasks: workTasks, memos: workMemos },
    personal: personalRecord ? (JSON.parse(personalRecord) as BackupFile["personal"]) : null,
    ...(extra?.workDimensions?.length ? { workDimensions: extra.workDimensions } : {}),
    ...(extra?.workGoals?.length ? { workGoals: extra.workGoals } : {}),
    ...(extra?.personalDimensions?.length ? { personalDimensions: extra.personalDimensions } : {}),
    ...(extra?.personalGoals?.length ? { personalGoals: extra.personalGoals } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackup(text: string): BackupFile | null {
  try {
    const parsed = JSON.parse(text) as BackupFile;
    if (
      parsed.app !== "light-todo" ||
      (parsed.version !== 1 && parsed.version !== 2) ||
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
