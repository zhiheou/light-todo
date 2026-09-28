/**
 * `shared/brandSpec.mjs` 的类型声明。
 *
 * ⚠️ 为什么要有这个文件：那份规格是 `.mjs`，因为**构建机上的 Node 脚本要能直接
 *    跑它**（GitHub Actions 用的是 Node 20，读不了 TypeScript）。但前端是 TS 项目，
 *    TS 默认不认 `.mjs` 里的类型 → 会报「隐式 any」。
 *    所以这里补一份声明：`.mjs` 给 Node 跑，`.d.mts` 给 TS 看。
 *
 * ⚠️ 两份必须**同步**：改了 .mjs 的导出，这里也要改。
 *    `tests/brand-icon.test.ts` 会逐个断言"每个运行时导出都有声明"，不会静默跑偏。
 */

export interface BrandPalette {
  coral: string;
  /** 图标底板专用（coral 压深 6%，让白脸过 3:1） */
  tile: string;
  tileLit: string;
  tileDeep: string;
  lit: string;
  deep: string;
  on: string;
  soft: string;
  shine: string;
  blush: string;
  cornerRatio: number;
  gradientIdPrefix: string;
}

export interface EllipseSpec {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface CircleSpec {
  cx: number;
  cy: number;
  r: number;
}

export interface EyeSpec extends CircleSpec {
  /** 眼睛在原始 64 框基础上的放大系数 */
  scale: number;
}

export interface MouthSpec {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  /** 线宽（相对 64 框） */
  stroke: number;
}

export interface FaceSpec {
  body: EllipseSpec;
  earL: CircleSpec;
  earR: CircleSpec;
  eyeL: EyeSpec;
  eyeR: EyeSpec;
  mouth: MouthSpec;
  cheekL: EllipseSpec;
  cheekR: EllipseSpec;
}

export interface HeadBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface LogoViewBox {
  x: number;
  y: number;
  size: number;
}

export interface PixelScale {
  bx: (v: number) => number;
  by: (v: number) => number;
  br: (v: number) => number;
  bu: (units: number) => number;
  boxSide: number;
  k: number;
}

export type FaceShape =
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number }
  | { kind: "path"; d: string; fill: string; stroke: string; strokeWidth: number };

export declare const BRAND: BrandPalette;
export declare const FACE_SIZE: number;
export declare const FACE_SCALE: number;
export declare const FACE: FaceSpec;
export declare const HEAD_BOX: HeadBox;

export declare function faceX(v: number): number;
export declare function faceY(v: number): number;
export declare function faceR(v: number): number;
export declare function eyeRadius(): number;
export declare function mouthStroke(): number;
export declare function headBox(): HeadBox;
export declare function logoViewBox(): LogoViewBox;
export declare function pixelScale(side: number, cx: number, cy: number): PixelScale;

export declare function faceShapes(opts: {
  faceFill: string;
  featureFill: string;
  blushFill?: string;
  withEars?: boolean;
  withMouth?: boolean;
  withBlush?: boolean;
}): FaceShape[];
