export type Mode = "work" | "personal";
export type ViewFilter = "today" | "all" | "done" | "notes" | "review";
export type SortMode = "priority" | "due";
export type Priority = 1 | 2 | 3 | 4;

export type RepeatFreq = "daily" | "weekday" | "weekly" | "monthly" | "interval";

export interface RepeatRule {
  freq: RepeatFreq;
  /** freq === "interval" 时生效：每隔 N 天；其余恒为 1 */
  interval: number;
  /** freq === "weekly" 时生效：0=周日 … 6=周六；缺省=沿用基准日星期 */
  weekday?: number;
  /** freq === "monthly" 时生效：1-31；缺省=沿用基准日号 */
  dayOfMonth?: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  dueTime: string;
  remindAt: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  /** 可选；最近一次完成时间（仅完成时写入）。旧数据/旧备份天然兼容 */
  completedAt?: number;
  /** 可选；undefined = 不循环。旧数据/旧备份天然兼容 */
  repeat?: RepeatRule;
  /** 可选；关联一条备忘（同空间）。备忘端不存反链，运行时反查。旧数据/旧备份天然兼容 */
  memoId?: string;
}

export interface Memo {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** 可选；标签数组，去重后按添加序存储。旧数据/旧备份天然兼容 */
  tags?: string[];
}

export interface VaultData {
  tasks: Task[];
  memos: Memo[];
}

export interface AppData {
  workTasks: Task[];
  workMemos: Memo[];
  personalTasks: Task[];
  personalMemos: Memo[];
  updatedAt: number;
}

export interface QuickAddParse {
  title: string;
  priority: Priority;
  dueDate: string;
  dueTime: string;
  remindAt: string;
  repeat: RepeatRule | null;
}
