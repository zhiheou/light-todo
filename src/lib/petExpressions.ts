import type {
  PetCategory,
  PetExpressionDef,
  PetExpressionId,
  PetEyeSpec,
  PetMouthSpec,
} from "../types";

/**
 * 轻宜 36 表情目录（数据驱动）。
 * 渲染/状态机只认 id；category 用于表情馆分组 tab。
 * 编号思路沿用 aora-bot 分段：00-09 生命周期 / 10-29 情绪 / 30-49 工作态 / 特技。
 */

interface D {
  id: string;
  category: PetCategory;
  nameZh: string;
  nameEn: string;
  eyes?: Partial<PetEyeSpec>;
  mouth?: Partial<PetMouthSpec>;
  extras?: PetExpressionDef["extras"];
  motion?: PetExpressionDef["motion"];
  tilt?: number;
  settleIdle?: boolean;
}

function def(d: D): PetExpressionDef {
  return {
    id: d.id,
    category: d.category,
    nameZh: d.nameZh,
    nameEn: d.nameEn,
    eyes: { style: "round", blinkMask: true, ...d.eyes },
    mouth: { kind: "smile", ...d.mouth },
    extras: d.extras,
    motion: d.motion,
    tilt: d.tilt,
    settleIdle: d.settleIdle,
  };
}

export const PET_EXPRESSIONS: PetExpressionDef[] = [
  // ===== 生命周期 00-09 =====
  def({ id: "sleep", category: "life", nameZh: "睡觉", nameEn: "Sleep", eyes: { style: "sleepLine", blinkMask: false }, mouth: { kind: "flat" }, extras: { fx: "zzz" }, motion: { loop: true } }),
  def({ id: "wake", category: "life", nameZh: "醒来", nameEn: "Wake", eyes: { style: "half" }, mouth: { kind: "wow" }, settleIdle: true, motion: { keyframes: [{ t: 0, y: 4, sy: 0.9 }, { t: 0.4, y: -3, sx: 1.06 }, { t: 1, sy: 1 }], once: true } }),
  def({ id: "idle", category: "life", nameZh: "待机", nameEn: "Idle", eyes: { style: "round" }, mouth: { kind: "smile" }, motion: { loop: true } }),
  def({ id: "blink", category: "life", nameZh: "眨眼", nameEn: "Blink", eyes: { style: "round" }, mouth: { kind: "smile" } }),
  def({ id: "curious", category: "life", nameZh: "好奇", nameEn: "Curious", eyes: { style: "openBig" }, mouth: { kind: "oh" }, tilt: 6, motion: { keyframes: [{ t: 0.4, rotate: 8 }, { t: 1, rotate: -4 }], loop: true } }),
  def({ id: "daze", category: "life", nameZh: "发呆", nameEn: "Daze", eyes: { style: "openBig", look: { dx: 0.4, dy: -0.3 } }, mouth: { kind: "flat" }, motion: { loop: true } }),
  def({ id: "yawn", category: "life", nameZh: "打哈欠", nameEn: "Yawn", eyes: { style: "half", blinkMask: false }, mouth: { kind: "wow", scale: 1.6 }, motion: { keyframes: [{ t: 0, sy: 1 }, { t: 0.5, sy: 1.12 }, { t: 1, sy: 1 }], once: true } }),
  def({ id: "peek", category: "life", nameZh: "偷看", nameEn: "Peek", eyes: { style: "squint" }, mouth: { kind: "flat" }, tilt: -10, motion: { loop: true } }),
  def({ id: "wave", category: "life", nameZh: "打招呼", nameEn: "Wave", eyes: { style: "happyArc" }, mouth: { kind: "open" }, motion: { keyframes: [{ t: 0, rotate: 0 }, { t: 0.3, rotate: 10 }, { t: 0.6, rotate: -6 }, { t: 1, rotate: 0 }], once: true } }),
  def({ id: "excited", category: "life", nameZh: "兴奋", nameEn: "Excited", eyes: { style: "star" }, mouth: { kind: "open", scale: 1.3 }, extras: { stars: 2 }, motion: { keyframes: [{ t: 0.25, y: -6, sx: 1.05, sy: 0.9 }, { t: 0.5, y: 0 }, { t: 0.75, y: -5, sx: 1.03, sy: 0.92 }, { t: 1 }], loop: true } }),

  // ===== 情绪 10-29 =====
  def({ id: "happy", category: "emotion", nameZh: "开心", nameEn: "Happy", eyes: { style: "happyArc" }, mouth: { kind: "open" }, extras: { stars: 1 }, motion: { keyframes: [{ t: 0.25, y: -4 }, { t: 0.5, y: 0 }, { t: 0.75, y: -3 }, { t: 1 }], loop: true } }),
  def({ id: "sad", category: "emotion", nameZh: "难过", nameEn: "Sad", eyes: { style: "sadArc", blinkMask: false }, mouth: { kind: "frown" }, tilt: -4 }),
  def({ id: "angry", category: "emotion", nameZh: "生气", nameEn: "Angry", eyes: { style: "tense" }, mouth: { kind: "grim" }, extras: { exclaim: true }, tilt: 2, motion: { keyframes: [{ t: 0.2, rotate: 4 }, { t: 0.4, rotate: -4 }, { t: 0.6, rotate: 3 }, { t: 1, rotate: 0 }], once: true } }),
  def({ id: "surprised", category: "emotion", nameZh: "惊讶", nameEn: "Surprised", eyes: { style: "openBig", irisScale: 0.9 }, mouth: { kind: "wow" }, extras: { exclaim: true }, motion: { keyframes: [{ t: 0.2, sx: 1.2, sy: 0.85 }, { t: 0.6, sx: 1.05, sy: 1.05 }, { t: 1 }], once: true } }),
  def({ id: "shy", category: "emotion", nameZh: "害羞", nameEn: "Shy", eyes: { style: "half", look: { dx: -0.2, dy: 0.4 } }, mouth: { kind: "smile" }, extras: { blush: true }, tilt: -8 }),
  def({ id: "thinking", category: "emotion", nameZh: "思考", nameEn: "Thinking", eyes: { style: "squint", look: { dx: 0, dy: -0.4 } }, mouth: { kind: "annoyed" }, extras: { fx: "orbit" }, tilt: 8, motion: { loop: true } }),
  def({ id: "tired", category: "emotion", nameZh: "疲惫", nameEn: "Tired", eyes: { style: "half", blinkMask: false }, mouth: { kind: "flat" }, motion: { loop: true } }),
  def({ id: "love", category: "emotion", nameZh: "心花怒放", nameEn: "Love", eyes: { style: "heart" }, mouth: { kind: "open" }, extras: { heart: true }, motion: { keyframes: [{ t: 0.25, y: -5, sx: 1.04, sy: 0.9 }, { t: 0.5, y: 0 }, { t: 0.75, y: -4 }, { t: 1 }], loop: true } }),
  def({ id: "dizzy", category: "emotion", nameZh: "头晕", nameEn: "Dizzy", eyes: { style: "cross" }, mouth: { kind: "flat" }, tilt: 4, motion: { keyframes: [{ t: 0.15, rotate: 8 }, { t: 0.3, rotate: -8 }, { t: 0.45, rotate: 6 }, { t: 0.6, rotate: -6 }, { t: 1, rotate: 0 }], loop: true } }),
  def({ id: "scared", category: "emotion", nameZh: "害怕", nameEn: "Scared", eyes: { style: "openBig", irisScale: 0.7 }, mouth: { kind: "wow" }, extras: { sweat: true }, motion: { keyframes: [{ t: 0.1, x: -2 }, { t: 0.2, x: 2 }, { t: 0.3, x: -1 }, { t: 0.4, x: 1 }, { t: 1 }], loop: true } }),
  def({ id: "sweat", category: "emotion", nameZh: "尴尬", nameEn: "Sweat", eyes: { style: "tense" }, mouth: { kind: "grimace" }, extras: { sweat: true }, tilt: -3 }),
  def({ id: "proud", category: "emotion", nameZh: "得意", nameEn: "Proud", eyes: { style: "squint", look: { dx: 0, dy: -0.3 } }, mouth: { kind: "smirk" }, tilt: -6 }),
  def({ id: "smug", category: "emotion", nameZh: "傲娇", nameEn: "Smug", eyes: { style: "squint" }, mouth: { kind: "smirk" }, tilt: -10 }),
  def({ id: "deadpan", category: "emotion", nameZh: "面无表情", nameEn: "Deadpan", eyes: { style: "dot" }, mouth: { kind: "line" } }),
  def({ id: "hopeful", category: "emotion", nameZh: "期待", nameEn: "Hopeful", eyes: { style: "half", look: { dx: 0, dy: -0.3 } }, mouth: { kind: "smile" }, tilt: 4 }),

  // ===== 工作态 30-49 =====
  def({ id: "working", category: "work", nameZh: "工作中", nameEn: "Working", eyes: { style: "round", look: { dx: 0, dy: -0.1 } }, mouth: { kind: "flat" }, tilt: 2, motion: { loop: true } }),
  def({ id: "onIt", category: "work", nameZh: "收到", nameEn: "On It", eyes: { style: "winkR" }, mouth: { kind: "smile" }, extras: { stars: 1 }, motion: { keyframes: [{ t: 0.2, y: -5 }, { t: 0.5, y: 0 }, { t: 0.8, y: -3 }, { t: 1 }], once: true } }),
  def({ id: "remind", category: "work", nameZh: "提醒", nameEn: "Remind", eyes: { style: "openBig" }, mouth: { kind: "open" }, extras: { exclaim: true }, motion: { keyframes: [{ t: 0.1, y: -3 }, { t: 0.25, y: 0 }, { t: 0.4, y: -3, sx: 1.05, sy: 0.9 }, { t: 0.6, y: 0 }, { t: 0.8, y: -3 }, { t: 1 }], once: true } }),
  def({ id: "done", category: "work", nameZh: "完成", nameEn: "Done", eyes: { style: "happyArc" }, mouth: { kind: "open" }, extras: { stars: 2 }, motion: { keyframes: [{ t: 0.2, y: -6, sx: 1.06, sy: 0.9 }, { t: 0.4, y: 0 }, { t: 0.6, y: -4 }, { t: 0.8, y: 0 }], once: true } }),
  def({ id: "error", category: "work", nameZh: "出错", nameEn: "Error", eyes: { style: "cross" }, mouth: { kind: "grim" }, extras: { crossMark: true }, motion: { keyframes: [{ t: 0.15, x: -3 }, { t: 0.3, x: 3 }, { t: 0.45, x: -2 }, { t: 0.6, x: 2 }, { t: 1 }], once: true } }),
  def({ id: "waiting", category: "work", nameZh: "等你确认", nameEn: "Waiting", eyes: { style: "round", look: { dx: -0.2, dy: 0.3 } }, mouth: { kind: "oh" }, tilt: -6, motion: { keyframes: [{ t: 0.3, rotate: -6 }, { t: 0.7, rotate: -2 }, { t: 1, rotate: -6 }], loop: true } }),
  def({ id: "focus", category: "work", nameZh: "专注", nameEn: "Focus", eyes: { style: "half" }, mouth: { kind: "line" }, motion: { loop: true } }),
  def({ id: "celebrate", category: "work", nameZh: "庆祝", nameEn: "Celebrate", eyes: { style: "happyArc" }, mouth: { kind: "open", scale: 1.4 }, extras: { fx: "confetti", stars: 2 }, motion: { keyframes: [{ t: 0.2, y: -7, sx: 1.1, sy: 0.85 }, { t: 0.4, y: 0 }, { t: 0.6, y: -6, sx: 1.08, sy: 0.88 }, { t: 0.8, y: 0 }], once: true } }),
  def({ id: "typing", category: "work", nameZh: "正在输入", nameEn: "Typing", eyes: { style: "round", look: { dx: -0.4, dy: 0 } }, mouth: { kind: "open" }, extras: { fx: "typeDots" }, motion: { loop: true } }),
  def({ id: "nope", category: "work", nameZh: "不是吧", nameEn: "Nope", eyes: { style: "half" }, mouth: { kind: "flat" }, motion: { keyframes: [{ t: 0.2, rotate: 14 }, { t: 0.4, rotate: -14 }, { t: 0.6, rotate: 10 }, { t: 0.8, rotate: -8 }, { t: 1, rotate: 0 }], once: true } }),

  // ===== 特技 =====
  def({ id: "dance", category: "work", nameZh: "跳舞", nameEn: "Dance", eyes: { style: "star" }, mouth: { kind: "open" }, extras: { fx: "confetti", stars: 2 }, motion: { keyframes: [{ t: 0.15, rotate: 12, y: -4 }, { t: 0.35, rotate: -12, y: 0 }, { t: 0.55, rotate: 12, y: -4 }, { t: 0.75, rotate: -12, y: 0 }, { t: 1, rotate: 0 }], loop: true } }),
  def({ id: "spin", category: "work", nameZh: "转圈", nameEn: "Spin", eyes: { style: "cross" }, mouth: { kind: "flat" }, motion: { keyframes: [{ t: 0, rotate: 0 }, { t: 0.5, rotate: 180, sx: 0.6 }, { t: 1, rotate: 360 }], once: true } }),
  def({ id: "pose", category: "work", nameZh: "凹造型", nameEn: "Pose", eyes: { style: "squint" }, mouth: { kind: "smirk" }, tilt: -12, extras: { fx: "sparkle" }, motion: { keyframes: [{ t: 0, y: 0 }, { t: 0.4, y: -4, sx: 1.02, sy: 0.95 }, { t: 1, y: 0 }], once: true } }),
];

export const PET_EXPRESSION_ORDER: PetExpressionId[] = PET_EXPRESSIONS.map((e) => e.id as PetExpressionId);

/** 分组索引（表情馆 tab） */
export const PET_EXPRESSIONS_BY_CATEGORY: Record<PetCategory, PetExpressionDef[]> = {
  life: [],
  emotion: [],
  work: [],
};
for (const e of PET_EXPRESSIONS) {
  PET_EXPRESSIONS_BY_CATEGORY[e.category].push(e);
}

export function getExpression(id: string): PetExpressionDef {
  return PET_EXPRESSIONS.find((e) => e.id === id) ?? PET_EXPRESSIONS.find((e) => e.id === "idle")!;
}
