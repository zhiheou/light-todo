import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 轻宜「考试系统」· 第 17 科：浮层自动登记（治本）
 *
 * 背景 —— 同一类 bug 犯了 **4 次**：
 *   ① `.pet-menu` 右键菜单      → 用户："右键那么多功能没有一个可以用的"
 *   ② `.pet-summon` 召回按钮    → 用户："隐藏之后召不回来"
 *   ③ `.mascot-panel` 聊天面板  → 一开始就漏了
 *   ④ `.pet-config` 动作与设置  → 用户："点击这个皮肤和行为没有任何反应，会直接穿透点击下个页面的东西"
 *
 * 根因永远是同一个：桌面版桌宠窗铺满整屏 + 鼠标穿透，
 * **任何能点的东西都必须登记为可点击区域**，漏一个就"点了没反应、点到桌面去了"。
 *
 * v3.9.17 起改成**自动扫描**（MutationObserver + 定时兜底），
 * 这组测试锁死"四类浮层都必须被自动覆盖"这个不变量。
 */

const sent: Array<{ rects?: Array<{ x: number; y: number; w: number; h: number }> } | null> = [];

beforeEach(() => {
  sent.length = 0;
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    petAPI: {
      isDesktop: true,
      setHitbox: (r: unknown) => sent.push(r as never),
    },
  };
});

async function freshBridge() {
  vi.resetModules();
  return await import("../src/lib/desktopBridge");
}

describe("浮层自动登记：所有能点的面板都必须被覆盖", () => {
  it("【回归 4 次事故】自动扫描的类名清单必须包含全部 4 个出过问题的浮层", async () => {
    // 这条测试的作用：如果以后有人（或我）从清单里删掉某一项，
    // 对应的浮层就会重新变成"点了没反应"，这条测试会立刻失败。
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/desktopBridge.ts", "utf8"),
    );
    const required = [
      ".pet-config", // ④ 动作与设置（皮肤/行为）
      ".pet-menu", // ①  右键菜单
      ".pet-summon", // ② 召回按钮
      ".mascot-panel", // ③ 聊天面板
    ];
    for (const sel of required) {
      expect(src).toContain(`"${sel}"`);
    }
  });

  it("多个浮层同时存在 → 登记它们的并集（都要可点）", async () => {
    const { registerHitArea } = await freshBridge();
    // 模拟自动扫描合并的结果
    registerHitArea("auto-layers", { x: 100, y: 100, w: 400, h: 500 });
    const p = sent.at(-1) as { rects?: Array<{ x: number; y: number; w: number; h: number }> };
    expect(p.rects).toContainEqual({ x: 100, y: 100, w: 400, h: 500 });
  });

  it("浮层全部关闭 → 注销该区域（恢复穿透，不挡桌面）", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("auto-layers", { x: 10, y: 10, w: 100, h: 100 });
    registerHitArea("auto-layers", null);
    expect(sent.at(-1)).toBeNull();
  });

  it("自动登记与手动登记共存（取并集，互不覆盖）", async () => {
    const { registerHitArea } = await freshBridge();
    registerHitArea("pet", { x: 2400, y: 1240, w: 128, h: 128 });
    registerHitArea("auto-layers", { x: 2000, y: 800, w: 300, h: 400 });
    const p = sent.at(-1) as { rects?: Array<{ x: number; y: number; w: number; h: number }> };
    expect(p.rects).toContainEqual({ x: 2400, y: 1240, w: 128, h: 128 });
    expect(p.rects).toContainEqual({ x: 2000, y: 800, w: 300, h: 400 });
  });
});

describe("v3.9.20 补齐：铺满全屏的蒙层也必须登记", () => {
  it("【回归·第5次同类事故】`.pet-config-overlay` 必须在自动扫描清单里", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/desktopBridge.ts", "utf8"),
    );
    // 设置面板的全屏蒙层：点击它应该关闭面板。
    // 不登记 → 点击穿到桌面（面板不关、还选中了桌面图标）——这是同类 bug 第 5 次。
    expect(src).toContain('".pet-config-overlay"');
  });

  it("其余实测会出现在桌宠窗口里的浮层也都要覆盖", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/desktopBridge.ts", "utf8"),
    );
    for (const sel of [
      ".mascot-bubble",
      ".pet-saved-hint",
      ".pet-config-tip",
      ".pet-skin-panel",
      ".ability-panel",
      ".ability-learn-hint",
    ]) {
      expect(src, `缺少 ${sel}`).toContain(`"${sel}"`);
    }
  });
});
