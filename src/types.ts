export type Mode = "work" | "personal";
export type ViewFilter = "today" | "all" | "done" | "notes" | "review" | "calendar" | "goals";
export type SortMode = "priority" | "due";
export type Priority = 1 | 2 | 3 | 4;
/** 今日页展示形态 */
export type TodayMode = "list" | "dimension" | "timeline" | "schedule";

/** v3.5 遗留：仅指聊天/暂停用"短时刻"（持续 ≤5s）。v3.6 起长期表情由 PetExpressionId 取代。 */
export type MascotMood = "idle" | "happy" | "thinking" | "reminding" | "listening";

/* ================= v3.6 吉祥物「轻宜」Pet 类型 ================= */

export type PetBodyShape = "ball" | "egg" | "blob" | "cloud";
export type PetCoatKey =
  | "teal"
  | "amber"
  | "azure"
  | "coral"
  | "violet"
  | "rose"
  | "graphite"
  | "midnight";
export type PetSizeKey = "s" | "m" | "l";
/** free=桌面自由拖拽 / bottom=移动端底部停靠 / corner=右下角(默认) */
export type PetPosition = "free" | "bottom" | "corner";
export type PetBehaviorFlag =
  | "breathe"
  | "blink"
  | "look"
  | "drift"
  | "idleActs"
  | "draggable"
  | "follow";

export interface PetSkin {
  shape: PetBodyShape;
  coat: PetCoatKey;
  size: PetSizeKey;
  position: PetPosition;
  behaviors: PetBehaviorFlag[];
}

/** 桌面自由拖拽后停靠位置（px，clamp 视口内）；仅 free 模式使用 */
export interface PetDock {
  x: number;
  y: number;
}

/** 表情分段 */
export type PetCategory = "life" | "emotion" | "work";

/** 眼睛形态 id */
export type PetEyeStyle =
  | "round"        // 圆眼
  | "happyArc"     // 弯眼 ^
  | "sleepLine"    // 闭线
  | "sadArc"       // 难过弧
  | "cryArc"       // 哭闭(带泪)
  | "closed"       // 完全闭
  | "squint"       // 眯
  | "openBig"      // 圆睁大
  | "dot"          // 小点
  | "heart"        // 心形
  | "star"         // 星星
  | "winkL" | "winkR" // 单眼眨
  | "half"         // 半闭(疲惫)
  | "tense"        // 怒/紧
  | "cross"        // X 眼
  | "blank"        // 呆滞无光
  | "zzz";         // 睡死(眼全无)

export type PetMouthId =
  | "smile"
  | "open"
  | "wow"
  | "oh"
  | "flat"
  | "frown"
  | "grim"
  | "wavy"
  | "cry"
  | "smirk"
  | "grimace"
  | "line"
  | "kiss"
  | "tongue"
  | "annoyed"
  | "teeth";

export interface PetEyeSpec {
  style: PetEyeStyle;
  /** 瞳孔/虹膜缩放 0.4..1.4 */
  irisScale?: number;
  /** 归一注视偏移 -1..1（引擎还会叠 hover gaze） */
  look?: { dx: number; dy: number };
  /** false = 不参与随机眨眼（sleep/closed 等） */
  blinkMask?: boolean;
}

export interface PetMouthSpec {
  kind: PetMouthId;
  /** 嘴缩放 */
  scale?: number;
}

/** 叠加物/特效元素 */
export interface PetExtras {
  blush?: boolean;
  sweat?: boolean;
  exclaim?: boolean;   // 头顶 !
  crossMark?: boolean; // 头顶 ×
  stars?: number;      // 星星数
  heart?: boolean;
  /** 特效层 id */
  fx?: "orbit" | "zzz" | "confetti" | "sparkle" | "typeDots";
}

/** 一次性动作关键帧（供引擎按时间播放） */
export interface PetMotion {
  /** t 为 0..1 的归一进度；插值 body 缩放/位移/旋转 */
  keyframes?: Array<{ t: number; x?: number; y?: number; sx?: number; sy?: number; rotate?: number }>;
  loop?: boolean;
  /** 播一次后回到 idle（默认 true） */
  once?: boolean;
  /** 每拍时长 ms（默认 100） */
  tick?: number;
}

/** 数据驱动的表情定义（渲染/状态机只认 id） */
export interface PetExpressionDef {
  id: string;
  category: PetCategory;
  nameZh: string;
  nameEn: string;
  eyes: PetEyeSpec;
  mouth: PetMouthSpec;
  extras?: PetExtras;
  motion?: PetMotion;
  /** 头部倾角（度） */
  tilt?: number;
  /** 是否唤醒后回到 idle（sleep/wake 等用） */
  settleIdle?: boolean;
}

export type PetExpressionId = PetExpressionDef["id"];

/** 引擎一帧输出（AvatarV2 渲染唯一输入） */
export interface PetFrame {
  /** 当前主导表情 */
  expr: PetExpressionId;
  /** 身体路径（极坐标或覆盖层） */
  bodyPath: string;
  /** 身体横向缩放（squash 用） */
  squashX: number;
  squashY: number;
  /** 旋转（度） */
  rotate: number;
  /** 位移偏移（拖动中） */
  dy: number;
  eyes: PetEyeSpec;
  /** 眨眼闭合度 0..1（1=闭） */
  blink: number;
  mouth: PetMouthSpec;
  extras: PetExtras | null;
  /** 一次性动作进度 0..1（播完回 idle） */
  actT: number | null;
  ts: number;
}

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
