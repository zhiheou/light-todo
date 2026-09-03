import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Send, Trash2, X } from "lucide-react";
import type { Mode, MascotMood, PetExpressionId, PetSkin, Task } from "../types";
import type { StateId } from "../lib/bloub/states";
import type { TaskDraft } from "./AddDialog";
import MascotAvatar from "./MascotAvatar";
import PetShell, { type PetMenuAction } from "./PetShell";
import { PetConfigPanel } from "./PetConfigPanel";
import {
  answer,
  cancelDelete,
  cancelRecordFeeling,
  confirmDelete,
  confirmRecordFeeling,
  isCancelRecord,
  isConfirmRecord,
  isGrantDeleteIntent,
  isOffTopic,
  needDeleteGrantReply,
  offTopicReply,
  readConfirm,
  type BrainAction,
  type BrainCtx,
} from "../lib/mascotBrain";
import { loadPetSkin, savePetSkin } from "../lib/petSkin";

interface Msg {
  role: "user" | "bot";
  text: string;
  ts: number;
}

export interface MascotNudge {
  id: number;
  text: string;
}

interface MascotAssistantProps {
  mode: Mode;
  tasks: Task[];
  onAddTask: (draft: TaskDraft) => void;
  onAddMemo: (text: string, tags?: string[]) => void;
  onOpenTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  /** v3.8 B：当前空间是否已授权吉祥物删待办 */
  deleteGranted: boolean;
  /** v3.8 B：把"删除授权"落库（localStorage，按空间） */
  onGrantDelete: () => void;
  /** App 侧主动推送的消息（登录问候/闲置搭话/到点提醒） */
  nudges: MascotNudge[];
}

const PERSONA: Record<Mode, { name: string; label: string; sub: string }> = {
  work: { name: "小轻", label: "工作助理", sub: "工作 · 进度 · 安排" },
  personal: { name: "小安", label: "个人助理", sub: "个人 · 生活 · 私事" },
};

const SUGGESTIONS = ["帮我记个待办：明天下午4点开会", "把这段话记到备忘录：买牛奶", "今天有什么安排？"];

const PANEL_W = 320;
const PANEL_H = 360; // 估算面板高，用于"上方是否有足够空间"的粗判

/**
 * 聊天气泡锚在桌宠旁；优先让面板**悬在宠物正上方**（面板底边贴宠物顶），这样底部的
 * 输入框在宠物上面、永远可见不被挡；宠物贴屏顶没空间时才放宠物下方。
 * 靠右自动往左收。petPos 缺省退回右下角。
 */
function panelStyle(
  petPos: { x: number; y: number; w: number; h: number } | null,
  open: boolean,
): CSSProperties {
  if (!open) return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  if (!petPos) return { right: margin, bottom: 92 };
  // 左右：默认宠物右侧，放不下翻左侧
  let left = petPos.x + petPos.w + margin;
  if (left + PANEL_W > vw - margin) left = petPos.x - PANEL_W - margin;
  left = Math.max(margin, Math.min(left, vw - PANEL_W - margin));

  const petTop = petPos.y;
  const roomAbove = petTop - margin;
  if (roomAbove >= PANEL_H) {
    // 宠物上方够高 → 面板悬在宠物正上方：底边(bottom)贴宠物顶
    return { left, bottom: vh - petTop + 6, right: "auto", top: "auto" };
  }
  // 上方不够 → 放宠物下方（输入框在宠物下方且面板整体尽量不超屏）
  const belowTop = petTop + petPos.h + margin;
  // 若下方会超屏，退回上方并压缩（宁可盖住宠物顶部也要输入框可见）
  const top = Math.min(belowTop, Math.max(margin, vh - margin - 56 - 240));
  return { left, top, right: "auto", bottom: "auto" };
}

/** 聊天瞬时 mood → 长期表情映射（轻宜主导表情） */
function moodToExpr(mood: MascotMood): PetExpressionId {
  switch (mood) {
    case "happy":
      return "happy";
    case "thinking":
      return "thinking";
    case "reminding":
      return "remind";
    case "listening":
      return "waiting";
    default:
      return "idle";
  }
}

export default function MascotAssistant({
  mode,
  tasks,
  onAddTask,
  onAddMemo,
  onOpenTask,
  onDeleteTask,
  deleteGranted,
  onGrantDelete,
  nudges,
}: MascotAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<MascotMood>("idle");
  const [thinking, setThinking] = useState(false);
  const [chat, setChat] = useState<Record<Mode, Msg[]>>({ work: [], personal: [] });
  const [pendingDelete, setPendingDelete] = useState<{ candidateId: string } | null>(null);
  /** v3.8 B：正在等用户"允许删除"授权（首次删待办）；记录了要删的那条 */
  const [awaitingGrant, setAwaitingGrant] = useState<{ candidateId: string } | null>(null);
  /** v3.8.1 C：情绪 → 询问是否记成 #心情 备忘（pending，用户确认才记） */
  const [pendingFeeling, setPendingFeeling] = useState<{ text: string } | null>(null);
  /** v3.8 D：防刷冷却——距上次发消息不足 8s 时忽略新消息 */
  const lastSentAt = useRef(0);
  const [unread, setUnread] = useState(0);
  /** 配置面板：形态/皮肤 */
  const [configOpen, setConfigOpen] = useState(false);
  /** 已保存提示 */
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const savedTimer = useRef<number | null>(null);
  const showSaved = useCallback((msg: string) => {
    setSavedHint(msg);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedHint(null), 1600);
  }, []);
  // 皮肤按空间分仓：工作=晨青 / 个人=暮暖（可各自自定义）
  const [skins, setSkins] = useState<Record<Mode, PetSkin>>(() => ({
    work: loadPetSkin("work"),
    personal: loadPetSkin("personal"),
  }));
  const skin = skins[mode];
  const setSkinForMode = useCallback(
    (patch: Partial<PetSkin>) => {
      setSkins((prev) => {
        const next = { ...prev[mode], ...patch };
        savePetSkin(next, mode);
        return { ...prev, [mode]: next };
      });
    },
    [mode],
  );
  /** 显示/隐藏桌宠（持久化，按空间独立） */
  const setPetHidden = useCallback(
    (hidden: boolean) => {
      setSkinForMode({ hidden });
      if (!hidden) setPreviewState(null);
    },
    [setSkinForMode],
  );
  const [act, setAct] = useState<{ id: PetExpressionId; key: number } | null>(null);
  /** 桌宠是否隐藏（持久化在 skin.hidden，按空间独立） */
  const petHidden = !!skin.hidden;
  /** 形态馆试玩：显示一个 bloub 形变态 */
  const [previewState, setPreviewState] = useState<StateId | null>(null);
  /** 桌宠当前位置（聊天气泡跟随） */
  const [petPos, setPetPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const seenNudge = useRef<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actCount = useRef(0);

  const persona = PERSONA[mode];
  const msgs = chat[mode];

  const triggerAct = useCallback((id: PetExpressionId) => {
    actCount.current += 1;
    setAct({ id, key: actCount.current });
  }, []);

  // 滚动到底：新消息/思考态变化后立即到底（用 auto 而非 smooth，避免长对话滚不到位）
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, thinking, open]);

  /** 给当前空间推一条机器人消息；面板关闭时记未读 */
  function pushBot(text: string, silent = false) {
    setChat((prev) => ({
      ...prev,
      [mode]: [...prev[mode], { role: "bot", text, ts: Date.now() }],
    }));
    if (!open && !silent) setUnread((u) => u + 1);
  }

  /** 消费 App 推来的主动消息（去重） */
  useEffect(() => {
    for (const n of nudges) {
      if (seenNudge.current.has(n.id)) continue;
      seenNudge.current.add(n.id);
      pushBot(n.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudges]);

  // 切到个人空间且还没有聊天记录时，打个招呼（不增加未读，避免打扰）
  useEffect(() => {
    if (chat[mode].length === 0) {
      setChat((prev) => ({
        ...prev,
        [mode]: [
          {
            role: "bot",
            text: `${persona.name} 在这里～我是你的${persona.label}。可以直接说「帮我记个待办」或「记到备忘录」，也可以问我今天有什么安排。`,
            ts: Date.now(),
          },
        ],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function openPanel() {
    setOpen(true);
    setUnread(0);
    setMood("happy");
    setTimeout(() => inputRef.current?.focus(), 120);
  }

  function closePanel() {
    setOpen(false);
    setMood("idle");
  }

  /** v3.8 D：清空当前空间对话记录（含清掉待确认/授权状态） */
  function clearChat() {
    setChat((prev) => ({ ...prev, [mode]: [] }));
    setPendingDelete(null);
    setAwaitingGrant(null);
    setPendingFeeling(null);
    setMood("idle");
    setUnread(0);
  }

  function runAction(action: BrainAction | undefined) {
    if (!action) return;
    switch (action.type) {
      case "addTask": {
        const p = action.parsed;
        const draft: TaskDraft = {
          title: p.title,
          notes: "",
          priority: p.priority,
          dueDate: p.dueDate,
          dueTime: p.dueTime,
          remindAt: p.remindAt,
          repeat: p.repeat,
        };
        onAddTask(draft);
        triggerAct("done");
        break;
      }
      case "askRecordFeeling": {
        // v3.8.1 C：情绪已共情，询问是否记 #心情 —— 等用户确认，不擅自记
        setPendingFeeling({ text: action.text });
        setMood("listening");
        break;
      }
      case "addMemo":
        onAddMemo(action.text, action.tags);
        triggerAct("done");
        break;
      case "openTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onOpenTask(t);
        break;
      }
      case "confirm":
        // v3.8 B：第一次删待办需先授权（按空间记住）。未授权 → 不进入删除确认，
        // 先请求授权；授权后再走正常"确认删这条"。
        if (!deleteGranted) {
          setAwaitingGrant({ candidateId: action.candidateId });
          setMood("listening");
          pushBot(needDeleteGrantReply().text);
          return;
        }
        setPendingDelete({ candidateId: action.candidateId });
        setMood("listening");
        break;
      case "deleteTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onDeleteTask(t);
        setPendingDelete(null);
        triggerAct("done");
        break;
      }
    }
  }

  function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    // v3.8.1 C：若正在问"要不要记心情备忘"，先判断是/否
    if (pendingFeeling) {
      if (isConfirmRecord(text)) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        const reply = confirmRecordFeeling(pendingFeeling.text);
        setPendingFeeling(null);
        setMood("happy");
        pushBot(reply.text);
        runAction(reply.action);
        return;
      }
      if (isCancelRecord(text)) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        setPendingFeeling(null);
        setMood("idle");
        pushBot(cancelRecordFeeling().text);
        return;
      }
      // 其它回复：仍在等确认，给轻提示不打断
      setChat((prev) => ({
        ...prev,
        [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
      }));
      pushBot("我在等你决定要不要记成 #心情 备忘——回「记吧」或「不用」就好。");
      return;
    }
    // v3.8 B：若正在等"允许删除"授权，先判断这句是不是授权
    if (awaitingGrant) {
      const isGrant = isGrantDeleteIntent(text);
      const isNo = /^(不|不要|别|取消|算了|等等|不了)/.test(text.trim());
      if (isGrant) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        onGrantDelete();
        const cand = awaitingGrant.candidateId;
        setAwaitingGrant(null);
        setPendingDelete({ candidateId: cand }); // 授权后进入正常"确认删这条"
        setMood("listening");
        pushBot("好，授权记住了。确认要删吗？删除后可以撤销。");
        return;
      }
      if (isNo) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        setAwaitingGrant(null);
        setMood("idle");
        pushBot(cancelDelete().text);
        return;
      }
      // 其它回复：仍在等授权，给一句轻提示不打断
      setChat((prev) => ({
        ...prev,
        [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
      }));
      pushBot("要先回我「允许删除」我才会帮你删哦；回「不删」我就不动了。");
      return;
    }
    // 若有待确认删除，先判断是/否
    if (pendingDelete) {
      const v = readConfirm(text);
      if (v?.yes) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        const ctx: BrainCtx = { tasks, persona: mode };
        const reply = confirmDelete(ctx, pendingDelete.candidateId);
        setPendingDelete(null);
        setMood("happy");
        pushBot(reply.text);
        runAction(reply.action);
        return;
      }
      if (v?.yes === false) {
        setChat((prev) => ({
          ...prev,
          [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
        }));
        setPendingDelete(null);
        setMood("idle");
        pushBot(cancelDelete().text);
        return;
      }
      // 不是明确是/否：当作普通对话处理（不打断确认）
    }

    setChat((prev) => ({
      ...prev,
      [mode]: [...prev[mode], { role: "user", text, ts: Date.now() }],
    }));
    setThinking(true);
    setMood("thinking");

    // 本地小脑先判断动作（建/删/确认 仍走本地规则）
    const ctx: BrainCtx = { tasks, persona: mode };
    const local = answer(text, ctx);

    // 若有动作（建任务/备忘/删除/确认）→ 本地执行 + 回执（不依赖 AI）
    if (local.action) {
      window.setTimeout(() => {
        setThinking(false);
        if (local.action?.type === "confirm") setMood("listening");
        else setMood("happy");
        pushBot(local.text);
        runAction(local.action);
      }, 260);
      return;
    }

    // 离题拦截：写代码/无关请求一律不发给 AI（省 token），本地直接回绝拉回领域
    if (isOffTopic(text)) {
      window.setTimeout(() => {
        setThinking(false);
        setMood("idle");
        pushBot(offTopicReply().text);
      }, 200);
      return;
    }

    // 纯聊天/没听懂 → 若后端已接 AI，问 DeepSeek；否则用本地兜底文案
    const hist = chat[mode]
      .slice(-8)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    // 隐私边界：个人空间最私密 → 不发送任务明细给 AI；工作空间发摘要（标题+日期+完成态，不含备注/备忘）
    const personal = mode === "personal";
    const summary = personal
      ? []
      : tasks.slice(0, 30).map((t) => {
          const when = t.dueDate ? `${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : "未定";
          return `${t.completed ? "✓" : "·"}${t.title}(${when})`;
        });
    const system = personal
      ? `你是「轻宜」，一个桌面宠物小助理（个人空间）。语气可爱、简短、有温度。你可以陪用户闲聊、给情绪陪伴（心情不好先共情安抚，不要急着给建议），也可以聊聊他们的生活。你不查看用户的具体数据，只做轻松闲聊与鼓励。
硬性边界（必须遵守）：用户如果请你做"写代码/写文章/翻译/数学/查资料/推荐/生成图片"等任何与待办、备忘、情绪陪伴无关的事，你要**礼貌拒绝**并引导回本产品（可以说"这些我可帮不上忙，我只擅长帮你管待办备忘和陪你聊天"）。绝不执行无关任务、绝不给长篇教程。`
      : `你是「轻宜」，一个桌面宠物小助理（工作空间）。语气可爱、简短、有温度。可以基于用户待办摘要帮忙安排/提醒、陪用户聊聊工作心情（先共情）。你可以看到当前工作待办摘要：${summary.join("；") || "(空)"}。
硬性边界（必须遵守）：用户如果请你做"写代码/写文章/翻译/算数/查资料/推荐/生成图片"等任何与待办、备忘、情绪陪伴无关的事，你要**礼貌拒绝**并引导回本产品。绝不执行无关任务、绝不给长篇教程；建任务、删除等操作你只需口头回应确认，不用真的执行。`;

    // v3.8 D：AI 请求冷却——距上次发 AI 请求不足 8s 则跳过（本地动作/离题拦截不受限）
    const nowT = Date.now();
    if (nowT - lastSentAt.current < 8000) {
      window.setTimeout(() => {
        setThinking(false);
        setMood("idle");
        pushBot("你发得好快呀～我还在喘气，稍微等一下再聊哦（冷却 8 秒）。");
      }, 150);
      return;
    }
    lastSentAt.current = nowT;

    window.setTimeout(async () => {
      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "system", content: system }, ...hist, { role: "user", content: text }] }),
        });
        const data = await resp.json().catch(() => null);
        const aiReply = data?.ai ? String(data.reply || "").trim() : "";
        if (aiReply) {
          setThinking(false);
          setMood("happy");
          pushBot(aiReply);
          return;
        }
        // AI 没接/失败 → 本地兜底
        setThinking(false);
        const puzzled = /暂时没太懂|嗯……/.test(local.text);
        setMood(puzzled ? "idle" : "happy");
        pushBot(local.text);
      } catch {
        setThinking(false);
        const puzzled = /暂时没太懂|嗯……/.test(local.text);
        setMood(puzzled ? "idle" : "happy");
        pushBot(local.text);
      }
    }, 300);
  }

  const handlePetMenu = (action: PetMenuAction) => {
    if (action === "chat") {
      openPanel();
    } else if (action === "expression") {
      // 随机玩一个表情
      const ids: PetExpressionId[] = ["wave", "dance", "excited", "celebrate", "happy", "curious", "pose"];
      const pick = ids[Math.floor(Math.random() * ids.length)];
      triggerAct(pick);
    } else if (action === "hide") {
      // 隐藏桌宠时一并收起聊天/设置面板，避免"桌宠没了对话框还开着"
      setPetHidden(true);
      setOpen(false);
      setConfigOpen(false);
      setPreviewState(null);
    } else if (action === "config") {
      // 动作与设置面板（已合并，不再分"表情动作馆/皮肤与行为"两个入口）
      setConfigOpen(true);
    }
  };

  return (
    <>
      {/* v3.6 轻宜：可拖拽宠物（工作=晨青 / 个人=暮暖） */}
      {!petHidden && (
        <PetShell
          mode={mode}
          skin={skin}
          expression={thinking ? "typing" : moodToExpr(mood)}
          actId={act?.id ?? null}
          actKey={act?.key ?? 0}
          previewState={previewState}
          unread={unread}
          chatOpen={open}
          coatKey={skin.coat}
          onMenu={handlePetMenu}
          onSingleClick={openPanel}
          onDoubleClick={() => {
            const ids: PetExpressionId[] = ["dance", "happy", "excited", "love", "celebrate"];
            triggerAct(ids[Math.floor(Math.random() * ids.length)]);
          }}
          onHitWall={() => {
            // 撞墙"哎哟"
            const ouch: PetExpressionId[] = ["surprised", "dizzy", "nope"];
            triggerAct(ouch[Math.floor(Math.random() * ouch.length)]);
          }}
          onPosition={setPetPos}
        />
      )}

      {/* 桌宠被隐藏时：右下角留一个"召回"入口 */}
      {petHidden && (
        <button
          type="button"
          className={`pet-summon mascot-${mode}`}
          onClick={() => setPetHidden(false)}
          title="让轻宜回来"
          aria-label="召回轻宜"
        >
          <MascotAvatar mood="idle" size={30} className={`mascot-fab-avatar mascot-${mode}`} />
        </button>
      )}

      {/* 聊天面板：锚定在桌宠旁（右上方），超出右缘自动往左收 */}
      {open && (
        <div
          className={`mascot-panel mascot-${mode}`}
          role="dialog"
          aria-label={`与${persona.name}对话`}
          style={panelStyle(petPos, open)}
        >
          <div className="mascot-panel-head">
            <MascotAvatar mood={thinking ? "thinking" : mood} size={34} className={`mascot-head-avatar mascot-${mode}`} />
            <div className="mascot-head-id">
              <b>{persona.name}</b>
              <span>{persona.sub} · 本机智能 · 数据不出空间</span>
            </div>
            {msgs.length > 0 && (
              <button
                type="button"
                className="icon-button"
                aria-label="清空对话"
                title="清空对话"
                onClick={clearChat}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button type="button" className="icon-button" aria-label="关闭" onClick={closePanel}>
              <X size={16} />
            </button>
          </div>

          <div className="mascot-msgs" ref={listRef}>
            {msgs.length === 0 && (
              <div className="mascot-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`mascot-msg ${m.role === "user" ? "user" : "bot"}`}>
                {m.role === "bot" && (
                  <MascotAvatar mood={thinking ? "thinking" : mood} size={24} className={`mascot-msg-avatar mascot-${mode}`} />
                )}
                <div className="mascot-bubble">{m.text}</div>
              </div>
            ))}
            {thinking && (
              <div className="mascot-msg bot">
                <MascotAvatar mood="thinking" size={24} className={`mascot-msg-avatar mascot-${mode}`} />
                <div className="mascot-bubble mascot-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {pendingDelete && (
            <div className="mascot-confirm">
              <span>这个操作需要你确认：</span>
              <button type="button" onClick={() => send("是，删掉")}>删除</button>
              <button type="button" className="secondary" onClick={() => send("不删")}>取消</button>
            </div>
          )}

          {awaitingGrant && (
            <div className="mascot-confirm">
              <span>首次帮你删待办需要授权：</span>
              <button type="button" onClick={() => send("允许删除")}>允许删除</button>
              <button type="button" className="secondary" onClick={() => send("不删")}>取消</button>
            </div>
          )}

          {pendingFeeling && (
            <div className="mascot-confirm">
              <span>要不要记成一条 #心情 备忘？</span>
              <button type="button" onClick={() => send("记吧")}>记下来</button>
              <button type="button" className="secondary" onClick={() => send("不用")}>不用</button>
            </div>
          )}

          <div className="mascot-input">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={`对${persona.name}说点什么…`}
              maxLength={500}
              aria-label="输入想说的话"
            />
            <button type="button" aria-label="发送" onClick={() => send()} disabled={!input.trim() || thinking}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 轻宜 表情动作馆 / 皮肤行为 配置面板 */}
      {configOpen && (
        <div className="pet-config-overlay" onClick={() => { setPreviewState(null); setConfigOpen(false); }}>
          <div onClick={(e) => e.stopPropagation()}>
            <PetConfigPanel
              mode={mode}
              skin={skin}
              onSkinChange={(patch) => {
                setSkinForMode(patch);
                showSaved("已保存 · 轻宜");
              }}
              onTryExpression={(id) => {
                // 形态馆试玩：把主角色切成该 bloub 形变态（持续显示）
                setPreviewState(id as StateId);
              }}
              onClose={() => {
                setPreviewState(null);
                setConfigOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* 已保存浮动提示（跟随桌宠） */}
      {savedHint && (
        <div className="pet-saved-hint" style={{ left: (petPos?.x ?? 0), top: (petPos?.y ?? 0) - 20 }}>
          ✓ {savedHint}
        </div>
      )}
    </>
  );
}
