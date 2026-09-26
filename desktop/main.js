const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

/**
 * 轻待办 桌面版主进程（v3.9.5）
 *
 * 双窗口设计：
 *  - 桌宠窗口：**铺满整块屏幕**的透明窗（置顶 + 鼠标穿透），宠物因此能在**整个桌面**上活动。
 *  - 主窗口：完整的网页版界面（和浏览器里一模一样），登录后**保持打开**；
 *    可手动关闭（关了不影响桌宠），托盘随时叫回来。
 *    带 `?pet=off` —— 宠物只在全屏窗里渲染一份，避免两处坐标基准不同导致位置对不上。
 *  - 托盘图标：随时开主窗口 / 退出
 *
 * v3.9.5 为什么把桌宠窗改成全屏（用户反馈原文："宠物为什么只能在右下角移动，
 * 而不是整个桌面都可以动"）：此前窗口 = 宠物 + 留白的小方块，宠物被限制在那一小块里。
 * 改成全屏后，窗口坐标 == 屏幕坐标，拖拽/甩飞的物理逻辑可直接复用，
 * 也省掉了"跨窗口同步位置"这类容易出 bug 的设计。
 *
 * 尺寸自适应：宠物渲染尺寸 = 屏幕宽 ÷ 15，夹 [88,128]，再乘用户选的 s/m/l 比例。
 * 窗口本身固定铺满，不随宠物大小变化。
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

const APP_URL = process.env.LIGHT_TODO_URL || "https://todo.aebuiyke.xyz";

let petWin = null;
let mainWin = null;
let tray = null;
/** 真正退出（区分"关窗口"和"退出应用"） */
let quitting = false;
/** 是否已确认登录（用于忽略重复上报，见 login-state 处理器） */
let hasLoggedIn = false;

// 屏幕参数注入：用 executeJavaScript 直接写进页面的 window。
//
// 为什么不用 webContents.send + preload 的 ipcRenderer.on：
// 实测那条路在这套配置下收不到（页面读到的仍是窗口宽度 160 而非屏幕 2560），
// 而 executeJavaScript 是主进程→渲染进程最可靠的通道，且能在 did-finish-load 后立刻生效。
// 页面侧 PetShell 通过 pet-display 自定义事件感知变化。
function injectDisplayMetrics(target) {
  if (!target || target.isDestroyed()) return;
  const m = displayMetrics(displayForPet());
  target.webContents
    .executeJavaScript(
      `window.petDisplay = ${JSON.stringify(m)};
       window.dispatchEvent(new CustomEvent('pet-display'));`,
    )
    .catch(() => {});
}
/** 当前鼠标所在的显示器（桌宠跟着用户走，多屏不出错） */
function displayForPet() {
  try {
    // getCursorScreenPoint 返回物理像素，getDisplayNearestPoint 按 DIP 判定；
    // 混合 DPI 多屏下必须先换算，否则可能选中错误的显示器（桌宠"跟随鼠标"会跳错屏）
    const pt = screen.getCursorScreenPoint();
    const rough = screen.getDisplayNearestPoint(pt);
    const s = rough.scaleFactor || 1;
    const dip = { x: Math.round(pt.x / s), y: Math.round(pt.y / s) };
    return screen.getDisplayNearestPoint(dip);
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
 * 桌宠窗口几何。
 *
 * v3.9.5 改：窗口铺满**整块屏幕**（透明 + 鼠标穿透），宠物才能在整个桌面上跑 ——
 * 之前是"宠物 + 留白"的小窗口，宠物只能在那一小块里挪，用户明确反馈"不能整个桌面动"。
 * 因为窗口就是全屏，窗口坐标 == 屏幕坐标，拖拽/甩飞的物理逻辑可以直接复用，
 * 也不用做跨窗口位置同步（那种同步很容易出 bug）。
 *
 * 用 bounds 而非 workArea：全屏要盖住任务栏那一条，否则宠物跑到底部会掉进任务栏后面。
 */
function petWindowGeometry(display) {
  const d = display || screen.getPrimaryDisplay();
  const b = d.bounds;
  return {
    width: Math.round(b.width),
    height: Math.round(b.height),
    x: Math.round(b.x),
    y: Math.round(b.y),
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
         document.body.style.background='transparent';
         // 标记"全屏桌宠窗"：页面据此知道屏幕坐标 == 窗口坐标（拖拽/甩飞可直接复用）
         window.petFullscreen = true;`,
      )
      .catch(() => {});
    // 注入屏幕参数：页面据此算自适应尺寸（窗口是全屏，但仍以 workArea 为准算宠物大小）
    injectDisplayMetrics(petWin);
  });

  petWin.on("closed", () => {
    petWin = null;
    if (hoverTimer) { clearInterval(hoverTimer); hoverTimer = null; }
  });

  startPetHoverWatch();
}

/** 主窗口（普通窗口）要带上 ?pet=off：桌面版里只让全屏桌宠窗渲染宠物，避免墙纸/坐标错位 */
function mainWindowUrl() {
  return `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}pet=off`;
}

/**
 * 屏幕变化（换显示器/改分辨率/改缩放）后重新铺满。
 *
 * 注意：不再由 `pet-set-size` 触发 —— 窗口自 v3.9.5 起是固定的"铺满整屏"，
 * 宠物大小只影响页面内的渲染尺寸，**不需要 resize 窗口**。
 * （早期版本窗口 = 宠物 + 留白，所以页面报尺寸时要跟着 resize；
 *   现在若还那样做，每次页面重算尺寸都会 setBounds 一整屏，造成无谓的重排。）
 */
function applyPetGeometry() {
  if (!petWin || petWin.isDestroyed()) return;
  const display = displayForPet();
  const geo = petWindowGeometry(display);
  const cur = petWin.getBounds();
  // 已经铺满就不动（避免抖动）
  if (
    cur.x === geo.x &&
    cur.y === geo.y &&
    cur.width === geo.width &&
    cur.height === geo.height
  ) {
    return;
  }
  petWin.setBounds({ x: geo.x, y: geo.y, width: geo.width, height: geo.height });
  injectDisplayMetrics(petWin);
}

// ---------- 主窗口（正常待办界面） ----------
function createMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.show();
    mainWin.focus();
    refreshTrayMenu();
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
  mainWin.loadURL(mainWindowUrl());
  mainWin.once("ready-to-show", () => refreshTrayMenu());

  // 关主窗口 = 只隐藏（桌宠继续在）
  mainWin.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
      refreshTrayMenu(); // 托盘菜单第一项要跟着变成"打开主窗口"
    }
  });
  mainWin.on("closed", () => {
    mainWin = null;
    refreshTrayMenu();
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
  tray.setToolTip("轻待办 · 桌宠在运行（双击我打开主界面）");
  refreshTrayMenu();
  // 左键点托盘 = 快速切换主窗口（和大多数常驻软件一致）
  tray.on("click", () => {
    if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) hideMainWindow();
    else createMainWindow();
  });
  // 双击 = 直接打开主界面（用户反馈"主窗口关掉后找半天找不到"，给个最快的手势）
  tray.on("double-click", () => createMainWindow());
}

/**
 * 重建托盘菜单（每次右键时按当前状态重新生成）。
 *
 * 为什么要动态生成：标准的常驻软件里，托盘菜单第一项会跟着窗口状态变
 * （窗口开着就显示"关闭主窗口"，关着就显示"打开主窗口"）。
 * 之前是写死"打开轻待办主窗口"，主窗口开着时右键看菜单会以为没开、点了也没反馈。
 * 同时补上"关闭主窗口"入口 —— 否则用户只能去点窗口的 ✕ 才能收起，不好找。
 */
function refreshTrayMenu() {
  if (!tray) return;
  const mainVisible = !!mainWin && !mainWin.isDestroyed() && mainWin.isVisible();
  const petVisible = !!petWin && !petWin.isDestroyed() && petWin.isVisible();

  // v3.9.8 更新项：有新版/下载中/等重启时，托盘里直接给入口（用户不用找）
  const updateItem = (() => {
    if (updateState.status === "available") {
      return { label: `⬆️ 有新版本 ${updateState.version}，点击更新`, click: () => void beginUpdateDownload() };
    }
    if (updateState.status === "downloading") {
      return { label: `正在下载更新 ${updateState.percent}%…`, enabled: false };
    }
    if (updateState.status === "ready") {
      return { label: "✅ 更新已就绪，点击重启生效", click: () => installUpdateNow() };
    }
    return null;
  })();

  tray.setContextMenu(
    Menu.buildFromTemplate([
      mainVisible
        ? { label: "关闭主窗口（桌宠继续在）", click: () => hideMainWindow() }
        : { label: "打开轻待办主窗口", click: () => createMainWindow() },
      {
        label: petVisible ? "隐藏桌宠" : "显示桌宠",
        click: () => {
          if (!petWin || petWin.isDestroyed()) return;
          if (petWin.isVisible()) petWin.hide();
          else petWin.show();
          refreshTrayMenu(); // 状态变了，菜单文案跟着更新
        },
      },
      ...(updateItem ? [{ type: "separator" }, updateItem] : []),
      { type: "separator" },
      { label: "退出（桌宠和窗口一起关掉）", click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

/** 开始下载更新（托盘与页面共用） */
async function beginUpdateDownload() {
  try {
    const { autoUpdater } = require("electron-updater");
    await autoUpdater.downloadUpdate();
  } catch {
    /* 失败已由 error 事件反映到 updateState */
  }
}

/** 立即重启并安装更新 */
function installUpdateNow() {
  try {
    const { autoUpdater } = require("electron-updater");
    quitting = true; // 放行窗口 close 拦截，否则安装程序替换不了文件
    autoUpdater.quitAndInstall(false, true);
  } catch {
    /* 忽略 */
  }
}

// ---------- 桌宠悬停轮询：鼠标进宠物区域 → 接管；移出 → 穿透 ----------
// 为什么用轮询：Electron 透明窗 + setIgnoreMouseEvents(forward) 时，页面**收不到**
// mousemove（事件在浏览器内部链被截断），所以"页面监听 pointermove 再解除穿透"是死循环。
// 主进程能拿到全局鼠标坐标（screen.getCursorScreenPoint），用它判定最可靠。
//
// v3.9.5：窗口改成**铺满整屏**后，命中判定不能再用"整个窗口"兜底 ——
// 那会让整块屏幕都抢鼠标、什么都点不中。所以必须由页面上报宠物的真实矩形，
// 没收到上报之前一律保持穿透（安全默认）。
let hoverTimer = null;
/** 宠物实际占用的区域（相对窗口 CSS 像素），由页面通过 pet-hitbox 上报 */
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
    // 换算到窗口坐标系：高分屏下不除 scale，命中区域会整体偏掉
    const rx = mx / scale - wx;
    const ry = my / scale - wy;
    // 命中判定：只认页面上报的矩形；没上报 → 不接管（全屏窗口绝不能兜底成全屏可点）
    const hb = petHitbox;
    const inside = !!hb && rx >= hb.x && rx <= hb.x + hb.w && ry >= hb.y && ry <= hb.y + hb.h;
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
  // 页面上报"宠物 + 展开的聊天面板"的实际矩形（窗口 CSS 像素坐标）。
  // 传 null 表示暂时没有可交互区域（例如宠物被隐藏）→ 整窗穿透。
  if (box === null) {
    petHitbox = null;
    return;
  }
  if (box && typeof box.x === "number" && typeof box.w === "number") petHitbox = box;
});
ipcMain.on("pet-move", (_e, { dx, dy }) => {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
});
/**
 * v3.9.5：宠物大小完全由页面决定（屏幕宽÷15 夹 [88,128] × s/m/l 比例）。
 * 窗口固定铺满整屏，所以主进程**不需要**跟着 resize —— 这两个通道保留只为兼容旧页面调用。
 */
ipcMain.on("pet-set-size", () => {
  /* 窗口已是全屏，尺寸只影响页面内渲染，无需处理 */
});
ipcMain.on("pet-chat-open", () => {
  /* 窗口已是全屏，面板本来就装得下，无需 resize */
});
/**
 * v3.9.5：登录完成后**不再收起主窗口**。
 *
 * 用户反馈（2026-09-26）原话："登录之后为什么没有网页版的那种页面展示……网页版的功能不能丢呀"
 * 之前做成"登录完只留桌宠、大窗口自动藏起来"，是把"桌宠自动出现"理解成了"替掉主界面"。
 * 正确行为：**主窗口（完整网页版界面）和桌宠同时存在**。
 * 主窗口仍然可以手动关掉——关了不影响桌宠，托盘随时能叫回来。
 */
ipcMain.on("close-main-window", () => {
  /* 保留通道（老版本页面可能仍会调用），但不再收起窗口 */
});
ipcMain.on("open-main-window", () => createMainWindow());

// 页面回报登录态：决定"直接显示桌宠"还是"先开主窗口登录"
//
// 三种时序都要对（踩过的坑，别改回去）：
//  1. 未登录（首次安装）→ 页面报 false → 收起桌宠 + 弹登录窗
//  2. 已登录但会话失效 → 页面先乐观报 true（桌宠秒出现），校验失败后补报 false
//     → 必须响应"第二次的 false"，否则用户卡在一只没数据的桌宠上、看不到登录窗
//  3. 已登录有效 → 只报 true → 桌宠显示，不弹主窗口
ipcMain.on("login-state", (_e, loggedIn) => {
  if (loggedIn) {
    if (hasLoggedIn) return; // 已确认登录，忽略重复上报（避免登出瞬间的乱序把登录窗顶掉）
    hasLoggedIn = true;
    if (petWin && !petWin.isDestroyed() && !petWin.isVisible()) petWin.show();
    return;
  }
  // 未登录 / 会话失效
  const wasLoggedIn = hasLoggedIn;
  hasLoggedIn = false;
  if (petWin && !petWin.isDestroyed() && petWin.isVisible()) petWin.hide();
  // 从"已登录"变成"未登录"（登出/会话失效）：让桌宠窗口重新加载。
  // 否则它里面的 React 仍停在登录态，下次登录后显示的是一份过期状态。
  // 重新加载后 DesktopPetApp 会重新读 localStorage（此时已清空）并如实回报 false。
  if (wasLoggedIn && petWin && !petWin.isDestroyed()) {
    petWin.webContents.reload();
  }
  if (!mainWin || mainWin.isDestroyed() || !mainWin.isVisible()) createMainWindow();
});

ipcMain.handle("get-auto-launch", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("set-auto-launch", (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
  return app.getLoginItemSettings().openAtLogin;
});

// ---------- 自动更新（v3.9.8） ----------
//
// 用户反馈："为啥每一次更新都是需要重新安装的，正常的应用不应该页面会显示更新，
// 然后点击更新覆盖什么的吗" —— 对，这是标准能力，之前没做。
//
// 更新源用我们自己的域名（/dl/），不依赖 GitHub（国内连不上，用户下载也会卡）。
// 流程：主进程定时查 /dl/latest.yml → 有新版本就在托盘和窗口里提示 → 用户点更新
//      → 后台下载 → 下完提示重启 → 自动装好，全程不用手动重装。
const UPDATE_FEED = `${APP_URL.replace(/\/+$/, "")}/dl/`;
/** 检查间隔：6 小时（够及时，也不浪费请求） */
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 更新状态：给页面显示用 */
let updateState = { status: "idle", version: "", percent: 0, error: "" };

function initAutoUpdate() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return; // 开发环境下没装也不该崩
  }
  // 不自动下载：让用户点一下再下（体积 78MB，别偷偷占带宽）
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED });

  const push = (patch) => {
    updateState = { ...updateState, ...patch };
    // 广播给所有窗口（页面据此显示"发现新版本"横幅）
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("update-state", updateState);
    }
    refreshTrayMenu();
  };

  autoUpdater.on("update-available", (info) => push({ status: "available", version: info?.version || "" }));
  autoUpdater.on("update-not-available", () => push({ status: "latest", version: "", percent: 0 }));
  autoUpdater.on("download-progress", (p) => push({ status: "downloading", percent: Math.round(p?.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => push({ status: "ready", version: info?.version || "", percent: 100 }));
  autoUpdater.on("error", (err) => push({ status: "error", error: String(err?.message || err) }));

  const check = () => {
    // 只在能连通时静默检查；失败不打扰用户（网络问题不是用户的错）
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(check, 15000); // 启动 15 秒后查一次（别和首屏抢资源）
  setInterval(check, UPDATE_INTERVAL_MS);
}

/** 页面请求：现在是什么更新状态 / 手动检查 / 开始下载 / 立即重启安装 */
ipcMain.handle("update-get-state", () => updateState);
ipcMain.handle("update-check", async () => {
  try {
    const { autoUpdater } = require("electron-updater");
    await autoUpdater.checkForUpdates();
    return updateState;
  } catch (err) {
    updateState = { ...updateState, status: "error", error: String(err?.message || err) };
    return updateState;
  }
});
ipcMain.handle("update-download", async () => {
  try {
    const { autoUpdater } = require("electron-updater");
    await autoUpdater.downloadUpdate();
    return updateState;
  } catch (err) {
    updateState = { ...updateState, status: "error", error: String(err?.message || err) };
    return updateState;
  }
});
ipcMain.on("update-install", () => {
  try {
    const { autoUpdater } = require("electron-updater");
    quitting = true; // 放行窗口 close 拦截，让安装程序能替换文件
    autoUpdater.quitAndInstall(false, true);
  } catch {
    /* 忽略：装不了就等下次 */
  }
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
  initAutoUpdate(); // v3.9.8 自动更新：启动后静默检查新版本
  // 屏幕变化（插拔显示器 / 改分辨率 / 改缩放）→ 重新定位并让页面重算尺寸
  screen.on("display-metrics-changed", () => applyPetGeometry());
  screen.on("display-added", () => applyPetGeometry());
  screen.on("display-removed", () => applyPetGeometry());
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
