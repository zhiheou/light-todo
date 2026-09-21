import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DesktopPetApp from "./components/DesktopPetApp";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

// v3.9 桌面版（Electron）：?desktop=pet 时只渲染桌宠，整页透明
const params = new URLSearchParams(window.location.search);
const isPetMode = params.get("desktop") === "pet";
const petMode = (params.get("mode") === "personal" ? "personal" : "work") as "work" | "personal";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* 全局错误边界：任何渲染异常都不白屏，给可操作提示（v3.9） */}
    <ErrorBoundary>{isPetMode ? <DesktopPetApp mode={petMode} /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
