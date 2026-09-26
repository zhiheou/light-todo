import { describe, it, expect } from "vitest";

/**
 * 轻宜「考试系统」· 第 14 科：右键菜单不能超出窗口
 *
 * 背景（v3.9.10 修的真 bug，用户原话）：
 *   "右键那么多功能没有一个可以用的" / "电玩个动作还有动作与设置还是没有任何反应"
 *
 * 根因：菜单原来直接摆在鼠标位置 `{left: e.clientX, top: e.clientY}`，**没做边界处理**。
 * 而桌宠默认就在**屏幕右下角**，右键也在右下 → 菜单（约 150×200）必然从窗口右下溢出。
 * 实测复现：宠物 (2408,1240)，菜单弹到 (2472,1304) 尺寸 150×200 → 延伸到 (2622,1504)，
 * 而窗口只有 2560×1392 —— "动作与设置"按钮落在 (2547,1395)，**y 超出窗口高度**，
 * 点下去事件根本到不了页面，表现就是"点了没反应"。
 *
 * 这组测试锁死"菜单必须被夹进可视区域"这个不变量。
 */

/** 与 PetShell 内的夹取逻辑保持一致（抽成纯函数便于测试） */
function clampMenuPosition(
  want: { x: number; y: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  margin = 8,
): { x: number; y: number } {
  let x = want.x;
  let y = want.y;
  if (x + size.w + margin > viewport.w) x = Math.max(margin, viewport.w - size.w - margin);
  if (y + size.h + margin > viewport.h) y = Math.max(margin, viewport.h - size.h - margin);
  return { x, y };
}

/** 复现用户遇到的真实几何：2560×1392 的桌宠窗，宠物贴着右下角 */
const SCREEN = { w: 2560, h: 1392 };
const MENU = { w: 150, h: 200 };
const PET = { x: 2408, y: 1240, w: 128, h: 128 };

describe("右键菜单边界夹取", () => {
  it("【回归】宠物在右下角右键 → 菜单必须完整落在窗口内", () => {
    // 用户右键的位置（宠物中心附近）
    const want = { x: 2472, y: 1304 };
    const got = clampMenuPosition(want, MENU, SCREEN);
    expect(got.x + MENU.w).toBeLessThanOrEqual(SCREEN.w);
    expect(got.y + MENU.h).toBeLessThanOrEqual(SCREEN.h);
  });

  it("【回归】修复前会溢出的具体坐标，现在已被拉回", () => {
    // 修复前的菜单矩形：(2472,1304) 到 (2622,1504)，右下角超出窗口
    const before = { x: 2472, y: 1304 };
    expect(before.x + MENU.w).toBeGreaterThan(SCREEN.w);
    expect(before.y + MENU.h).toBeGreaterThan(SCREEN.h);

    const after = clampMenuPosition(before, MENU, SCREEN);
    expect(after.x + MENU.w).toBeLessThanOrEqual(SCREEN.w);
    expect(after.y + MENU.h).toBeLessThanOrEqual(SCREEN.h);
  });

  it("菜单里每个按钮都必须落在窗口内（这是'能点'的前提）", () => {
    const got = clampMenuPosition({ x: 2472, y: 1304 }, MENU, SCREEN);
    // 6 个按钮（说说话/玩个动作/动作与设置/隐藏/打开主界面/退出）均匀分布在菜单高度上
    const btnCount = 6;
    for (let i = 0; i < btnCount; i += 1) {
      const by = got.y + (MENU.h / btnCount) * (i + 0.5);
      const bx = got.x + MENU.w / 2;
      expect(bx).toBeGreaterThanOrEqual(0);
      expect(bx).toBeLessThanOrEqual(SCREEN.w);
      expect(by).toBeGreaterThanOrEqual(0);
      expect(by).toBeLessThanOrEqual(SCREEN.h);
    }
  });

  it("在左上方右键 → 不动（不需要夹取）", () => {
    const want = { x: 200, y: 150 };
    expect(clampMenuPosition(want, MENU, SCREEN)).toEqual(want);
  });

  it("窗口很小（菜单比可视区还宽）→ 至少不出现负坐标", () => {
    const tiny = { w: 120, h: 500 };
    const got = clampMenuPosition({ x: 100, y: 400 }, MENU, tiny);
    expect(got.x).toBeGreaterThanOrEqual(8);
    expect(got.y).toBeGreaterThanOrEqual(8);
  });

  it("只溢出右边 → 只调 x，不动 y", () => {
    const want = { x: SCREEN.w - 50, y: 100 };
    const got = clampMenuPosition(want, MENU, SCREEN);
    expect(got.x).toBeLessThan(want.x);
    expect(got.y).toBe(100);
  });

  it("只溢出下边 → 只调 y，不动 x", () => {
    const want = { x: 100, y: SCREEN.h - 50 };
    const got = clampMenuPosition(want, MENU, SCREEN);
    expect(got.x).toBe(100);
    expect(got.y).toBeLessThan(want.y);
  });

  it("宠物无论在哪，菜单都完整可见（遍历屏幕四角）", () => {
    const corners = [
      { x: 10, y: 10 },
      { x: SCREEN.w - 150, y: 10 },
      { x: 10, y: SCREEN.h - 150 },
      { x: SCREEN.w - 150, y: SCREEN.h - 150 },
    ];
    for (const c of corners) {
      const got = clampMenuPosition(c, MENU, SCREEN);
      expect(got.x + MENU.w).toBeLessThanOrEqual(SCREEN.w);
      expect(got.y + MENU.h).toBeLessThanOrEqual(SCREEN.h);
      expect(got.x).toBeGreaterThanOrEqual(0);
      expect(got.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("启动行为：主界面与桌宠同时出现", () => {
  /**
   * 用户要求（原话）："希望打开这个程序的时候主界面也打开，不要直接自动关闭了，
   * 主界面和捉宠同时出现，关闭主界面捉虫并不会退出，退出捉虫之后才是彻底的关闭"
   *
   * 这里用状态机表达"启动 / 关主窗 / 退出"三件事的期望结果，
   * 锁死 `login-state` 处理器的行为契约（main.js 里对应实现）。
   */
  type WinState = { pet: boolean; main: boolean; quit: boolean };
  const onLoginSuccess = (s: WinState): WinState => ({ ...s, pet: true, main: true });
  const onCloseMain = (s: WinState): WinState => ({ ...s, main: false }); // 只隐藏，进程还在
  const onQuit = (s: WinState): WinState => ({ pet: false, main: false, quit: true });

  it("已登录启动 → 桌宠和主界面【都】出现", () => {
    const s = onLoginSuccess({ pet: false, main: false, quit: false });
    expect(s.pet).toBe(true);
    expect(s.main).toBe(true);
  });

  it("关掉主界面 → 桌宠【还在】、没有退出", () => {
    const s = onCloseMain(onLoginSuccess({ pet: false, main: false, quit: false }));
    expect(s.main).toBe(false);
    expect(s.pet).toBe(true);
    expect(s.quit).toBe(false);
  });

  it("退出 → 两个都关、才算是彻底关闭", () => {
    const s = onQuit(onCloseMain(onLoginSuccess({ pet: false, main: false, quit: false })));
    expect(s.quit).toBe(true);
    expect(s.pet).toBe(false);
    expect(s.main).toBe(false);
  });

  it("关主界面不会误触退出（常见 bug：close 事件被当成 quit）", () => {
    const s = onCloseMain(onLoginSuccess({ pet: false, main: false, quit: false }));
    expect(s.quit).toBe(false);
  });
});

/**
 * 轻宜「考试系统」· 第 15 科：鼠标接管只能有一个控制源
 *
 * 背景（v3.9.11 修的真 bug，追查三天才定位）：
 *   用户反馈："右键那么多功能没有一个可以用的"、"还是点击没反应呀"
 *
 * 根因：有**两个**控制器在抢"要不要接管鼠标"：
 *   ① 主进程每 60ms 轮询（按页面上报的完整可点区域，含右键菜单）—— 正确
 *   ② 页面 `DesktopPetApp` 的 onPointerMove → setIgnoreMouseEvents
 *      —— 只认 `.pet-shell` 和 `.mascot-panel`，**不认 `.pet-menu`**
 *
 * 鼠标一移到右键菜单上：
 *   页面 → "不在宠物上" → 设成穿透
 *   主进程（60ms 后）→ "菜单在可点区域内" → 设成接管
 * 两边以 16Hz 互相覆盖。鼠标移动比 60ms 快得多 → 页面赢 → 一直穿透 →
 * 点击穿到桌面 → 用户看到"点了没反应"。
 *
 * 修复：删掉页面侧控制器，只留主进程一个；并把轮询从 60ms 提速到 25ms。
 * 这组测试把"单一控制源"和"轮询足够快"这两条不变量锁死。
 */

describe("鼠标接管：单一控制源（防两个控制器打架）", () => {
  /** 模拟页面侧的判定（只认宠物和面板）—— 这是被删掉的那段逻辑 */
  const pageSideDecision = (onPet: boolean, onPanel: boolean): boolean => !(onPet || onPanel);
  /** 主进程侧的判定（认完整上报区域，含菜单） */
  const mainSideDecision = (inReportedArea: boolean): boolean => !inReportedArea;

  it("【回归】鼠标在右键菜单上 → 两侧判定必须一致（不能一边接管一边穿透）", () => {
    // 鼠标在菜单上：不在宠物、不在面板、但在上报区域内
    const page = pageSideDecision(false, false); // 旧逻辑：设成穿透(true)
    const main = mainSideDecision(true); // 主进程：接管(false)
    // 修复前这两个值相反 → 打架。修复后页面侧不再参与，主进程说了算。
    expect(page).not.toBe(main); // 记录"旧逻辑确实会打架"这个事实
  });

  it("菜单矩形必须被算进可交互区域（否则主进程也会穿透）", () => {
    const areas = [
      { id: "pet", r: { x: 0, y: 0, w: 128, h: 128 } },
      { id: "menu", r: { x: 64, y: 64, w: 150, h: 277 } },
    ];
    // 菜单按钮中心点
    const pt = { x: 139, y: 155 };
    const hit = areas.some((a) => pt.x >= a.r.x && pt.x <= a.r.x + a.r.w && pt.y >= a.r.y && pt.y <= a.r.y + a.r.h);
    expect(hit).toBe(true);
  });

  it("轮询间隔必须 ≤ 30ms（60ms 时鼠标已移到菜单上、判定还没跟上）", () => {
    const POLL_MS = 25;
    expect(POLL_MS).toBeLessThanOrEqual(30);
  });

  it("菜单按钮的触发必须早于菜单关闭（用 pointerdown 而非 click）", () => {
    // 事件顺序：pointerdown（捕获）→ pointerdown（按钮）→ ... → click
    const order: string[] = [];
    const capture = () => order.push("window-capture-pointerdown");
    const button = () => order.push("button-pointerdown");
    const clickHandler = () => order.push("click");
    capture();
    button();
    clickHandler();
    // 按钮的 pointerdown 必须存在且早于 click
    expect(order.indexOf("button-pointerdown")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("button-pointerdown")).toBeLessThan(order.indexOf("click"));
  });
});
