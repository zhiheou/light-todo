import type { PetBodyShape, PetCoatKey } from "../types";

/**
 * 轻宜配色：同一角色的双色调（晨青/暮暖等）。
 * coat = 身体主色；hi = 高光/渐变亮部；cheek = 腮红；line = 五官描边。
 */
export interface CoatPalette {
  main: string;
  hi: string;
  cheek: string;
  line: string;
}

export const COAT_PALETTES: Record<PetCoatKey, CoatPalette> = {
  // 晨青（工作默认）—— 低饱和、克制、清新
  teal: { main: "#1f9d8a", hi: "#7fd6c6", cheek: "#a7e3d8", line: "#0e4f46" },
  // 暮暖（个人默认）—— 温暖
  amber: { main: "#e0963c", hi: "#f7c97e", cheek: "#f6b98b", line: "#7a4a10" },
  azure: { main: "#4a90d9", hi: "#a3cdf0", cheek: "#b6d8f5", line: "#1e4e82" },
  coral: { main: "#e8836d", hi: "#f6b7a6", cheek: "#f6c0b4", line: "#8c3a26" },
  violet: { main: "#9c87d8", hi: "#d4c8f1", cheek: "#d8ccf2", line: "#55418f" },
  rose: { main: "#e56a8f", hi: "#f6a9c0", cheek: "#f6bdd0", line: "#8c2f4f" },
  graphite: { main: "#5c6b7a", hi: "#a9b6c2", cheek: "#bdc7d1", line: "#2a3440" },
  midnight: { main: "#39426b", hi: "#8b93bb", cheek: "#9ea4c8", line: "#161b33" },
};

export interface ShapePreset {
  /** 极坐标半径基 */
  baseR: number;
  /** 竖向拉伸（>1 高瘦蛋，<1 矮扁） */
  vStretch: number;
  /** 椭圆率 a（cos2θ 幅度） */
  oval: number;
  /** 四瓣幅度 a2（cos4θ） */
  lobes: number;
  /** 基准相位 */
  phase: number;
}

/** 身体形态预设（半径表基础参数，供 petShape.ts 求值） */
export const SHAPE_PRESETS: Record<PetBodyShape, ShapePreset> = {
  ball: { baseR: 40, vStretch: 1, oval: 0.02, lobes: 0.02, phase: 0 },
  egg: { baseR: 37, vStretch: 1.32, oval: 0.02, lobes: 0.02, phase: Math.PI / 2 },
  blob: { baseR: 39, vStretch: 1.04, oval: 0.09, lobes: 0.1, phase: 0.6 },
  cloud: { baseR: 36, vStretch: 0.82, oval: 0.18, lobes: 0.08, phase: 0 },
};

/** 随机挑选一个 coat key（表情馆试玩用） */
export function randomCoat(): PetCoatKey {
  const keys = Object.keys(COAT_PALETTES) as PetCoatKey[];
  return keys[Math.floor(Math.random() * keys.length)];
}
