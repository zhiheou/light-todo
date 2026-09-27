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
//
// 🔴 v3.9.22 血泪：Mac 包**必须按芯片分成两个**，不能合成一个通用包。
//   之前 `artifactName` 是 `light-todo-setup-${version}-mac.${ext}` —— **没带芯片名**，
//   Intel 版和 Apple 芯片版先后打包用了同一个文件名，**后者把前者覆盖掉了**。
//   GitHub Release 里只剩一个 91MB 的包，而它是 arm64（Apple 芯片）的。
//   用户那台 2018 款 Intel MacBook Pro 一装就报「这台 Mac 不支持此应用程序」，
//   而且**从下载页看不出任何异常** —— 按钮能点、包能下、就是装不上。
//   → 现在文件名带 `-x64` / `-arm64`，下载页按芯片自动挑（见下面 pickMacDownload）。
export const DOWNLOADS = {
  /** Windows 安装包（NSIS，.exe）· 文件名 light-todo-setup-x.y.z.exe */
  windows: "https://todo.aebuiyke.xyz/dl/light-todo-setup-3.9.22.exe",
  /**
   * macOS · Intel 芯片（2020 年前的 Mac 基本都是）
   * 文件名 light-todo-setup-x.y.z-mac-x64.zip
   */
  macIntel: "https://todo.aebuiyke.xyz/dl/light-todo-setup-3.9.22-mac-x64.zip",
  /**
   * macOS · Apple 芯片（M1/M2/M3/M4）
   * 文件名 light-todo-setup-x.y.z-mac-arm64.zip
   */
  macApple: "https://todo.aebuiyke.xyz/dl/light-todo-setup-3.9.22-mac-arm64.zip",
  /** 版本号（显示用，与桌面版 package.json 的 version 保持一致） */
  version: "3.9.22",
  /** 安装包大小（显示用，留空则不显示） */
  windowsSize: "78 MB",
  macSize: "91 MB",
};

/**
 * Mac 该下哪个包 —— **按芯片自动挑**。
 *
 * 为什么不能只给一个链接：Mac 有两种芯片，装错了系统会直接拒绝
 * （报「这台 Mac 不支持此应用程序」，用户完全看不懂，只会以为软件坏了）。
 *
 * 判断依据 `navigator.userAgent`：
 *   · Apple 芯片的 Safari/Chrome 会带 `arm64`（如 `Macintosh; Intel Mac OS X 10_15_7 ... arm64`）
 *   · Intel 机器**不带** `arm64`
 * ⚠️ 注意 UA 里那个 "Intel Mac OS X" 是**历史遗留的固定串**，Intel/Apple 芯片都有，
 *   **不能**拿它当判据 —— 曾经差点因此把 Apple 芯片用户判成 Intel。
 *
 * 判不出来时（浏览器隐藏 UA 等）默认给 **Intel 版**：
 *   Intel 包在 Apple 芯片上**能跑**（走 Rosetta 转译），
 *   反过来 arm64 包在 Intel 机器上**根本装不上** —— 所以默认值必须偏 Intel 才安全。
 */
export function pickMacDownload(ua: string): { url: string; arch: "intel" | "apple" } {
  const isAppleSilicon = /arm64|aarch64/i.test(ua);
  return isAppleSilicon
    ? { url: DOWNLOADS.macApple, arch: "apple" }
    : { url: DOWNLOADS.macIntel, arch: "intel" };
}

/** 下载是否已就绪（没配链接时页面显示"即将开放"，避免点了报错） */
export const DOWNLOAD_READY = {
  windows: DOWNLOADS.windows.length > 0,
  mac: DOWNLOADS.macIntel.length > 0 && DOWNLOADS.macApple.length > 0,
};
