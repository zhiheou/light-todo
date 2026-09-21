# 轻待办 · 桌面版（Electron）

桌宠常驻桌面（透明、无边框、置顶、鼠标穿透），点击弹对话。

## 怎么跑（3 步）

```bash
# 1. 装依赖（首次，约 100MB，需网络）
cd desktop && npm install

# 2. 起前端（另开一个终端，项目根目录）
npm run dev          # localhost:1420

# 3. 起桌面版（开发模式，连本地前端）
cd desktop && npm run dev
```

想看线上版（不连本地）：
```bash
cd desktop && npm start
```

## 打包成 exe
```bash
cd desktop && npm run dist    # 产物在 desktop/release/
```
未签名，用户首次运行点"仍要运行"即可。

## 文件说明
- `main.js` —— 主进程：建透明置顶窗口、鼠标穿透、开机自启
- `preload.js` —— 桥接层（安全暴露 API 给页面）
- `package.json` —— 独立依赖（不污染前端/worker）

## 原理（为什么这么少代码）
前端加了 `?desktop=pet` 分支（`src/main.tsx` + `components/DesktopPetApp.tsx`），
该模式下整页透明、只渲染桌宠+对话。**复用全部现有代码**（PetShell/bloub 引擎/MascotAssistant/DeepSeek），
所以桌面版几乎不用新写 UI。

## 已知坑（调研得出，已处理）
1. 透明窗口黑底 → `app.disableHardwareAcceleration()`
2. 穿透要动态切换 → 鼠标进宠物才接管（`setIgnoreMouseEvents`）
3. alwaysOnTop 被全屏程序盖 → 用 `"screen-saver"` 层级
4. 多显示器/缩放 → 用 `scaleFactor` 换算尺寸与位置
