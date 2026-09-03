import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ListTodo,
  LockKeyhole,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AuthForm from "./AuthForm";
import { BloubAvatar } from "./BloubAvatar";
import type { StateId } from "../lib/bloub/states";

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
  { icon: CalendarClock, title: "循环任务", desc: "「每天8点半喝水」到点提醒，自动重复" },
  { icon: ShieldCheck, title: "端到端加密", desc: "密码即密钥，服务器只见密文" },
  { icon: RefreshCcw, title: "多端同步", desc: "换设备登录即恢复，工作/生活双空间" },
];

/** 桌宠「接客」demo：依次播一句话 → 停顿 → 变形成一张示例任务卡 */
const DEMO: Array<{ phrase: string; state: StateId; task?: { title: string; when: string } }> = [
  { phrase: "你好呀，我是轻宜 👋", state: "wink" },
  { phrase: "你说一句，我就帮你记下……", state: "thinking" },
  { phrase: "明天下午4点开会", state: "thinking" },
  { phrase: "好啦，记下了！", state: "idle", task: { title: "开会", when: "明天 16:00" } },
  { phrase: "我也会在你累的时候陪陪你 🫂", state: "play" },
];

/** 登录页左侧的轻宜演示：循环播 demo，等一小段再进下一句 */
function HeroDemo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setI((v) => (v + 1) % DEMO.length), i === 3 ? 3200 : 1500);
    return () => window.clearTimeout(t);
  }, [i]);
  const cur = DEMO[i];
  return (
    <div className="gate-demo" aria-hidden>
      <div className="gate-demo-pet">
        <BloubAvatar state={cur.state} coat="mono" size={132} />
      </div>
      <div className="gate-demo-track">
        <div key={i} className="gate-demo-line">
          <span className="gate-demo-dot" />
          <span>{cur.phrase}</span>
        </div>
        {cur.task && (
          <div key={`t${i}`} className="gate-demo-task">
            <span className="gate-demo-check">
              <CheckCircle2 size={15} />
            </span>
            <span className="gate-demo-title">{cur.task.title}</span>
            <span className="gate-demo-when">{cur.task.when}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginGate({ onLogin, onRegister, booting, error }: LoginGateProps) {
  return (
    <div className="gate-shell">
      {/* 左侧品牌 + 产品演示区 */}
      <div className="gate-hero">
        <div className="gate-brand">
          <span className="gate-brand-icon">
            <ListTodo size={22} />
          </span>
          <span>轻待办 · Light Todo</span>
          <span className="gate-brand-tag">端到端加密</span>
        </div>

        <h1 className="gate-hero-title">
          一句"明天下午4点开会"，
          <br />
          剩下的交给它。
        </h1>
        <p className="gate-hero-sub">
          轻待办是一款说人话的待办 + 备忘。桌宠「轻宜」会听你安排、记下灵感、陪你聊天，
          到点提醒你。数据用你的密码加密，只有你能看见。
        </p>

        {/* 会动的桌宠演示（signature） */}
        <HeroDemo />

        <ul className="gate-steps">
          <li>
            <span className="gate-step-icon"><MessageCircle size={14} /></span>
            对轻宜说人话：「明天下午4点开会」「记到备忘录：买牛奶」
          </li>
          <li>
            <span className="gate-step-icon"><CheckCircle2 size={14} /></span>
            打勾完成，循环任务自动生成下一件；逾期它会提醒
          </li>
          <li>
            <span className="gate-step-icon"><LockKeyhole size={14} /></span>
            工作 / 个人两个空间，各自上锁，互不打扰
          </li>
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
          <ShieldCheck size={13} />
          密码即密钥：数据用你的密码加密后上传，服务器只保存密文。换设备登录即恢复。
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="gate-form-col">
        <div className="gate-card">
          <h2 className="login-gate-title">
            {booting ? "正在恢复会话…" : <><Sparkles size={15} /> 登录 / 注册</>}
          </h2>
          {booting ? (
            <p className="login-gate-hint">正在验证会话与同步数据…</p>
          ) : (
            <>
              {error && <div className="sync-status error">{error}</div>}
              <AuthForm onLogin={onLogin} onRegister={onRegister} />
              <p className="login-gate-hint">
                新用户：注册后密码就是你的数据密钥，<b>务必牢记</b>，忘了找不回。
              </p>
            </>
          )}
        </div>

        <p className="gate-footnote">
          登录后数据自动加密同步到你的账号，无需手动备份
        </p>
      </div>
    </div>
  );
}
