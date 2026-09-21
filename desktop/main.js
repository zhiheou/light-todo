const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

/**
 * 轻待办 桌面版主进程（v3.9）
 *
 * 双窗口设计（用户要求）：
 *  - 主窗口：正常待办界面（和网页一样），关掉它 → 桌宠依然在
 *  - 桌宠窗口：透明、无边框、置顶、鼠标穿透，常驻桌面
 *  - 托盘图标：随时开主窗口 / 退出
 *
 * 数据：与网页版互通（同一账号）。桌面版首次需登录一次，之后本机缓存。
 *
 * 关键坑（调研得出）：
 *  - 透明窗口在部分 Windows 显卡驱动下会黑底 → disableHardwareAcceleration
 *  - 穿透要"动态切换"：鼠标进宠物区域才接管，移出立即恢复穿透
 *  - 置顶被全屏程序盖 → setAlwaysOnTop(true, "screen-saver")
 */

app.disableHardwareAcceleration(); // 防透明窗口黑底
app.commandLine.appendSwitch("enable-transparent-visuals");

const PET_SIZE = 140;
const APP_URL = process.env.LIGHT_TODO_URL || "https://todo.aebuiyke.xyz";

let petWin = null;
let mainWin = null;
let tray = null;
/** 真正退出（区分"关窗口"和"退出应用"） */
let quitting = false;

// ---------- 桌宠窗口 ----------
function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const scale = display.scaleFactor || 1;
  const size = Math.round(PET_SIZE * scale);

  petWin = new BrowserWindow({
    width: size,
    height: size,
    x: width - size - Math.round(40 * scale),
    y: height - size - Math.round(40 * scale),
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
  petWin.setIgnoreMouseEvents(true, { forward: true }); // 默认整窗穿透

  petWin.loadURL(`${APP_URL}/?desktop=pet&mode=work`);

  petWin.webContents.on("did-finish-load", () => {
    petWin.webContents
      .executeJavaScript(
        `document.documentElement.classList.add('desktop-pet-mode');
         document.documentElement.style.background='transparent';
         document.body.style.background='transparent';`,
      )
      .catch(() => {});
  });

  petWin.on("closed", () => {
    petWin = null;
  });
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

// ---------- IPC ----------
ipcMain.on("pet-ignore", (_e, ignore) => {
  if (petWin) petWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on("pet-move", (_e, { dx, dy }) => {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
});
ipcMain.on("open-main-window", () => createMainWindow());
ipcMain.handle("get-auto-launch", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("set-auto-launch", (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

// ---------- 生命周期 ----------
app.whenReady().then(() => {
  createPetWindow(); // 桌宠先起来
  createTray();
  // 主窗口稍后开（让桌宠先出现，用户第一眼看到宠物）
  setTimeout(() => createMainWindow(), 600);
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
