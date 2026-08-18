export type Mode = "work" | "personal";
export type ViewFilter = "today" | "all" | "done" | "notes" | "review";
export type SortMode = "priority" | "due";
export type Priority = 1 | 2 | 3 | 4;

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
}

export interface Memo {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
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
}
