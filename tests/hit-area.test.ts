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
  it("登记单个区域 → 上报该区域本身", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    expect(sent.at(-1)).toEqual({ x: 2400, y: 1240, w: 128, h: 128 });
  });

  it("【回归】宠物 + 右键菜单 → 必须合并成覆盖两者的区域", async () => {
    const { registerHitArea } = await freshBridge();
    // 宠物在右下角
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    // 菜单弹在宠物右下方向（超出宠物范围）—— 这正是原先漏掉的那块
    registerHitArea("menu", { x: 2470, y: 1310, w: 150, h: 157 });
    const merged = sent.at(-1);
    expect(merged).not.toBeNull();
    // 合并结果必须把菜单完整包含进去，否则菜单点不动
    expect(merged!.x).toBeLessThanOrEqual(2470);
    expect(merged!.y).toBeLessThanOrEqual(1310);
    expect(merged!.x + merged!.w).toBeGreaterThanOrEqual(2470 + 150);
    expect(merged!.y + merged!.h).toBeGreaterThanOrEqual(1310 + 157);
  });

  it("移除某个来源（菜单关闭）→ 合并区域收缩回只剩宠物", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    registerHitArea("menu", { x: 2470, y: 1310, w: 150, h: 157 });
    registerHitArea("menu", null); // 菜单关闭
    expect(sent.at(-1)).toEqual({ x: 2400, y: 1240, w: 128, h: 128 });
  });

  it("全部移除 → 上报 null（整窗穿透，不抢鼠标）", async () => {
    const { registerHitArea, clearHitAreas } = await freshBridge();
    registerHitArea("pet", { x: 0, y: 0, w: 100, h: 100 });
    clearHitAreas();
    expect(sent.at(-1)).toBeNull();
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

  it("三个来源（宠物+菜单+面板）→ 并集覆盖全部", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    registerHitArea("menu", { x: 2470, y: 1310, w: 150, h: 157 });
    registerHitArea("panel", { x: 1900, y: 700, w: 340, h: 460 });
    const merged = sent.at(-1)!;
    // 左上角应取 panel 的，右下角应取 menu 的
    expect(merged.x).toBe(1900);
    expect(merged.y).toBe(700);
    expect(merged.x + merged.w).toBe(2470 + 150);
    expect(merged.y + merged.h).toBe(1310 + 157);
  });

  it("网页版（无 petAPI）不报错、静默跳过", async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    const { registerHitArea } = await freshBridge();
    expect(() => registerHitArea("pet", { x: 1, y: 1, w: 10, h: 10 })).not.toThrow();
    expect(sent.length).toBe(0);
  });
});
