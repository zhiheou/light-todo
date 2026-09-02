import type { PetBodyShape } from "../types";
import { SHAPE_PRESETS } from "./petPalettes";

/**
 * 极坐标身体轮廓求值。
 *
 * R(θ) = baseR * (1 + oval*cos(2θ+phase)) * (1 + lobes*cos(4θ+phase2))
 *        * (1 + breath) * (1 + wobble(θ, t))      // 呼吸/待机
 * θ ∈ [0, 2π)，24 顶点。返回 path d。
 *
 * 同形态内参数平滑变化 → 形状形变（呼吸、squash、形态微调）。
 */
export interface PolarOpts {
  /** 身体形态 */
  shape?: PetBodyShape;
  /** 呼吸/微动相位 0..1 循环（-1 关） */
  t?: number;
  /** 呼吸幅度（0 关） */
  breathAmp?: number;
  /** 待机随机晃动幅度 */
  wobbleAmp?: number;
  /** 纵向拉伸（squash 由渲染 transform 完成，这里不动） */
  vStretch?: number;
  /** 顶点数 */
  segments?: number;
}

const TAU = Math.PI * 2;

function polarPath(opts: PolarOpts): string {
  const preset = SHAPE_PRESETS[opts.shape ?? "blob"];
  const baseR = preset.baseR;
  const vStretch = opts.vStretch ?? preset.vStretch;
  const breathAmp = opts.breathAmp ?? 0;
  const wobbleAmp = opts.wobbleAmp ?? 0;
  const t = opts.t ?? 0;
  const segments = opts.segments ?? 24;

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * TAU;
    const oval = 1 + preset.oval * Math.cos(2 * th + preset.phase);
    const lobes = 1 + preset.lobes * Math.cos(4 * th + preset.phase * 2);
    // 呼吸：整体微胀缩
    const breath = breathAmp > 0 ? 1 + breathAmp * Math.sin(t * TAU) : 1;
    // 待机晃动：极低幅、低频，近似惰性 blob
    const w1 = wobbleAmp > 0 ? wobbleAmp * Math.sin(th * 3 + t * TAU * 0.4) : 0;
    const w2 = wobbleAmp > 0 ? wobbleAmp * 0.6 * Math.sin(th * 5 - t * TAU * 0.3) : 0;
    let r = baseR * oval * lobes * breath * (1 + w1 + w2);
    // 云/蛋 在底部略收（保持贴合感）
    if (preset.vStretch < 1 && th > Math.PI * 0.15 && th < Math.PI * 0.85) {
      r *= 0.97;
    }
    const x = r * Math.cos(th);
    const y = r * vStretch * Math.sin(th);
    pts.push([x, y]);
  }
  return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
}

/** 计算外包络 → 让眼睛/嘴贴合在身体上（沿 y 行扫每侧的半径） */
export interface SilTable {
  minX: (y: number) => number;
  maxX: (y: number) => number;
  half: (y: number) => number;
}

function buildSil(shape: PetBodyShape, baseY: number): SilTable {
  const preset = SHAPE_PRESETS[shape];
  const baseR = preset.baseR;
  const vStretch = preset.vStretch;
  const rows: Array<{ y: number; hw: number }> = [];
  const S = 64;
  for (let i = 0; i <= S; i++) {
    const y = ((i / S) * 2 - 1) * baseR * vStretch;
    // 找该行最大 half-width（遍历 θ 采样取近似轮廓）
    let hw = 0;
    for (let k = 0; k < 200; k++) {
      const th = (k / 200) * TAU;
      const oval = 1 + preset.oval * Math.cos(2 * th + preset.phase);
      const lobes = 1 + preset.lobes * Math.cos(4 * th + preset.phase * 2);
      const yy = baseR * vStretch * Math.sin(th);
      if (Math.abs(yy - y) < baseR * 0.04) {
        const xx = baseR * oval * lobes * Math.cos(th);
        hw = Math.max(hw, Math.abs(xx));
      }
    }
    if (hw > 0) rows.push({ y, hw });
  }
  function half(y: number): number {
    let best = rows[0];
    let bestD = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.y - y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best?.hw ?? baseR;
  }
  return {
    half,
    minX: (y) => baseY - half(y),
    maxX: (y) => baseY + half(y),
  };
}

export { polarPath, buildSil };

/** 覆盖层：叹号/星形等一次性瞬态身体（特效窗内替代极坐标） */
export function overridePath(kind: "bang" | "star" | "squash"): string {
  if (kind === "bang") {
    // 感叹号：圆帽(上) + 竖杆 + 底点 —— 连续 path，用圆 + 两根矩形条
    return (
      "M -5 -16 A 5 5 0 1 1 5 -16 A 5 5 0 1 1 -5 -16 " +
      "M -3 -12 L 3 -12 L 2.4 6 L -2.4 6 Z " +
      "M -3 10 L 3 10 L 3 15 L -3 15 Z"
    );
  }
  if (kind === "star") {
    const R = 26;
    const r = R * 0.5;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = (i / 10) * TAU - Math.PI / 2;
      pts.push(`${(rad * Math.cos(a)).toFixed(1)} ${(rad * Math.sin(a)).toFixed(1)}`);
    }
    return `M ${pts.join(" L ")} Z`;
  }
  return "";
}
