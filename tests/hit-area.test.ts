import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 轻宜「考试系统」· 第 13 科：可交互区域登记（桌面版鼠标穿透的命门）
 *
 * 背景（v3.9.7 修的真 bug，用户原话）：
 *   "右键左手点动作设置隐藏回右下角全部都没法用，没有任何反应"
 *
 * 根因：桌面版桌宠窗是**铺满整屏的透明窗 + 鼠标穿透**，主进程靠"鼠标是否落在
 * 已登记的矩形内"决定要不要接管。最初只登记了「宠物本体」和「聊天面板」两个来源，
 * 而**右键菜单渲染在宠物之外**（.pet-shell 的兄弟节点）→ 菜单那一片仍处于穿透状态
 * → 用户点任何一项，事件都直接穿到桌面上去了。
 *
 * 这组测试锁死：多来源登记 + 合并 + 变化才上报 的行为。
 * 以后再加新的弹出层，只要调 registerHitArea 就会自动被覆盖。
 */

// 必须在导入被测模块前把 window.petAPI 准备好（模块内会读）
const sent: Array<{ x: number; y: number; w: number; h: number } | null> = [];

beforeEach(() => {
  sent.length = 0;
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    petAPI: {
      isDesktop: true,
      setHitbox: (r: unknown) => sent.push(r as never),
    },
  };
});

/** 动态导入，保证每次都是干净的模块状态（hitAreas 是模块级 Map） */
async function freshBridge() {
  vi.resetModules();
  return await import("../src/lib/desktopBridge");
}

describe("可交互区域登记（桌面版穿透命中）", () => {
  it("登记单个区域 → 上报兼容格式（包围盒 + rects 列表）", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    const p = sent.at(-1) as any;
    // v3.9.14：协议必须**双向兼容** —— 前端会自动更新，外壳不会。
    // 旧外壳读 x/y/w/h，新外壳优先读 rects。
    expect(p.x).toBe(2400);
    expect(p.y).toBe(1240);
    expect(p.w).toBe(128);
    expect(p.h).toBe(128);
    expect(p.rects).toEqual([{ x: 2400, y: 1240, w: 128, h: 128 }]);
  });

  it("【回归】宠物 + 右键菜单 → rects 里保留两个**独立**矩形", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    registerHitArea("menu", { x: 2470, y: 1310, w: 150, h: 157 });
    const p = sent.at(-1) as any;
    // 新外壳按 rects 逐个判定 → 两矩形之间的空白不会被接管
    expect(p.rects).toContainEqual({ x: 2400, y: 1240, w: 128, h: 128 });
    expect(p.rects).toContainEqual({ x: 2470, y: 1310, w: 150, h: 157 });
    // 旧外壳用包围盒（会把中间那片也算上，但不至于点不动 —— 兼容优先）
    expect(p.w).toBeGreaterThanOrEqual(128);
  });

  it("【v3.9.14 回归】两个分离矩形之间的空白**不能**被算作可交互区", async () => {
    const { registerHitArea, isPointInHitAreas } = await freshBridge();
    // 宠物在右下角，聊天面板在它左边很远处
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    registerHitArea("panel", { x: 1200, y: 400, w: 340, h: 460 });
    // 两个矩形正中间那片空白
    const between = { x: 1800, y: 800 };
    // 旧实现（合并包围盒）会把这片也算成可点 → 用户点不到桌面图标
    expect(isPointInHitAreas(between.x, between.y)).toBe(false);
    // 而两个矩形内部仍应命中
    expect(isPointInHitAreas(2460, 1300)).toBe(true);
    expect(isPointInHitAreas(1300, 500)).toBe(true);
  });

  it("移除某个来源（菜单关闭）→ 列表收缩回只剩宠物", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    registerHitArea("menu", { x: 2470, y: 1310, w: 150, h: 157 });
    registerHitArea("menu", null); // 菜单关闭
    const p = sent.at(-1) as any;
    expect(p.rects).toEqual([{ x: 2400, y: 1240, w: 128, h: 128 }]);
    expect(p.x).toBe(2400);
    expect(p.w).toBe(128);
  });

  it("尺寸为 0 的区域视为不存在（不登记空矩形）", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 0, y: 0, w: 0, h: 0 });
    // 没有有效区域 → 不发（size 0 被丢弃后 hitAreas 为空，首次 flush 会发 null）
    expect(sent.at(-1)).toBeNull();
  });

  it("重复登记同一矩形 → 不重复发 IPC（避免每帧刷屏）", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 100, y: 100, w: 50, h: 50 });
    const countAfterFirst = sent.length;
    registerHitArea("pet", { x: 100, y: 100, w: 50, h: 50 });
    registerHitArea("pet", { x: 100, y: 100, w: 50, h: 50 });
    expect(sent.length).toBe(countAfterFirst);
  });

  it("网页版（无 petAPI）不报错、静默跳过", async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    const { registerHitArea } = await freshBridge();
    expect(() => registerHitArea("pet", { x: 1, y: 1, w: 10, h: 10 })).not.toThrow();
    expect(sent.length).toBe(0);
  });
});
