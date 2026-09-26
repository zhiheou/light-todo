import { useEffect, useState } from "react";
import {
  Apple,
  ArrowLeft,
  CheckCircle2,
  Download,
  Info,
  ListTodo,
  MonitorDown,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BloubAvatar } from "./BloubAvatar";
import { DOWNLOADS, DOWNLOAD_READY } from "../lib/downloads";

/**
 * 下载页（/download）
 *
 * 设计原则（用户是产品外行，绝不能让访客卡住）：
 *  1. 一进来就**自动认出你的系统**，把你该下的那个按钮放大（不会出现"下错了打不开"）
 *  2. Mac 首次打开会提示"无法验证开发者" —— 直接在页面上配好图文步骤，不让用户自己搜
 *  3. 没配好下载链接时显示"即将开放"，**不会给一个点了报错的死按钮**
 */
type OS = "windows" | "mac" | "other";

function detectOS(): OS {
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

/** 访客看到的系统名（用于"已为你选中"的提示） */
const OS_LABEL: Record<OS, string> = {
  windows: "Windows",
  mac: "macOS",
  other: "你的设备",
};

interface ColumnProps {
  os: "windows" | "mac";
  current: OS;
}

function DownloadColumn({ os, current }: ColumnProps) {
  const isWin = os === "windows";
  const url = isWin ? DOWNLOADS.windows : DOWNLOADS.mac;
  const size = isWin ? DOWNLOADS.windowsSize : DOWNLOADS.macSize;
  const ready = isWin ? DOWNLOAD_READY.windows : DOWNLOAD_READY.mac;
  const highlighted = current === os;
  const Icon = isWin ? MonitorDown : Apple;

  return (
    <div className={`dl-card ${highlighted ? "dl-card-current" : ""}`}>
      {highlighted && (
        <span className="dl-badge">
          <Sparkles size={12} />
          已为你选中
        </span>
      )}
      <div className="dl-card-head">
        <span className="dl-card-icon">
          <Icon size={22} />
        </span>
        <div>
          <h3>{isWin ? "Windows 版" : "macOS 版"}</h3>
          <p>{isWin ? "Windows 10 / 11" : "Intel 与 Apple 芯片通用"}</p>
        </div>
      </div>

      {ready ? (
        <>
          <a className="dl-button" href={url} download>
            <Download size={16} />
            下载安装包
            {size ? <span className="dl-size">{size}</span> : null}
          </a>
          <p className="dl-version">版本 {DOWNLOADS.version}</p>
        </>
      ) : (
        <button type="button" className="dl-button dl-button-soon" disabled>
          <Download size={16} />
          即将开放
        </button>
      )}

      <ul className="dl-steps">
        {isWin ? (
          <>
            <li>双击下载好的安装包，一路「下一步」装完</li>
            <li>打开「轻待办」，用你的账号登录一次</li>
            <li>
              桌宠<b>直接出现在桌面右下角</b>，大窗口自动收起
            </li>
            <li>关掉窗口它还在；托盘图标随时找回主界面</li>
          </>
        ) : (
          <>
            <li>双击下载好的 .dmg，把「轻待办」拖进「应用程序」</li>
            <li>
              首次打开：在「应用程序」里<b>右键点图标 → 选「打开」→ 再点「打开」</b>
            </li>
            <li>用你的账号登录一次，桌宠常驻桌面</li>
            <li>之后就能像普通软件一样双击启动</li>
          </>
        )}
      </ul>
    </div>
  );
}

export default function DownloadPage() {
  const [os, setOs] = useState<OS>("other");
  useEffect(() => {
    setOs(detectOS());
  }, []);

  const openApp = () => {
    window.location.href = "/";
  };

  return (
    <div className="dl-shell">
      <header className="dl-top">
        <button type="button" className="dl-back" onClick={openApp}>
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="dl-brand">
          <span className="dl-brand-icon">
            <ListTodo size={18} />
          </span>
          轻待办 · Light Todo
        </div>
      </header>

      <main className="dl-main">
        <div className="dl-hero">
          <div className="dl-hero-pet">
            <BloubAvatar state="wink" coat="mono" size={104} />
          </div>
          <div>
            <h1>把轻宜接回桌面</h1>
            <p className="dl-hero-sub">
              装好之后，轻宜<b>常驻在你桌面右下角</b>：随时说话记任务、到点提醒你、
              陪你歇一会儿。关掉窗口它也不走，点托盘图标就能叫回主界面。
            </p>
          </div>
        </div>

        {os !== "other" && (
          <p className="dl-detect">
            <CheckCircle2 size={14} />
            检测到你在用 {OS_LABEL[os]}，已经帮你标出来了
          </p>
        )}

        <div className="dl-grid">
          <DownloadColumn os="windows" current={os} />
          <DownloadColumn os="mac" current={os} />
        </div>

        {/* Mac 首次打开会被系统拦一下 —— 提前讲清楚，别让用户以为装坏了 */}
        <div className="dl-note">
          <Info size={15} />
          <div>
            <b>Mac 用户请看这里</b>
            <p>
              第一次打开会弹「无法验证开发者」（因为我们是独立开发者，没买苹果一年 99 美元的签名证书）。
              这是苹果对所有小团队软件的统一提示，<b>不代表软件有问题</b>。
              按上面的步骤：<b>右键点图标 → 打开 → 再点一次打开</b>，只需做这一次。
            </p>
          </div>
        </div>

        <div className="dl-note">
          <ShieldCheck size={15} />
          <div>
            <b>关于你的数据</b>
            <p>
              桌面版和网页版是<b>同一个账号</b>，登录后自动同步。数据仍然用你的密码加密，
              我们（和服务器）都看不到内容。桌面版只是把界面搬到你电脑上，不多存一份明文。
            </p>
          </div>
        </div>

        <div className="dl-web">
          不想装软件？
          <button type="button" className="dl-web-link" onClick={openApp}>
            直接在浏览器里用 →
          </button>
        </div>
      </main>
    </div>
  );
}
