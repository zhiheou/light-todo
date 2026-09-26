import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DesktopPetApp from "./components/DesktopPetApp";
import DownloadPage from "./components/DownloadPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { hasStoredSession, isDesktopApp, reportLoginState } from "./lib/desktopBridge";
import "./styles.css";

// v3.9 桌面版（Electron）：?desktop=pet 时只渲染桌宠，整页透明
const params = new URLSearchParams(window.location.search);
const isPetMode = params.get("desktop") === "pet";
const petMode = (params.get("mode") === "personal" ? "personal" : "work") as "work" | "personal";

/** v3.9.4 下载页：/download（静态路由，worker 的 SPA 兜底会回落 index.html） */
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isDownloadPage = path === "/download";

/**
 * v3.9.4 桌面版登录态回报。
 * 为什么在渲染前先报一次：主进程要尽快决定"显示桌宠"还是"弹登录窗口"，
 * 等 React 挂载完再报，未登录用户会先看到一个空桌宠闪一下。
 * 有本机会话 → 先当已登录（桌宠立刻出现，体感"打开就是桌宠"）；
 * 校验失败/没会话时 App 会再报一次 false，主进程收到后收起桌宠、弹登录窗。
 */
if (isDesktopApp() && hasStoredSession()) {
  reportLoginState(true);
}

function Root() {
  if (isDownloadPage) return <DownloadPage />;
  if (isPetMode) return <DesktopPetApp mode={petMode} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* 全局错误边界：任何渲染异常都不白屏，给可操作提示（v3.9） */}
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
