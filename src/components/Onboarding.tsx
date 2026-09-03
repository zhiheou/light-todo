import { useState } from "react";
import { CheckCircle2, MousePointerClick, Sparkles, X } from "lucide-react";
import { BloubAvatar } from "./BloubAvatar";
import type { StateId } from "../lib/bloub/states";

interface OnboardingProps {
  personaName: string;
  onDone: () => void;
}

interface Step {
  title: string;
  body: string;
  /** 桌宠此时的表情 */
  state: StateId;
  /** 让用户做的动作提示（点"下一步"前会做的） */
  action?: string;
}

const STEPS: Step[] = [
  {
    title: "欢迎来到轻待办",
    body: "我是「轻宜」，你的待办小桌宠。这个页面就是你的工作台：待办、备忘、日历都在这儿，工作和个人可以分成两个空间。",
    state: "wink",
  },
  {
    title: "用一句话建待办",
    body: "点右上角「+」，或直接对我说：'明天下午4点开会'。日期、提醒会自动帮你填好——说人话就行，不用选来选去。",
    state: "thinking",
    action: "试试：点右上角 ➕ 输入「明天下午3点交周报」",
  },
  {
    title: "完成了就打个勾",
    body: "任务前面那个圆圈，点一下就是完成。循环任务（比如'每天8点半喝水'）完成后会自动生成明天的下一件。",
    state: "idle",
    action: "把一条待办前面的圆圈点掉，试试看",
  },
  {
    title: "桌宠是可以玩的",
    body: "左键拖住我用力一甩，我会撞到屏幕边弹回来；双击逗逗我；右击有菜单。嫌我烦可以在设置里关掉主动搭话。",
    state: "play",
    action: "把我拖到别处甩一下试试",
  },
];

/** 新用户首次登录的分步引导（桌宠带路）。按账号记住已看过，可跳过。 */
export default function Onboarding({ personaName, onDone }: OnboardingProps) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-label="新手引导">
      <div className="onboard-card">
        <button
          type="button"
          className="onboard-close"
          aria-label="跳过引导"
          onClick={onDone}
        >
          <X size={16} />
        </button>

        <div className="onboard-pet">
          <BloubAvatar state={step.state} coat="mono" size={96} />
        </div>

        <div className="onboard-body">
          <div className="onboard-eyebrow">
            <Sparkles size={13} />
            {personaName}带你认识一下 · {i + 1}/{STEPS.length}
          </div>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          {step.action && (
            <div className="onboard-hint">
              <MousePointerClick size={13} />
              {step.action}
            </div>
          )}
        </div>

        <div className="onboard-foot">
          <div className="onboard-dots">
            {STEPS.map((_, d) => (
              <span key={d} className={d === i ? "onboard-dot active" : "onboard-dot"} />
            ))}
          </div>
          <div className="onboard-actions">
            {!last ? (
              <button type="button" className="primary-button" onClick={() => setI((v) => v + 1)}>
                下一步
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={onDone}>
                <CheckCircle2 size={15} />
                开始使用
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
