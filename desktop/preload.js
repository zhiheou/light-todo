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
  /** 开机自启 */
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (on) => ipcRenderer.invoke("set-auto-launch", on),
  /** 是否桌面版（页面据此启用桌面专属行为） */
  isDesktop: true,
});
