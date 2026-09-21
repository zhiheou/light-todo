const { contextBridge, ipcRenderer } = require("electron");

/**
 * 桌面版桥接层：只暴露必要能力给页面（安全：不开 nodeIntegration）
 */
contextBridge.exposeInMainWorld("petAPI", {
  /** 切换鼠标穿透：true=穿透（不挡其他程序），false=接管鼠标（可点宠物） */
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send("pet-ignore", ignore),
  /** 拖动窗口（dx/dy 为相对位移） */
  moveWindow: (dx, dy) => ipcRenderer.send("pet-move", { dx, dy }),
  /** 开机自启 */
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (on) => ipcRenderer.invoke("set-auto-launch", on),
  /** 是否桌面版（页面据此启用桌面专属行为） */
  isDesktop: true,
});
