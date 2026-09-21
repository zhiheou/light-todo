import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DesktopPetApp from "./components/DesktopPetApp";
import "./styles.css";

// v3.9 桌面版（Electron）：?desktop=pet 时只渲染桌宠，整页透明
const params = new URLSearchParams(window.location.search);
const isPetMode = params.get("desktop") === "pet";
const petMode = (params.get("mode") === "personal" ? "personal" : "work") as "work" | "personal";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPetMode ? <DesktopPetApp mode={petMode} /> : <App />}
  </React.StrictMode>,
);
