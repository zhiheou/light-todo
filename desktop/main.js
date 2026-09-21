const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

/**
 * 轻待办 桌面版主进程（v3.9）
 *
 * 目标：桌宠常驻桌面（透明、无边框、置顶、鼠标穿透），点击弹对话。
 * 策略：直接加载线上站点 + ?desktop=pet（复用全部现有代码，零重写）。
 *
 * 关键坑（调研得出）：
 *  - 透明窗口在部分 Windows 显卡驱动下会黑底 → disableHardwareAcceleration
 *  - 穿透要"动态切换"：鼠标进宠物区域才接管，移出立即恢复穿透
 */

app.disableHardwareAcceleration(); // 防透明窗口黑底
app.commandLine.appendSwitch("enable-transparent-visuals");

const PET_SIZE = 140;
const APP_URL = process.env.LIGHT_TODO_URL || "https://todo.aebuiyke.xyz";

let petWin = null;

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const scale = display.scaleFactor || 1;

  petWin = new BrowserWindow({
    width: Math.round(PET_SIZE * scale),
    height: Math.round(PET_SIZE * scale),
    x: width - Math.round((PET_SIZE + 40) * scale),
    y: height - Math.round((PET_SIZE + 40) * scale),
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
    },
  });

  // 置顶到最高层（防被全屏程序盖住）
  petWin.setAlwaysOnTop(true, "screen-saver");
  petWin.setVisibleOnAllWorkspaces(true);

  // 默认整窗穿透：透明区域完全不影响其他程序
  petWin.setIgnoreMouseEvents(true, { forward: true });

  const url = `${APP_URL}/?desktop=pet&mode=work`;
  petWin.loadURL(url);

  petWin.webContents.on("did-finish-load", () => {
    // 确保页面背景透明（透明窗口才能看到"只有宠物"）
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

// 页面侧动态切换穿透：鼠标进入宠物像素时接管，移出恢复穿透
ipcMain.on("pet-ignore", (_e, ignore) => {
  if (petWin) petWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

// 拖动宠物窗口（页面里拖拽时调用，避免和"甩飞"冲突时窗口不跟手）
ipcMain.on("pet-move", (_e, { dx, dy }) => {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
});

// 开关机自启
ipcMain.handle("get-auto-launch", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("set-auto-launch", (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

app.whenReady().then(createPetWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});
