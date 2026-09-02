import type { PetExpressionId, PetExpressionDef, PetFrame } from "../types";
import { getExpression } from "./petExpressions";
import { polarPath } from "./petShape";

/**
 * 轻宜「时钟引擎」：requestAnimationFrame 驱动，把"表情 + 眨眼 + 待机小动作 + 注视"合成一帧 PetFrame。
 *
 * - `staticFrame(id, shape)`：纯函数，给一个静态帧（表情馆缩略、聊天小头像用）。
 * - `createPetEngine(opts)`：实例，start() 后每帧 onFrame 回调一帧；PetShell 挂到 React 状态喂 AvatarV2。
 */

export interface EngineOpts {
  shape?: "ball" | "egg" | "blob" | "cloud";
  reduced?: boolean;
}

export interface Gaze {
  dx: number;
  dy: number;
}

export interface EngineInput {
  expression: PetExpressionId;
  gaze?: Gaze | null;
  flags?: { breathe?: boolean; blink?: boolean; look?: boolean; idleActs?: boolean };
}

export interface EngineHandle {
  setInput(input: EngineInput): void;
  /** 播一次性动作（wave/done/remind 等），播完回调 onDone 并可回 idle */
  playExpression(id: PetExpressionId, onDone?: () => void): void;
  /** 订阅每帧 */
  onFrame(cb: (f: PetFrame) => void): () => void;
  start(): void;
  stop(): void;
}

/** 一次性动作默认时长 */
const ACT_MS = 900;
/** 表情切换过渡 */
const MORPH_MS = 240;

/** 静态帧（无时钟，纯参数 → 帧） */
export function staticFrame(id: PetExpressionId, opts: EngineOpts = {}): PetFrame {
  const def = getExpression(id);
  const bodyPath = polarPath({
    shape: opts.shape ?? "blob",
    t: 0,
    breathAmp: 0,
    wobbleAmp: opts.reduced ? 0 : 0.01,
  });
  return {
    expr: id,
    bodyPath,
    squashX: 1,
    squashY: 1,
    rotate: def.tilt ?? 0,
    dy: 0,
    eyes: def.eyes,
    blink: 0,
    mouth: def.mouth,
    extras: def.extras ?? null,
    actT: null,
    ts: 0,
  };
}

/** 是否是一次性（播完回 idle）动作而非长期表情 */
const ONCE_ACTIONS = new Set([
  "wave",
  "wake",
  "yawn",
  "onIt",
  "done",
  "remind",
  "error",
  "surprised",
  "angry",
  "celebrate",
  "dance",
  "spin",
  "pose",
  "nope",
  "blink",
  "excited",
]);

export function createPetEngine(opts: EngineOpts = {}): EngineHandle {
  const reduced = opts.reduced ?? false;
  const shape = opts.shape ?? "blob";

  let expression: PetExpressionId = "idle";
  let active: { id: PetExpressionId; t0: number } | null = null;
  let morphFrom: PetExpressionId | null = null;
  let morphT0 = 0;
  let gaze: Gaze | null = null;
  let idleT = 0; // 待机小动作计时
  let idleGazeX = 0;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let blinkAt = 0; // 下一次眨眼时间
  let blinking = false;
  let blinkT0 = 0;
  let driftPhase = Math.random() * Math.PI * 2;
  let onActDone: (() => void) | undefined;
  const subs = new Set<(f: PetFrame) => void>();

  function emit(f: PetFrame) {
    for (const cb of subs) cb(f);
  }

  function nowMs() {
    return performance.now();
  }

  function tick(now: number) {
    const dt = Math.min(64, Math.max(1, now - lastT));
    lastT = now;
    idleT += dt;

    // 表情决定
    let curExpr: PetExpressionId = expression;
    let actT: number | null = null;
    if (active) {
      const p = (now - active.t0) / ACT_MS;
      if (p >= 1) {
        const doneId = active.id;
        active = null;
        const d = getExpression(doneId);
        onActDone?.();
        onActDone = undefined;
        // 一次性动作播完：回 idle（若该动作定义 settleIdle 或本就是 once）
        curExpr = d.settleIdle ? "idle" : expression;
      } else {
        curExpr = active.id;
        actT = p;
      }
    }

    const def = getExpression(curExpr);

    // 眨眼：随机 2.6-6s；reduced 不眨
    let blink = 0;
    if (!reduced && def.eyes.blinkMask !== false) {
      if (blinking) {
        const bp = (now - blinkT0) / 240;
        if (bp >= 1) {
          blinking = false;
          blink = 0;
        } else {
          const ph = bp < 0.5 ? bp * 2 : (1 - bp) * 2;
          blink = Math.sin(ph * Math.PI) * 0.95;
        }
      } else if (now >= blinkAt) {
        blinking = true;
        blinkT0 = now;
      }
      if (!blinking && now > blinkAt + 4000) blinkAt = now + 2600 + Math.random() * 3400;
    }
    if (!blinking && blinkAt === 0) blinkAt = now + 1200;

    // 待机小动作：每 12-26s 头轻微左右看 / 微晃
    if (!reduced) {
      idleGazeX = Math.sin(now / 2600 + driftPhase) * 0.5;
    }

    // morph 过渡：切换瞬间从上一表情眼睛/嘴 lerp 过来（这里近似用"切到即新，简单过渡"——复杂 lerp 交给 CSS）
    if (morphFrom && now - morphT0 < MORPH_MS) {
      const p = (now - morphT0) / MORPH_MS;
      if (p >= 1) morphFrom = null;
    }

    const frame = staticFrame(curExpr, { shape, reduced });
    frame.blink = Math.max(0, Math.min(1, blink));
    if (gaze) {
      frame.eyes = {
        ...frame.eyes,
        look: { dx: gaze.dx * 0.6 + idleGazeX, dy: gaze.dy * 0.5 },
      };
    } else if (!reduced) {
      frame.eyes = { ...frame.eyes, look: { dx: idleGazeX * 0.6, dy: 0 } };
    }
    frame.actT = actT;
    frame.ts = now;
    // 一次性动作期间叠加身体 squash（由 CSS 动画做，actT 仅为标记）
    emit(frame);

    if (running) raf = requestAnimationFrame(tick);
  }

  return {
    setInput(input: EngineInput) {
      const changed = input.expression !== expression;
      if (changed) {
        morphFrom = expression;
        morphT0 = nowMs();
      }
      expression = input.expression;
      if (input.gaze !== undefined) gaze = input.gaze;
    },
    playExpression(id, onDone) {
      active = { id, t0: nowMs() };
      onActDone = onDone;
    },
    onFrame(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    start() {
      if (running) return;
      running = true;
      lastT = nowMs();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      subs.clear();
    },
  };
}

export { ONCE_ACTIONS };
export type { PetExpressionDef, PetExpressionId };
