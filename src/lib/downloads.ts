// 轻待办 下载地址集中配置
//
// 安装包存放位置：Cloudflare R2（我们自己的域名下发，国内可访问、速度快）。
// 为什么不用 GitHub Releases：国内连接慢甚至连不上，用户体验差。
//
// 【发新版时怎么更新这里】
//   1. 跑 `bash desktop/scripts/release.sh` —— 自动打包 + 上传到 R2 + 打印新链接
//   2. 把新链接和版本号填到下面
//   3. `npm run build` 然后部署（见 _devlog/README.md）
// 注意：桌面版的**自动更新**不走这里，它读的是 /dl/latest.yml（同一次发布脚本会一起传上去）。
//
// v3.9.21：加上了 Mac 版。Mac 包放在 R2（不是 GitHub），因为 GitHub 在国内
// 直连实测只有 ~33KB/s，91MB 要下 45 分钟；R2 + 我们自己的域名实测 1.6MB/s，1 分钟下完。
export const DOWNLOADS = {
  /** Windows 安装包（NSIS，.exe）· 文件名 light-todo-setup-x.y.z.exe */
  windows: "https://todo.aebuiyke.xyz/dl/light-todo-setup-3.9.21.exe",
  /** macOS 安装包（.zip，内含 Intel + Apple 芯片两个版本）· 文件名 light-todo-setup-x.y.z-mac.zip */
  mac: "https://todo.aebuiyke.xyz/dl/light-todo-setup-3.9.21-mac.zip",
  /** 版本号（显示用，与桌面版 package.json 的 version 保持一致） */
  version: "3.9.21",
  /** 安装包大小（显示用，留空则不显示） */
  windowsSize: "78 MB",
  macSize: "91 MB",
};

/** 下载是否已就绪（没配链接时页面显示"即将开放"，避免点了报错） */
export const DOWNLOAD_READY = {
  windows: DOWNLOADS.windows.length > 0,
  mac: DOWNLOADS.mac.length > 0,
};
