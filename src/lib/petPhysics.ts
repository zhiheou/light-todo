/**
 * petPhysics：桌宠甩飞/反弹的轻量纯函数物理。
 *
 * 设计：
 * - `flingVelocity(trail)`：从拖拽轨迹估出释放瞬间速度（90ms 滑窗）。
 * - `stepPhysics(state, dt, bounds)`：积分 + 重力 + 撞边弹性 + 过冲回拉。
 * 全部纯函数、输入输出裸数据，便于单测。飞行循环放在 PetShell（直写 DOM）。
 */

export interface TrailSample {
  t: number; // performance.now()
  x: number;
  y: number;
}

export interface Fling {
  vx: number;
  vy: number;
  fast: boolean;
}

/** 甩飞最小速度（px/s）—— 鼠标快速一甩约 700-1200px/s */
const FLING_MIN = 700;

/** 重力（px/s²）—— 有重力它才会落到底边停住，更"宠物" */
const GRAVITY = 320;
/** 撞边弹性（侧墙 vs 地面分开：地面多吸能，落地更快"尘埃落定"） */
const REST_X = 0.62;
const REST_Y = 0.42;
/** 停机阈值（px/s） */
const STOP_SPEED = 30;
/** 撞墙过冲后回拉的弹簧系数 */
const OVERSHOOT_GAIN = 0.9;
/** 每帧最小/最大 dt（防切后台跳变） */
export const DT_MAX = 0.033;

/** 用最近 ~90ms 的轨迹估释放速度；轨迹稀疏时回退到首尾两段 */
export function flingVelocity(trail: TrailSample[]): Fling {
  if (trail.length < 2) return { vx: 0, vy: 0, fast: false };
  const now = trail[trail.length - 1];
  // 从尾部往回找，覆盖约 90ms
  let i = trail.length - 1;
  while (i > 0 && now.t - trail[i - 1].t < 90) i--;
  let past = trail[i];
  let dtMs = now.t - past.t;
  // 时间窗太短（浏览器合并了 pointermove）→ 用最后两个采样
  if (dtMs < 16 && trail.length >= 3) {
    past = trail[trail.length - 2];
    dtMs = now.t - past.t;
  }
  const dt = Math.max(dtMs / 1000, 1e-3);
  const vx = (now.x - past.x) / dt;
  const vy = (now.y - past.y) / dt;
  return { vx, vy, fast: Math.hypot(vx, vy) > FLING_MIN };
}

export interface PhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type HitAxis = "x" | "y" | "both" | null;

export interface StepResult {
  state: PhysicsState;
  hit: HitAxis;
  /** 是否该停机（速度足够小，回落到静止） */
  settled: boolean;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 弹一次：积分 + 重力 + 撞边（弹性反弹 + 允许轻微过冲再由外层 squash 表现） */
export function stepPhysics(
  s: PhysicsState,
  dt: number,
  b: Bounds,
): StepResult {
  const dtc = Math.min(dt, DT_MAX);
  let { x, y, vx, vy } = s;
  vy += GRAVITY * dtc;
  // 空气摩擦：轻微衰减水平速度，避免甩飞后"横穿不停、看起来自己往右滑"
  vx *= 1 - 0.012 * (dtc * 60);
  x += vx * dtc;
  y += vy * dtc;

  let hit: HitAxis = null;
  // 撞边：反向并乘弹性；位置按 OVERSHOOT 轻微越过（视觉过冲）
  if (x < b.minX) {
    x = b.minX + (b.minX - x) * OVERSHOOT_GAIN;
    vx = Math.abs(vx) * REST_X;
    hit = "x";
  } else if (x > b.maxX) {
    x = b.maxX - (x - b.maxX) * OVERSHOOT_GAIN;
    vx = -Math.abs(vx) * REST_X;
    hit = "x";
  }
  if (y < b.minY) {
    y = b.minY + (b.minY - y) * OVERSHOOT_GAIN;
    vy = Math.abs(vy) * REST_Y;
    hit = hit === "x" ? "both" : "y";
  } else if (y > b.maxY) {
    // 落地：垂直多衰减 + 给水平摩擦，让它滑一小段就停
    y = b.maxY;
    vy = -Math.abs(vy) * REST_Y;
    vx *= 0.72; // 地面摩擦
    hit = hit === "x" ? "both" : "y";
    // 一旦基本站住就停
    if (Math.abs(vy) < 40 && Math.abs(vx) < 40) {
      return { state: { x, y, vx: 0, vy: 0 }, hit, settled: true };
    }
  }

  const settled = Math.hypot(vx, vy) < STOP_SPEED && y >= b.maxY - 2; // 已落地且几乎停
  return { state: { x, y, vx, vy }, hit, settled };
}
