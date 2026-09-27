#!/usr/bin/env node
/**
 * 桌面版主进程"加载 + 运行"自检（v3.9.15）
 *
 * 背景：前后两次事故都是"变量被误删、只留下用它的代码"：
 *   ① const APP_URL 被删      → 启动即崩（ReferenceError: APP_URL is not defined）
 *   ② const {x:mx,y:my} 被删  → 启动后一轮询就崩（ReferenceError: mx is not defined）
 * 纯文本扫描抓不全（第一次只抓函数名，漏了变量）。这里改成**真把 main.js 跑一遍**：
 * 用假的 electron 模块顶替，收集所有定时器与 IPC 处理器并依次触发，
 * 任何未定义标识符都会立刻抛出来。
 *
 * 用法：node desktop/scripts/smoke-main.mjs
 * 退出码 0 = 通过
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN = join(__dirname, "..", "main.js");
const require = createRequire(import.meta.url);

const errors = [];
const timers = [];
const ipcHandlers = new Map();
/** app.whenReady 的回调（必须手动执行，否则 createPetWindow 那一整块都跑不到） */
const readyCallbacks = [];

const DISPLAY = {
  workAreaSize: { width: 2560, height: 1392 },
  workArea: { x: 0, y: 0, width: 2560, height: 1392 },
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  scaleFactor: 1,
};

const fakeWin = {
  isDestroyed: () => false,
  isVisible: () => true,
  isMinimized: () => false,
  show() {}, hide() {}, focus() {}, restore() {},
  setIgnoreMouseEvents() {}, setAlwaysOnTop() {}, setVisibleOnAllWorkspaces() {},
  loadURL() {}, setMenuBarVisibility() {}, setBounds() {}, setPosition() {},
  getPosition: () => [0, 0],
  getBounds: () => ({ x: 0, y: 0, width: 2560, height: 1392 }),
  getSize: () => [2560, 1392],
  on() {}, once() {},
  webContents: { on() {}, send() {}, executeJavaScript: () => Promise.resolve(), reload() {} },
};

function FakeBrowserWindow() {
  return fakeWin;
}
FakeBrowserWindow.getAllWindows = () => [];

const fakeElectron = {
  app: {
    disableHardwareAcceleration() {},
    commandLine: { appendSwitch() {} },
    requestSingleInstanceLock: () => true,
    on() {},
    whenReady: () => ({ then: (fn) => { /* 见下方：启动后手动执行 */ readyCallbacks.push(fn); return { catch: () => {} }; } }),
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings() {},
    quit() {},
    getPath: () => "/tmp",
  },
  BrowserWindow: FakeBrowserWindow,
  ipcMain: {
    on: (ch, fn) => ipcHandlers.set(ch, fn),
    handle: (ch, fn) => ipcHandlers.set(ch, fn),
  },
  screen: {
    getPrimaryDisplay: () => DISPLAY,
    getAllDisplays: () => [DISPLAY],
    getCursorScreenPoint: () => ({ x: 2472, y: 1304 }),
    getDisplayNearestPoint: () => DISPLAY,
    on() {},
  },
  Tray: function FakeTray() {
    return { setToolTip() {}, setContextMenu() {}, on() {} };
  },
  Menu: { buildFromTemplate: () => ({}) },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }), createEmpty: () => ({}) },
  session: {
    fromPartition: () => ({
      clearCache: () => Promise.resolve(),
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
    }),
  },
};

// 收集定时器，稍后手动触发（相当于跑了几轮轮询）
globalThis.setTimeout = (fn, ms) => {
  timers.push({ fn, ms, kind: "timeout" });
  return 0;
};
globalThis.setInterval = (fn, ms) => {
  timers.push({ fn, ms, kind: "interval" });
  return 0;
};

// 注入假模块
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return fakeElectron;
  if (request === "electron-updater") {
    return {
      autoUpdater: {
        on() {},
        setFeedURL() {},
        checkForUpdates: () => Promise.resolve(),
        downloadUpdate: () => Promise.resolve(),
        quitAndInstall() {},
      },
    };
  }
  return origLoad.apply(this, arguments);
};

try {
  require(MAIN);
} catch (e) {
  errors.push("加载期错误: " + e.message);
}

/**
 * 🔴 关键：必须**手动触发 app.whenReady 的回调**。
 *
 * 踩过的坑：第一版自检只收集了"模块加载期创建的定时器"，但轮询定时器是在
 * `createPetWindow()` 里创建的，而它只在 `app.whenReady().then(...)` 里调用 ——
 * 假环境的 whenReady 返回的是已 resolve 的 Promise，但**回调排进微任务队列后
 * 脚本已经往下走了**，所以那一轮根本没跑到，`mx is not defined` 这种
 * "运行期才炸"的错误就漏过去了（我实测过：删掉 mx 定义，自检照样通过）。
 *
 * 现在：显式把 whenReady 的回调存下来，手动 await 执行，再收集定时器。
 */
// 手动执行 whenReady 回调（= 应用真正启动起来）
for (const fn of readyCallbacks) {
  try {
    fn();
  } catch (e) {
    errors.push("whenReady 回调出错: " + e.message);
  }
}

// 触发所有定时器
for (const t of timers) {
  try {
    t.fn();
  } catch (e) {
    errors.push("定时器(" + t.kind + "," + t.ms + "ms) 出错: " + e.message);
  }
}

// 触发所有 IPC 处理器（模拟页面发来的消息）
for (const [ch, fn] of ipcHandlers) {
  const arg =
    ch === "pet-hitbox"
      ? { x: 2414, y: 1246, w: 128, h: 128, rects: [{ x: 2414, y: 1246, w: 128, h: 128 }] }
      : ch === "pet-set-size"
        ? 104
        : ch === "pet-move"
          ? { dx: 1, dy: 1 }
          : ch === "login-state"
            ? true
            : undefined;
  try {
    fn({}, arg);
  } catch (e) {
    errors.push("IPC [" + ch + "] 出错: " + e.message);
  }
}

// 多跑几轮轮询（有些错误只在第二轮才出现）
for (let round = 0; round < 3; round += 1) {
  for (const t of timers) {
    if (t.kind !== "interval") continue;
    try {
      t.fn();
    } catch (e) {
      errors.push("轮询第 " + (round + 1) + " 轮出错: " + e.message);
      break;
    }
  }
}

if (errors.length > 0) {
  console.error("❌ desktop/main.js 运行自检未通过：");
  for (const e of [...new Set(errors)]) console.error("   - " + e);
  console.error("");
  console.error("这会导致应用启动后崩溃或功能失效。修好再打包。");
  process.exit(1);
}

console.log("✅ desktop/main.js 运行自检通过（加载 + 定时器 + IPC 全部正常）");
