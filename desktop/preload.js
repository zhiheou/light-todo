const { contextBridge, ipcRenderer } = require("electron");

/**
 * 屏幕参数：主进程用 executeJavaScript 写进页面的 window.petDisplay，页面直接读。
 *
 * 为什么不用 webContents.send + ipcRenderer.on：实测那条路在这套配置下收不到，
 * 页面读到的仍是窗口宽度（160）而非屏幕宽度（2560），自适应退化成固定小尺寸。
 * 也不要在这里用 contextBridge 暴露 getter 转发 —— contextBridge 会把对象冻结成
 * 静态快照，getter 求值一次就固定了，换显示器/改缩放不会更新。
 */
contextBridge.exposeInMainWorld("petAPI", {
  /** 切换鼠标穿透：true=穿透（不挡其他程序），false=接管鼠标（可点宠物） */
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send("pet-ignore", ignore),
  /** 拖动桌宠窗口（dx/dy 为相对位移） */
  moveWindow: (dx, dy) => ipcRenderer.send("pet-move", { dx, dy }),
  /** 打开主窗口（待办界面） */
  openMainWindow: () => ipcRenderer.send("open-main-window"),
  /** 收起主窗口（登录完成后只留桌宠） */
  closeMainWindow: () => ipcRenderer.send("close-main-window"),
  /** v3.9.10 彻底退出整个程序（桌宠 + 窗口一起关）—— 用户要的"退出桌宠才是彻底关闭" */
  quitApp: () => ipcRenderer.send("quit-app"),
  /**
   * v3.9.12 拖动/飞行期间"钉住"鼠标接管。
   * 拖拽依赖 pointer capture，而 capture 的前提是窗口处于接管状态；
   * 中途一旦被设成穿透，capture 立即失效 → 拖动断在半路（用户表现"拖不动"）。
   */
  setMouseTakeover: (locked) => ipcRenderer.send("pet-takeover", !!locked),
  /**
   * v3.9.13 上报"鼠标键是否按着"。按住期间主进程会强制保持接管，
   * 避免菜单关闭后判定区域缩小、在用户松手前切回穿透（mouseup 会落到桌面）。
   */
  reportMouseHeld: (held) => ipcRenderer.send("pet-mouse-held", !!held),
  /**
   * v3.9.4 登录状态回报：主进程据此决定"直接显示桌宠"还是"弹主窗口登录"。
   * 桌面版冷启动时页面会重试上报（见 src/lib/desktopBridge.ts）。
   */
  reportLogin: (loggedIn) => ipcRenderer.send("login-state", !!loggedIn),
  /**
   * v3.9.4 尺寸自适应：把页面算好的宠物边长报给主进程，窗口跟着 resize。
   * 桌面版窗口只有 ~140px，不 resize 的话 104px 的宠物会被裁掉。
   */
  setPetSize: (px) => ipcRenderer.send("pet-set-size", px),
  /**
   * v3.9.4 命中区域上报：宠物本体 + 打开的聊天面板的真实矩形。
   * 不上报的话主进程会把整个窗口（含 56px 透明留白）当命中区，
   * 宠物周围一圈会抢鼠标、点桌面图标点不中。
   */
  setHitbox: (r) => ipcRenderer.send("pet-hitbox", r),
  /** 聊天面板开关（打开时窗口需放大，否则 340px 面板被裁掉） */
  setChatOpen: (open) => ipcRenderer.send("pet-chat-open", !!open),
  /** 开机自启 */
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (on) => ipcRenderer.invoke("set-auto-launch", on),
  /** 是否桌面版（页面据此启用桌面专属行为） */
  isDesktop: true,
});
