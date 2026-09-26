#!/usr/bin/env node
/**
 * electron-builder 的 afterPack 钩子：给打包出的 exe 写入图标与版本信息。
 *
 * 为什么需要它（本地 Windows 打包的实际情况）：
 *   electron-builder 改 exe 资源靠 winCodeSign 组件（内含 rcedit），但那个组件解压时
 *   会创建两个 macOS 符号链接，Windows 上需要管理员权限 → 解压失败 → 整个打包中止。
 *   官方开关 `signAndEditExecutable: false` 能绕过，但那会把**图标和版本信息一起跳过**，
 *   装出来的软件在任务管理器里叫 "Electron"、图标也是默认的。
 *   所以这里用同一份 rcedit 自己补上这一步（rcedit 本身不需要管理员权限）。
 *
 * 注：GitHub Actions 云端构建（build-desktop.yml）没有这个权限问题，
 *     那边走 electron-builder 原生流程，本钩子会自动跳过（找不到 rcedit 或非 win 目标时）。
 */
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  // 只管 Windows；Mac 的图标走 .icns，由 electron-builder 正常处理
  if (context.electronPlatformName !== "win32") return;

  const rcedit = path.join(__dirname, "rcedit.exe");
  if (!existsSync(rcedit)) {
    console.log("[afterPack] 未找到 rcedit.exe，跳过图标/版本写入");
    return;
  }

  const appInfo = context.packager.appInfo;
  const exeName = `${appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!existsSync(exePath)) {
    console.log(`[afterPack] 未找到 ${exePath}，跳过`);
    return;
  }

  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  const args = [
    exePath,
    "--set-version-string", "FileDescription", appInfo.productName,
    "--set-version-string", "ProductName", appInfo.productName,
    "--set-version-string", "CompanyName", "轻待办",
    "--set-version-string", "LegalCopyright", "轻待办",
    "--set-file-version", appInfo.version,
    "--set-product-version", appInfo.version,
  ];
  if (existsSync(iconPath)) {
    args.push("--set-icon", iconPath);
  }

  try {
    execFileSync(rcedit, args, { stdio: "pipe" });
    console.log(`[afterPack] ✅ 已写入图标与版本信息：${exeName} v${appInfo.version}`);
  } catch (err) {
    // 写失败不该让整个打包失败（用户至少还能装上一个默认图标的版本）
    console.log(`[afterPack] ⚠️ 写入图标/版本失败：${err.message}`);
  }
};
