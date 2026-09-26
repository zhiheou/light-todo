const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

/**
 * 轻待办 桌面版主进程（v3.9.4）
 *
 * 双窗口设计（用户要求）：
 *  - 桌宠窗口：透明、无边框、置顶、鼠标穿透，常驻桌面 —— **默认只显示它**
 *  - 主窗口：正常待办界面（和网页一样），**登录完成后自动收起**，托盘随时找回
 *  - 托盘图标：随时开主窗口 / 退出
 *
 * v3.9.4 尺寸自适应：
 *  - 窗口尺寸不再写死 140px；由页面算好（按屏幕宽度 9%，夹在 [64,104]）通过 pet-set-size 报上来
 *  - 屏幕分辨率/缩放变化 → 广播 pet-display，页面重算 → 窗口跟着变
 *  - 桌宠窗口定位按**当前鼠标所在显示器**的工作区算，多显示器各自正确
 *
 * 关键坑（别踩）：
 *  - 透明窗口在部分 Windows 显卡驱动下会黑底 → disableHardwareAcceleration
 *  - 穿透要"动态切换"：鼠标进宠物区域才接管，移出立即恢复穿透（主进程轮询，不依赖 DOM 事件）
 *  - 置顶被全屏程序盖 → setAlwaysOnTop(true, "screen-saver")
 *  - 多显示器缩放 → 位置用 CSS 像素算，不要自己乘 scaleFactor（会跑偏）
 *  - 命中判定才需要 scaleFactor：getCursorScreenPoint 是物理像素，getPosition 是 CSS 像素
 */

app.disableHardwareAcceleration(); // 防透明窗口黑底
app.commandLine.appendSwitch("enable-transparent-visuals");

/** 宠物窗口默认尺寸（页面还没报真实尺寸前的兜底；中等屏是 104） */
const PET_FALLBACK = 104;
const APP_URL = process.env.LIGHT_TODO_URL || "https://todo.aebuiyke.xyz";
/** 宠物窗口比宠物本体大一圈，给聊天气泡/灵动小字留位置 */
const PET_PADDING = 56;
/** 桌宠离屏幕边缘的间距 */
const PET_MARGIN = 24;

let petWin = null;
let mainWin = null;
let tray = null;
/** 真正退出（区分"关窗口"和"退出应用"） */
let quitting = false;
/** 页面算好的宠物边长（CSS 像素），窗口 = 它 + PET_PADDING */
let petSize = PET_FALLBACK;

// ---------- 小工具 ----------
/** 当前鼠标所在的显示器（桌宠跟着用户走，多屏不出错） */
function displayForPet() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch {
    return screen.getPrimaryDisplay();
  }
}

/** 注入给页面的屏幕参数（页面用它算自适应尺寸） */
function displayMetrics(display) {
  const d = display || screen.getPrimaryDisplay();
  return {
    width: d.workAreaSize.width,
    height: d.workAreaSize.height,
    scaleFactor: d.scaleFactor || 1,
  };
}

/**
 * 桌宠窗口几何：窗口 = 宠物 + 留白；位置 = 工作区右下角留出间距。
 * 全部用 CSS 像素（Electron 的 workArea 已是 CSS 像素），自己再乘 scaleFactor 会跑偏。
 */
function petWindowGeometry(display) {
  const d = display || screen.getPrimaryDisplay();
  const wa = d.workArea;
  const winSize = Math.round(petSize + PET_PADDING);
  return {
    width: winSize,
    height: winSize,
    x: Math.round(wa.x + wa.width - winSize - PET_MARGIN),
    y: Math.round(wa.y + wa.height - winSize - PET_MARGIN),
  };
}

// ---------- 桌宠窗口 ----------
function createPetWindow() {
  const geo = petWindowGeometry(displayForPet());

  petWin = new BrowserWindow({
    width: geo.width,
    height: geo.height,
    x: geo.x,
    y: geo.y,
    show: false, // 先不显示：等页面报登录态，未登录就直接开主窗口登录，避免闪一下
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // 与主窗口共用同一个 session/分区 → 登录态共享，数据自然互通
      partition: "persist:lighttodo",
    },
  });

  petWin.setAlwaysOnTop(true, "screen-saver");
  petWin.setVisibleOnAllWorkspaces(true);
  // 穿透由 startPetHoverWatch() 轮询控制（不依赖页面 DOM 事件：
  // Electron 的 forward:true 在浏览器内部链上会截断，页面收不到 mousemove → 永远解不开穿透）
  petWin.setIgnoreMouseEvents(true, { forward: true });

  petWin.loadURL(`${APP_URL}/?desktop=pet&mode=work`);

  petWin.webContents.on("did-finish-load", () => {
    petWin.webContents
      .executeJavaScript(
        `document.documentElement.classList.add('desktop-pet-mode');
         document.documentElement.style.background='transparent';
         document.body.style.background='transparent';`,
      )
      .catch(() => {});
    // 注入屏幕参数：页面据此算自适应尺寸（窗口只有 140px，不能拿窗口宽度当屏幕宽度）
    petWin.webContents.send("pet-display", displayMetrics(displayForPet()));
  });

  petWin.on("closed", () => {
    petWin = null;
    if (hoverTimer) { clearInterval(hoverTimer); hoverTimer = null; }
  });

  startPetHoverWatch();
}

/** 页面报来尺寸 / 屏幕变化后：重算窗口矩形并贴回工作区右下角 */
function applyPetSize() {
  if (!petWin || petWin.isDestroyed()) return;
  const display = displayForPet();
  const geo = petWindowGeometry(display);
  petWin.setBounds({ x: geo.x, y: geo.y, width: geo.width, height: geo.height });
  petWin.webContents.send("pet-display", displayMetrics(display));
}

// ---------- 主窗口（正常待办界面） ----------
function createMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show();
    mainWin.focus();
    return;
  }
  mainWin = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    title: "轻待办",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:lighttodo", // 与桌宠共享登录态
    },
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadURL(APP_URL);

  // 关主窗口 = 只隐藏（桌宠继续在）
  mainWin.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.on("closed", () => {
    mainWin = null;
  });
}

/** 收起主窗口（登录成功后调：用户要"登录完只剩桌宠"） */
function hideMainWindow() {
  if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) mainWin.hide();
}

// ---------- 托盘（关窗口后还能找回） ----------
function createTray() {
  // 用一个 16x16 的空图占位（没有图标文件时也能跑），有 icon.ico 则用真的
  let img;
  try {
    img = nativeImage.createFromPath(path.join(__dirname, "build", "icon.ico"));
    if (img.isEmpty()) throw new Error("empty");
  } catch {
    img = nativeImage.createEmpty();
  }
  tray = new Tray(img);
  tray.setToolTip("轻待办 · 桌宠在运行");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开轻待办主窗口", click: () => createMainWindow() },
      { label: "显示/隐藏桌宠", click: () => { if (petWin) petWin.isVisible() ? petWin.hide() : petWin.show(); } },
      { type: "separator" },
      { label: "退出", click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on("click", () => createMainWindow());
}

// ---------- 桌宠悬停轮询：鼠标进宠物区域 → 接管；移出 → 穿透 ----------
// 为什么用轮询：Electron 透明窗 + setIgnoreMouseEvents(forward) 时，页面**收不到**
// mousemove（事件在浏览器内部链被截断），所以"页面监听 pointermove 再解除穿透"是死循环。
// 主进程能拿到全局鼠标坐标（screen.getCursorScreenPoint），用它判定最可靠。
let hoverTimer = null;
/** 宠物实际占用的区域（相对窗口），由页面通过 pet-hitbox 上报（默认整个窗口） */
let petHitbox = null;

function startPetHoverWatch() {
  if (hoverTimer) clearInterval(hoverTimer);
  let ignoring = true;
  hoverTimer = setInterval(() => {
    if (!petWin || petWin.isDestroyed() || !petWin.isVisible()) return;
    const display = displayForPet();
    const scale = display.scaleFactor || 1;
    const { x: mx, y: my } = screen.getCursorScreenPoint(); // 物理像素
    const [wx, wy] = petWin.getPosition(); // DIP（CSS 像素）
    const [ww, wh] = petWin.getSize(); // DIP
    // 换算到窗口坐标系：高分屏下不除 scale，命中区域会整体偏掉
    const rx = mx / scale - wx;
    const ry = my / scale - wy;
    // 命中判定：有 hitbox 用 hitbox，否则整个窗口
    const hb = petHitbox || { x: 0, y: 0, w: ww, h: wh };
    const inside = rx >= hb.x && rx <= hb.x + hb.w && ry >= hb.y && ry <= hb.y + hb.h;
    if (inside && ignoring) {
      ignoring = false;
      petWin.setIgnoreMouseEvents(false);
    } else if (!inside && !ignoring) {
      ignoring = true;
      petWin.setIgnoreMouseEvents(true, { forward: true });
    }
  }, 60); // 60ms ≈ 16fps，足够跟手且不吃 CPU
}

// ---------- IPC ----------
ipcMain.on("pet-ignore", (_e, ignore) => {
  // 兼容旧调用（现在主要由主进程轮询控制）
  if (petWin && typeof ignore === "boolean") petWin.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on("pet-hitbox", (_e, box) => {
  // 页面上报宠物在窗口内的实际矩形（含聊天气泡），用于更精确的命中判定
  if (box && typeof box.x === "number") petHitbox = box;
});
ipcMain.on("pet-move", (_e, { dx, dy }) => {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
});
/** v3.9.4 尺寸自适应：页面算好尺寸报上来，窗口跟着变 */
ipcMain.on("pet-set-size", (_e, px) => {
  if (typeof px !== "number" || !isFinite(px) || px <= 0) return;
  const clamped = Math.max(40, Math.min(220, Math.round(px)));
  if (clamped === petSize) return; // 没变就别 resize（避免每次渲染抖动）
  petSize = clamped;
  applyPetSize();
});
/** 登录完成后收起主窗口，只留桌宠 */
ipcMain.on("close-main-window", () => hideMainWindow());
ipcMain.on("open-main-window", () => createMainWindow());

// 页面回报登录态：决定"直接显示桌宠"还是"先开主窗口登录"
// 注意：页面在"有本机会话"时会先乐观报 true（桌宠秒出现，体感"打开就是桌宠"），
// 若随后校验失败会补报 false → 这里必须处理"已显示桌宠后又报 false"的情况，
// 不能像早期版本那样"只认第一次"，否则会话失效的用户会卡在空桌宠、看不到登录窗。
ipcMain.on("login-state", (_e, loggedIn) => {
  if (loggedIn) {
    if (petWin && !petWin.isDestroyed() && !petWin.isVisible()) petWin.show();
    return;
  }
  // 未登录 / 会话失效：收起桌宠，弹登录窗口
  if (petWin && !petWin.isDestroyed() && petWin.isVisible()) petWin.hide();
  if (!mainWin || mainWin.isDestroyed() || !mainWin.isVisible()) createMainWindow();
});

ipcMain.handle("get-auto-launch", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("set-auto-launch", (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

// 兜底：6 秒还没收到任何登录态回报（页面加载失败/网络挂起）→ 弹主窗口，
// 别让用户对着一个不显示任何东西的桌面发呆。
let loginStateReported = false;
ipcMain.on("login-state", () => { loginStateReported = true; });
setTimeout(() => {
  if (loginStateReported) return;
  const win = petWin;
  if (!win || win.isDestroyed() || !win.isVisible()) createMainWindow();
}, 6000);

// ---------- 生命周期 ----------
app.whenReady().then(() => {
  createPetWindow(); // 桌宠先起来（页面报登录态后再决定显示/弹登录窗）
  createTray();
  // 屏幕变化（插拔显示器 / 改分辨率 / 改缩放）→ 重新定位并让页面重算尺寸
  screen.on("display-metrics-changed", () => applyPetSize());
  screen.on("display-added", () => applyPetSize());
  screen.on("display-removed", () => applyPetSize());
});

// 关掉所有窗口也不退出（桌宠常驻 + 托盘在）——用户要"关网页桌宠还在"
app.on("window-all-closed", () => {
  // 不 quit：交给托盘"退出"
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  else createMainWindow();
});
