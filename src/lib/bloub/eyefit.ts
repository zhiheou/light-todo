/**
 * eyefit 替身（bloub MIT 引擎的轻量版）。
 *
 * 原版在 import 时预解一张「8 皮肤 × 状态/表情」的眼贴合查表（约 304 次方向搜索），
 * 仅当使用**自定义皮肤形状**（Customizer 换形）时才有意义 —— 让胶囊眼睛贴在窄轮廓内。
 * 我们默认用视频原形（蛋/六边形/三角…是状态动画的一部分，非自定义皮肤），引擎喂
 * radii=null → 原版也恒返回 {0,0}，视觉完全等价。
 *
 * 将来若做「轻宜换肤形状」把 8 种皮肤形状接回来，把真 eyefit.ts + skins.ts 放回即可，
 * engine.ts 无需改动。
 */
export function decalageDesYeux(
  _radii?: number[] | null,
  _state?: string,
  _expression?: string | null,
): { x: number; y: number } {
  return { x: 0, y: 0 };
}
