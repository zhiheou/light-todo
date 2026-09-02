export type Mode = "work" | "personal";
export type ViewFilter = "today" | "all" | "done" | "notes" | "review" | "calendar" | "goals";
export type SortMode = "priority" | "due";
export type Priority = 1 | 2 | 3 | 4;
/** 今日页展示形态 */
export type TodayMode = "list" | "dimension" | "timeline" | "schedule";
/** 吉祥物情绪态 */
export type MascotMood = "idle" | "happy" | "thinking" | "reminding" | "listening";

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
  /** 可选；关联维度（同空间）。维度卡分组用。旧数据/旧备份天然兼容 */
  dimensionId?: string;
  /** 可选；关联目标（同空间）。目标页进度用。旧数据/旧备份天然兼容 */
  goalId?: string;
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

/** 维度：任务分类挂载点（如工作/健康/学习/生活）。维度在空间内各自独立 */
export interface Dimension {
  id: string;
  name: string;
  /** 维度卡片/进度条配色 key（coral/teal/amber/violet/rose 等，缺省取默认色） */
  color: string;
  sortOrder: number;
  createdAt: number;
}

/** 目标周期：年 / 月 / 周 */
export type GoalPeriod = "year" | "month" | "week";

export interface Goal {
  id: string;
  title: string;
  period: GoalPeriod;
  /** 周期锚点：year → "YYYY"；month → "YYYY-MM"；week → 该周周一 "YYYY-MM-DD" */
  anchor: string;
  /** 进度：关联任务已完成的绝对/比例（由任务 completed 推导；任务无 dueDate 时手动标记也算） */
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** 主题外观偏好（本地持久化，不随账号同步） */
export interface ThemePrefs {
  /** 强调色主题 key */
  accent: "purple" | "graphite" | "mistBlue" | "sageGreen";
  /** 字体 key */
  font: "kai" | "sans" | "song" | "noto";
  /** 卡片风格 */
  cardStyle: "classic" | "plain" | "colorful";
  /** 字号档位 */
  fontSize: "small" | "standard" | "large" | "extraLarge";
}

export interface AppData {
  workTasks: Task[];
  workMemos: Memo[];
  personalTasks: Task[];
  personalMemos: Memo[];
  /** 新增可空字段：老数据/老备份缺省 → normalize 兜底为空数组 */
  workDimensions?: Dimension[];
  workGoals?: Goal[];
  personalDimensions?: Dimension[];
  personalGoals?: Goal[];
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
