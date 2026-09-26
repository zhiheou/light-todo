// 轻待办 下载地址集中配置
//
// 【上线前必须做的一步】把空的换成真实下载链接，否则下载按钮会提示"即将开放"。
// 获取方式：跑 `bash release/publish.sh`，脚本会把安装包传到 GitHub Releases
//           并打印出两个链接，填到下面即可。
//
// 为什么放前端常量而不是接口：下载页是静态页，少一次网络请求、断网也能看到说明。
// 换链接要重新 build + deploy（见 _devlog/README.md）。
export const DOWNLOADS = {
  /** Windows 安装包（NSIS，.exe）· 目标文件名 light-todo-setup-x.y.z.exe */
  windows: "",
  /** macOS 安装包（Intel + Apple 芯片通用版，.dmg）· 目标文件名 light-todo-x.y.z-universal.dmg */
  mac: "",
  /** 版本号（显示用，与桌面版 package.json 的 version 保持一致） */
  version: "3.9.4",
  /** 安装包大小（显示用，留空则不显示） */
  windowsSize: "",
  macSize: "",
};

/** 下载是否已就绪（没配链接时页面显示"即将开放"，避免点了报错） */
export const DOWNLOAD_READY = {
  windows: DOWNLOADS.windows.length > 0,
  mac: DOWNLOADS.mac.length > 0,
};
