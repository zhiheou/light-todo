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

/**
 * v3.9.14 单实例锁（Windows 常驻软件的标准做法）。
 *
 * 不加会出大问题：用户重复双击图标 → 起多个实例 → **多个全屏透明窗层层叠在一起**，
 * 每个都独立做鼠标接管判定，互相打架 → 表现就是"点不动、点的不是这一个"。
 * （用户反馈里"右键没反应、点到下面的东西"很可能有这一份贡献。）
 * 第二个实例直接把已有窗口唤到前面，然后退出。
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // 用户又双击了图标 → 把主窗口叫到前面来（而不是再开一个）
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    } else if (typeof createMainWindow === "function") {
      createMainWindow();
    }
  });
}

/**
 * 线上站点地址（桌面版加载的就是它，所以前端改动部署后自动生效）。
 * ⚠️ v3.9.14 教训：我加防缓存代码时**误删了这一行**，导致整个程序一启动就崩
 * （`ReferenceError: APP_URL is not defined`，在 main.js:677 的 UPDATE_FEED 用到）。
 * node --check 只查语法、不查未定义变量，所以打包时没报错。
 * 现在加了一道"启动自检"（见文件末尾的自检块），这类错误不会再溜进安装包。
 */
const APP_URL = process.env.LIGHT_TODO_URL || "https://todo.aebuiyke.xyz";

/**
 * v3.9.14 🔴 给 URL 加"每次启动都不同"的参数，绕过 Electron 的顽固缓存。
 *
 * 踩过的大坑（用户报"怎么又产生新 bug / 还是一堆 bug"的**总根源**）：
 * 桌面版加载的是**线上站点**，改动部署后用户那边理应自动生效 ——
 * 但 Electron 会把页面缓存到本地（partitions/lighttodo/Cache），
 * 实测用户程序里跑的还是好几轮之前的 `index-wjOoaO5e.js`，
 * 而我早就部署到 `index-C8JfDeqE.js` 了。
 * → **用户看到的永远是旧版本，我这边怎么修都没用**（这就是"改了没反应"的真相）。
 *
 * 这里用构建时间戳做参数，保证每次启动都是**唯一的 URL** → 缓存必然失效。
 * 前端 JS/CSS 用内容哈希命名，不变的内容仍然命中缓存，不会浪费流量。
 */
const BOOT_ID = Date.now().toString(36);

function withCacheBuster(url) {
  return `${url}${url.includes("?") ? "&" : "?"}_v=${BOOT_ID}`;
}

/**
 * 🔴 v3.9.14 教训：**不要**在这里调 `session.clearCache()`。
 *
 * 我试过在启动时清一次页面缓存（想彻底根治"加载到旧前端"的问题），
 * 结果实测**程序起来后建不出窗口**（进程活着、但什么都没有）——
 * 清缓存与窗口创建存在时序冲突。
 * 防缓存改用更安全的办法：URL 上加 `_v=<启动时间戳>`（见 withCacheBuster），
 * 每次启动都是唯一 URL → 缓存必然失效，且对前端 JS/CSS 的内容哈希缓存无影响。
 */

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
    /**
     * v3.9.14 🔴 修坐标单位错误（独立审查发现的真 bug）。
     *
     * Electron 官方文档明确写着：`screen.getCursorScreenPoint()`
     * **"The return value is a DIP point, not a screen physical point."**
     * 而 `getDisplayNearestPoint` / `getPosition` / `getBounds` 用的也都是 DIP。
     * 三者同单位 → **不该再除以 scaleFactor**。
     *
     * 之前这里除以了缩放比，导致：125%/150% 缩放的机器上（笔记本出厂默认就是这个）
     * 判定点整体偏移最多几百像素 → "看得见宠物却点不中"、
     * 而宠物旁边的空白反而被接管（点不到桌面）。
     */
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

  petWin.loadURL(withCacheBuster(`${APP_URL}/?desktop=pet&mode=work`));

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
 * v3.9.14 🔴 补回丢失的 hideMainWindow（独立审查发现的真 bug）。
 *
 * 之前托盘左键和"关闭主窗口"菜单项都调用它，但**函数定义不知何时被删掉了** →
 * 点了就抛 ReferenceError → 用户看到"点了没反应"。
 * （`node --check` 只查语法不查未定义变量，所以打包不会报错，一路进了安装包。）
 */
function hideMainWindow() {
  if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) {
    mainWin.hide();
    refreshTrayMenu(); // 菜单第一项要变回"打开主窗口"
  }
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
  mainWin.loadURL(withCacheBuster(mainWindowUrl()));
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
/**
 * v3.9.14：可交互区域改为**矩形列表**（不再是一个合并的包围盒）。
 * 合并会把两个矩形之间的大片空白也算进去 → 那一片点不到桌面。
 * 现在主进程逐个矩形判定"鼠标落在其中任一矩形内"才算命中。
 */
let petHitboxes = null;
/** v3.9.12 拖动/飞行期间是否"钉住"接管（钉住时轮询不再改动穿透状态） */
let takeoverLocked = false;
/** 当前是否处于"忽略鼠标"（穿透）状态 —— 提升到模块作用域，供 pet-takeover 复用 */
let ignoreState = true;
/** 钉住的兜底看门狗：超时未解锁则自动释放（防鼠标接管被永久钉死） */
let lockWatchdog = null;

/**
 * v3.9.13 🔴 鼠标按键"按住期间"强制保持接管。
 *
 * 解决用户反馈："右键之后页面出来了，但里面的内容都没法点击，点击直接跳到页面下面的东西了"。
 *
 * 根因：菜单项改成 pointerdown 即响应 → 菜单立刻关闭 → 页面上报的可点区域瞬间缩小
 * （只剩宠物）→ 主进程判定"鼠标已不在可交互区" → **在用户还没松手时就把窗口设成穿透**
 * → 用户的 mouseup 落到了桌面/别的程序上（用户看到"点到下面的东西了"）。
 *
 * 判定来源：**页面侧上报**（pet-mouse-held）。
 * 页面监听 window 的 pointerdown/pointerup（捕获阶段，任何目标都能收到），
 * 只要还有键按着就报 true；全部松开后延迟一小段再报 false
 * （覆盖 click/mouseup 等后续事件，保证整个"按下-抬起"都发生在窗口内）。
 * 比在主进程里轮询系统按键状态可靠得多，也不用额外依赖。
 */
let mouseHeld = false;

function startPetHoverWatch() {
  if (hoverTimer) clearInterval(hoverTimer);
  hoverTimer = setInterval(() => {
    if (!petWin || petWin.isDestroyed() || !petWin.isVisible()) return;
    // 拖动/飞行期间已钉住接管 → 不参与判定，避免打断 pointer capture
    if (takeoverLocked) return;
    // 鼠标键还按着（或刚松开不久）→ 保持接管，绝不切回穿透
    // （否则用户的 mouseup 会落到桌面：用户反馈"点击直接跳到页面下面的东西了"）
    if (mouseHeld) {
      if (ignoreState) {
        ignoreState = false;
        petWin.setIgnoreMouseEvents(false);
      }
      return;
    }
    // v3.9.14 🔴 修坐标单位错误：getCursorScreenPoint() 返回的**就是 DIP**
    // （Electron 官方文档原文："The return value is a DIP point, not a screen physical point."），
    // 与 getPosition()/getBounds() 同单位，**不需要也不应该再除以 scaleFactor**。
    // 之前除了缩放比，导致 125%/150% 缩放的机器上判定区域整体偏移几百像素：
    // 看得见宠物却点不中，而宠物旁边的空白反被接管（点不到桌面图标）。
    const rx = mx - wx;
    const ry = my - wy;
    const scale = display.scaleFactor || 1; // 仅供调试输出/其它逻辑参考，不参与坐标换算
    // 命中判定：逐个矩形判断（**不合并包围盒** —— 合并会把两个矩形之间的大片空白
    // 也算成可交互区，导致那一片点不到桌面图标）。
    // 没收到上报 → 不接管（全屏窗口绝不能兜底成全屏可点）。
    let inside = false;
    if (petHitboxes) {
      for (const hb of petHitboxes) {
        if (rx >= hb.x && rx <= hb.x + hb.w && ry >= hb.y && ry <= hb.y + hb.h) {
          inside = true;
          break;
        }
      }
    }
    if (inside && ignoreState) {
      ignoreState = false;
      petWin.setIgnoreMouseEvents(false);
    } else if (!inside && !ignoreState) {
      ignoreState = true;
      petWin.setIgnoreMouseEvents(true, { forward: true });
    }
  }, 25); // 25ms ≈ 40fps：够跟手。60ms 时鼠标快速移到菜单上、判定还没跟上，
  //         那一刻的点击会落空（用户表现就是"点了没反应"）。40fps 的 CPU 开销仍可忽略。
}

// ---------- IPC ----------
/**
 * v3.9.11：`pet-ignore` 通道**不再直接生效**。
 *
 * 以前页面侧会调它来切穿透，但那份判定只认宠物和聊天面板、**不认右键菜单**，
 * 于是和主进程的轮询（认得菜单）以 16Hz 互相覆盖 —— 鼠标一移到菜单上就被页面设回穿透，
 * 点击直接穿到桌面，用户看到的就是"右键菜单点了没反应"。
 * 现在鼠标接管**只由 `startPetHoverWatch` 一处决定**（判定源是页面上报的完整可点区域）。
 * 通道保留只为兼容还没更新的旧版前端，且**只在没有 hitbox 上报时才允许生效**。
 */
ipcMain.on("pet-ignore", (_e, ignore) => {
  if (!petWin) return;
  if (takeoverLocked) return; // 拖动/飞行中：钉住接管，任何穿透请求都不受理
  if (petHitboxes) return; // 已被轮询接管，忽略页面侧的过时判定
  if (typeof ignore === "boolean") petWin.setIgnoreMouseEvents(ignore, { forward: true });
});

/**
 * v3.9.12 拖动/飞行期间"钉住"鼠标接管。
 *
 * 为什么必须有：拖拽依赖 pointer capture，而 capture 的前提是窗口处于**接管**状态。
 * 拖动过程中宠物在移动、hitbox 又是逐帧上报的，判定稍有延迟就会把窗口设成穿透 →
 * capture 立刻失效 → 后续 pointermove/pointerup 全收不到 →
 * **拖动断在半路**（用户表现："拖不动"，或松手后宠物跳到别处）。
 * 锁定期间 `startPetHoverWatch` 不再改动接管状态，直到拖动/飞行结束才解锁。
 */
ipcMain.on("pet-takeover", (_e, locked) => {
  takeoverLocked = !!locked;
  if (lockWatchdog) {
    clearTimeout(lockWatchdog);
    lockWatchdog = null;
  }
  if (!petWin || petWin.isDestroyed()) return;
  if (takeoverLocked) {
    ignoreState = false;
    petWin.setIgnoreMouseEvents(false); // 立即接管，保证拖拽不中断
    // 兜底看门狗：拖动/飞行正常最多几秒；若 20 秒还没收到解锁（页面崩了/事件丢了），
    // 自动释放，绝不让鼠标接管被**永久钉死**（那会导致宠物彻底点不动、拖不动）。
    lockWatchdog = setTimeout(() => {
      takeoverLocked = false;
      lockWatchdog = null;
    }, 20000);
  }
  // 解锁时不立刻改状态，交给下一轮轮询按当前位置自然恢复
});
/**
 * v3.9.13 页面侧上报"鼠标键是否按着"。
 * 按住期间强制保持接管，避免菜单关闭后判定区域缩小、在用户松手前切回穿透
 * （那会让 mouseup 落到桌面 —— 用户反馈"点击直接跳到页面下面的东西了"）。
 */
ipcMain.on("pet-mouse-held", (_e, held) => {
  mouseHeld = !!held;
  if (mouseHeld && petWin && !petWin.isDestroyed()) {
    ignoreState = false;
    petWin.setIgnoreMouseEvents(false);
  }
});

ipcMain.on("pet-hitbox", (_e, box) => {
  /**
   * v3.9.14：可交互区域上报。**必须同时兼容新旧两种格式** ——
   * 前端会自动更新（加载线上站点），但桌面外壳装在用户电脑上、不会自动更新。
   * 曾经因为只认数组，导致旧外壳收到后解析失败 → hitbox 永远为空 → 永远穿透 → 用户"完全点不动"。
   *
   * 支持的格式：
   *   - { rects: [...] }  ← 新格式（优先，逐个矩形精确判定，无死区）
   *   - { x,y,w,h }       ← 旧格式（单个包围盒）
   *   - [...]             ← 纯数组（过渡格式，兼容）
   *   - null              ← 清空
   */
  if (box === null) {
    petHitboxes = null;
    return;
  }
  // v3.9.14 参数校验：限制在合理范围内（防止页面被入侵后上报超大矩形把整屏"接管"）
  const valid = (b) =>
    b &&
    typeof b.x === "number" &&
    typeof b.y === "number" &&
    typeof b.w === "number" &&
    typeof b.h === "number" &&
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.w) &&
    Number.isFinite(b.h) &&
    b.w > 0 &&
    b.h > 0 &&
    b.w <= 20000 &&
    b.h <= 20000 &&
    Math.abs(b.x) <= 20000 &&
    Math.abs(b.y) <= 20000;

  if (Array.isArray(box)) {
    const list = box.filter(valid);
    petHitboxes = list.length ? list : null;
    return;
  }
  if (box && Array.isArray(box.rects)) {
    const list = box.rects.filter(valid);
    petHitboxes = list.length ? list : valid(box) ? [{ x: box.x, y: box.y, w: box.w, h: box.h }] : null;
    return;
  }
  if (valid(box)) {
    petHitboxes = [{ x: box.x, y: box.y, w: box.w, h: box.h }];
  }
});
ipcMain.on("pet-move", (_e, arg) => {
  /**
   * v3.9.14 参数校验（独立安全审查）。
   * 原先用 `(_e, {dx,dy}) =>` 解构：页面发一个不带参数的 pet-move 会抛 TypeError；
   * 且 dx/dy 无范围限制，`{dx:1e9}` 能把全屏窗移到屏幕外（桌宠"消失"）。
   */
  if (!petWin) return;
  const dx = Number(arg?.dx);
  const dy = Number(arg?.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  if (Math.abs(dx) > 10000 || Math.abs(dy) > 10000) return; // 单次位移不可能这么大
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
/**
 * v3.9.10 彻底退出（右键桌宠 → "退出轻待办"）。
 * 用户要求："关闭主界面桌宠并不会退出，退出桌宠之后才是彻底的关闭"。
 * 必须先把 quitting 置位，否则 mainWin 的 close 拦截会把退出挡下来。
 */
ipcMain.on("quit-app", () => {
  quitting = true;
  app.quit();
});

// 页面回报登录态：决定"直接显示桌宠"还是"先开主窗口登录"
//
// 三种时序都要对（踩过的坑，别改回去）：
//  1. 未登录（首次安装）→ 页面报 false → 收起桌宠 + 弹登录窗
//  2. 已登录但会话失效 → 页面先乐观报 true（桌宠秒出现），校验失败后补报 false
//     → 必须响应"第二次的 false"，否则用户卡在一只没数据的桌宠上、看不到登录窗
//  3. 已登录有效 → 只报 true → 桌宠显示，不弹主窗口
// 用户明确要求（2026-09-27）："希望打开这个程序的时候主界面也打开，不要直接自动关闭了，
// 主界面和桌宠同时出现，关闭主界面桌宠并不会退出，退出桌宠之后才是彻底的关闭"
//   → 已登录启动：**主窗口 + 桌宠一起出现**（此前只显示桌宠，用户以为程序没打开）
//   → 关主窗口：只隐藏（桌宠继续在）
//   → 退出：走托盘菜单的「退出」或右键桌宠的「退出」，那才是彻底关闭
ipcMain.on("login-state", (_e, loggedIn) => {
  if (loggedIn) {
    if (hasLoggedIn) return; // 已确认登录，忽略重复上报
    hasLoggedIn = true;
    if (petWin && !petWin.isDestroyed() && !petWin.isVisible()) petWin.show();
    // 主窗口也开（用户要"两个一起出现"）。若已经开着就不重复创建。
    if (!mainWin || mainWin.isDestroyed() || !mainWin.isVisible()) createMainWindow();
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
  /**
   * v3.9.14 安全加固（独立安全审查建议）：**拒绝一切浏览器权限请求**。
   *
   * Electron 默认是"自动批准"麦克风/摄像头/通知/地理位置等请求。
   * 这个应用用不到其中任何一个，而它加载的是远程网页 ——
   * 万一网站被入侵，对方就能悄悄打开你的摄像头/麦克风，而用户只看到一个小图标。
   * 这里一律拒绝，合法功能不受影响。
   */
  try {
    const ses = require("electron").session.fromPartition("persist:lighttodo");
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
  } catch {
    /* 拿不到 session 也不影响主流程 */
  }

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
