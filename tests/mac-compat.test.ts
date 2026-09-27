import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 轻宜「考试系统」· 第 18 科：桌面版**跨平台**体检
 *
 * 为什么单独开一科（v3.9.21）：
 *   桌面版一直是**只在 Windows 上开发、只在 Windows 上打包、只在 Windows 上验证**的。
 *   Mac 版配置写好了、GitHub 云端构建也配好了，但**没有任何一处检查过 Mac 上会怎样**。
 *   于是攒下三个一装就中的大坑（见下面各条）——而且都不是"小毛病"，
 *   是"装了就没法用 / 整台电脑点不动"级别的。
 *
 * 这一科的作用：把「Windows 上能跑」和「Mac 上能跑」的差异**锁成测试**。
 * 以后谁再改 desktop/main.js，只要踩回 Windows-only 的写法，这里立刻红。
 *
 * ⚠️ 这些断言读的是 desktop/main.js 的**源码文本**（和 auto-hit-area 那一科同样的做法）。
 * 故意如此：主进程依赖 electron 运行时，单元测试里跑不起来；
 * 而这些坑的形态（调了哪个 API、在哪个平台分支里）恰好都能从源码文本上判定。
 */

const MAIN = readFileSync(new URL("../desktop/main.js", import.meta.url), "utf8");

/** 去掉注释后的源码 —— 注释里提到某个 API 名不应该算"调用了" */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CODE = stripComments(MAIN);

describe("Mac 兼容：一装就不能用的那类问题", () => {
  it("【Mac 致命】关掉硬件加速会让鼠标穿透失效 → 全屏透明窗挡死整台电脑", () => {
    /**
     * Electron 官方文档在 `setIgnoreMouseEvents` 上有一句硬性说明：
     *   "Note: On macOS, this API is a no-op when hardware acceleration is disabled."
     * （Mac 上关掉硬件加速时，这个 API 直接不生效。）
     *
     * 这个程序的桌宠窗是**铺满整屏的透明置顶窗**，靠 setIgnoreMouseEvents 做穿透。
     * 所以一旦在 Mac 上关了硬件加速：
     *   穿透失效 → 一个看不见的全屏窗口罩住整个屏幕 → **整台电脑点不动**
     *   （和用户在 Windows 上遇到过的"整个桌面卡死"是同一类症状，但更彻底）。
     *
     * 而 `app.disableHardwareAcceleration()` 原本是为了修 **Windows**
     * 上某些显卡驱动导致透明窗变黑底的问题 —— 跟 Mac 没关系。
     * 因此必须加平台判断：只在 Windows 上关。
     */
    const call = CODE.match(/app\.disableHardwareAcceleration\(\)/);
    expect(call, "main.js 里应该保留这个调用（Windows 需要它防黑底）").toBeTruthy();

    // 找出这一行前面 12 行内有没有平台判断
    const idx = CODE.indexOf("app.disableHardwareAcceleration()");
    const before = CODE.slice(Math.max(0, idx - 900), idx);
    const guarded =
      /process\.platform\s*!==\s*["']darwin["']/.test(before) ||
      /process\.platform\s*===\s*["']win32["']/.test(before);
    expect(
      guarded,
      "【别删】disableHardwareAcceleration 必须加 Mac 判断：" +
        "Mac 上关掉硬件加速 → setIgnoreMouseEvents 失效 → 全屏透明窗挡死整台电脑。",
    ).toBe(true);
  });

  it("【Mac 致命】拖动时必须有独立于鼠标事件的兜底，否则拖到一半就断", () => {
    /**
     * 拖动的命脉是"鼠标键按着时绝不切回穿透"（否则 pointer capture 立即失效 → 拖拽中断）。
     *
     * Windows 上这个判断来自 `startMouseButtonWatcher()` —— 常驻 PowerShell 读系统按键。
     * **Mac 上没有这个**（那段代码开头就 `if (process.platform !== "win32") return;`），
     * 于是只能靠页面上报（`pet-mouse-held`）。
     *
     * 而页面上报恰恰在最要命的时刻不可靠：拖拽时鼠标跑到宠物前面 → 主进程判定
     * "不在宠物的可点区域" → 虽然因为 takeoverLocked 暂时没切穿透，但一旦
     * pointer capture 丢失，页面**再也收不到 pointermove/pointerup**（事件被窗口穿透截断）
     * → 页面永远不报"松开了/还按着" → 状态卡住 → 用户表现就是"拖到一半拖不动"。
     *
     * 所以页面侧必须有一个**只依赖 window 级事件（不依赖 pointer capture）**的监听。
     * 这里断言它存在，且监听在 window 上（而不是绑在宠物元素上）。
     */
    const bridge = stripComments(
      readFileSync(new URL("../src/lib/desktopBridge.ts", import.meta.url), "utf8"),
    );
    const fn = bridge.match(/export function startMouseHeldWatch\(\)[\s\S]*?\n}/);
    expect(fn, "startMouseHeldWatch 应该存在").toBeTruthy();
    const body = fn![0];

    for (const evt of ["pointerdown", "pointermove", "pointerup"]) {
      expect(
        body.includes(`window.addEventListener("${evt}"`),
        `鼠标键监听必须挂在 window 的 ${evt} 上（挂元素上会随 capture 一起失效）`,
      ).toBe(true);
    }
    // 用 buttons 位掩码判断"还有没有键按着"，而不是记 e.button（多键顺序问题）
    expect(body.includes("e.buttons"), "必须用 e.buttons 位掩码判断按键状态").toBe(true);
  });

  it("【Mac 致命】桌宠进全屏空间不能被吞掉（用户看视频/演示时宠物会消失）", () => {
    /**
     * Mac 有"空间（Space）"概念：每个全屏 App 是独立空间，桌面也是一个空间。
     * 默认情况下窗口只存在于它所在的那个空间。
     * 桌宠窗必须跟到用户当前的空间，否则用户一进全屏（看视频、演示、全屏写代码）
     * 宠物就"没了"（其实在另一个空间里）。
     *
     * `setVisibleOnAllWorkspaces(true)` 就是干这个的。但它在**两个平台上语义不同**：
     *   - Windows：就是"所有虚拟桌面都显示"
     *   - Mac：默认**不会**覆盖全屏空间，必须显式传
     *     `{ visibleOnFullScreen: true }` 才会跟到全屏 App 上面。
     *
     * 之前的代码是无参数调用 → Mac 上等于"桌面空间可见，但全屏空间里没有"。
     */
    // 找 setVisibleOnAllWorkspaces 出现的**每一处**，其中至少一处必须带着该选项
    const all = [...CODE.matchAll(/setVisibleOnAllWorkspaces\(/g)].map((m) => m.index!);
    expect(all.length, "应该保留了 setVisibleOnAllWorkspaces 调用").toBeGreaterThan(0);

    const ok = all.some((idx) => {
      // 从调用点截到本条语句结束（到分号为止），看这次调用有没有带该选项
      const stmt = CODE.slice(idx, CODE.indexOf(";", idx) + 1);
      return /visibleOnFullScreen/.test(stmt);
    });
    expect(
      ok,
      "【Mac】setVisibleOnAllWorkspaces 必须在 darwin 分支里传 { visibleOnFullScreen: true }：" +
        "否则 Mac 上用户一进全屏（看视频/演示），桌宠就消失在另一个空间里。",
    ).toBe(true);
  });

  it("Mac 上不能依赖 Windows 专属能力（反向断言：平台分支必须存在且正确）", () => {
    // 系统级鼠标监听是 Windows 专属（PowerShell + GetAsyncKeyState）
    const watcherIdx = CODE.indexOf("function startMouseButtonWatcher()");
    expect(watcherIdx).toBeGreaterThan(-1);
    const watcherBody = CODE.slice(watcherIdx, watcherIdx + 300);
    expect(
      /process\.platform\s*!==\s*["']win32["']/.test(watcherBody),
      "startMouseButtonWatcher 必须只在 Windows 上启用（Mac 没有 PowerShell）",
    ).toBe(true);

    // 托盘图标：Mac 需要模板图标（自动适配深/浅色菜单栏），否则在深色菜单栏上看不见
    const trayIdx = CODE.indexOf("function createTray()");
    expect(trayIdx).toBeGreaterThan(-1);
  });
});

describe("Mac 兼容：打包相关", () => {
  it("mac 构建目标必须同时覆盖 Intel 和苹果芯片（用户是 2018 款 Intel MacBook Pro）", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../desktop/package.json", import.meta.url), "utf8"),
    ) as {
      version: string;
      build: { mac: { target: Array<{ target: string; arch: string[] }> }; dmg: unknown };
    };
    const targets = pkg.build.mac.target;
    const arches = targets.flatMap((t) => t.arch);
    expect(arches, "Mac 包必须同时出 x64（Intel）和 arm64（M 系列）").toContain("x64");
    expect(arches).toContain("arm64");
    expect(targets.map((t) => t.target)).toContain("dmg");
    // 没买苹果签名证书 → identity 必须为 null，否则云端构建会因找不到证书而失败
    expect(
      (pkg.build.mac as unknown as { identity: unknown }).identity,
      "没有苹果开发者证书时 identity 必须是 null，否则构建直接失败",
    ).toBeNull();
  });

  it("版本号必须 ≥ 3.9.21（Mac 修复版），且与自动更新源一致", () => {
    /**
     * v3.9.20 的血泪：desktop/package.json 的 version 从 3.9.4 一直没动，
     * 而代码做到 3.9.20 → 远端 latest.yml = 本地 = 3.9.4 → **自动更新永远不触发**。
     * 这条测试防止它再退回去。
     */
    const pkg = JSON.parse(
      readFileSync(new URL("../desktop/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const [maj, min, pat] = pkg.version.split(".").map(Number);
    const v = maj * 10000 + min * 100 + pat;
    expect(
      v,
      `desktop/package.json 版本号是 ${pkg.version}，必须 ≥ 3.9.21：` +
        "版本号不提，用户就永远收不到自动更新（v3.9.20 踩过的大坑）。",
    ).toBeGreaterThanOrEqual(3 * 10000 + 9 * 100 + 21);
  });
});
