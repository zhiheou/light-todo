import {
  CalendarClock,
  CheckCircle2,
  FileDown,
  ListTodo,
  LockKeyhole,
  RefreshCcw,
  Repeat2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AuthForm from "./AuthForm";
import { BloubAvatar } from "./BloubAvatar";

interface LoginGateProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  booting?: boolean;
  error?: string;
}

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { icon: Zap, title: "一句话添加", desc: "「明天10点交周报」自动填好时间与提醒" },
  { icon: Repeat2, title: "循环任务", desc: "「每天8点半喝水」「每周一例会」自动重复" },
  { icon: ShieldCheck, title: "端到端加密", desc: "数据用账号密码加密，服务器只见密文" },
  { icon: RefreshCcw, title: "多端同步", desc: "换设备登录即恢复，工作/生活双空间" },
];

const STEPS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: ListTodo, text: "一句话创建任务，日期提醒自动识别" },
  { icon: CheckCircle2, text: "勾选完成，循环任务自动生成下一实例" },
  { icon: CalendarClock, text: "今日 / 回顾 / 备忘录，一目了然" },
];

export default function LoginGate({ onLogin, onRegister, booting, error }: LoginGateProps) {
  return (
    <div className="gate-shell">
      {/* 左侧品牌介绍区 */}
      <div className="gate-hero">
        <div className="gate-brand">
          <span className="gate-brand-icon">
            <ListTodo size={22} />
          </span>
          <span>轻待办</span>
        </div>

        <h1 className="gate-hero-title">把要做的事，轻轻说一句</h1>
        <p className="gate-hero-sub">
          用自然语言添加待办与备忘，自动识别日期、提醒与循环规则。
          端到端加密，多端同步，轻快无负担。
        </p>

        <ul className="gate-steps">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.text}>
                <span className="gate-step-icon">
                  <Icon size={14} />
                </span>
                {step.text}
              </li>
            );
          })}
        </ul>

        <div className="gate-features">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="gate-feature">
                <span className="gate-feature-icon">
                  <Icon size={15} />
                </span>
                <div>
                  <b>{feature.title}</b>
                  <span>{feature.desc}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="gate-privacy">
          <LockKeyhole size={12} />
          数据保存在你的账号中，登录后自动加密同步——服务器不保存明文，换设备登录即恢复
        </div>

        {/* 桌宠引导：欢迎 + 新手提示 */}
        <div className="gate-pet">
          <BloubAvatar state="idle" coat="mono" size={104} className="gate-pet-blob" />
          <div className="gate-pet-bubble">
            <b>你好呀，我是轻宜 👋</b>
            <span>你的待办桌宠。登录后可以：把我到处拖、甩出去玩、对我说"帮我记个待办"。</span>
          </div>
        </div>
        <p className="gate-notice">
          ⚠️ 新用户注意：<b>注册后密码 = 你的数据密钥，务必牢记</b>——忘记密码无法找回数据；
          注册即进入空工作空间，可先建第一条待办体验。
        </p>
      </div>

      {/* 右侧表单区 */}
      <div className="gate-form-col">
        <div className="gate-card">
          <h2 className="login-gate-title">{booting ? "正在恢复会话…" : "登录 / 注册"}</h2>
          {booting ? (
            <p className="login-gate-hint">正在验证会话与同步数据…</p>
          ) : (
            <>
              {error && <div className="sync-status error">{error}</div>}
              <AuthForm onLogin={onLogin} onRegister={onRegister} />
              <p className="login-gate-hint">关闭标签页后需重新登录 · 数据自动同步云端</p>
            </>
          )}
        </div>

        <p className="gate-footnote">
          <FileDown size={11} />
          登录后数据自动加密同步到你的账号，无需手动备份
        </p>
      </div>
    </div>
  );
}
