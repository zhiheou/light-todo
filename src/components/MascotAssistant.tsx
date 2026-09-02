import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { Mode, MascotMood, PetExpressionId, PetSkin, Task } from "../types";
import type { TaskDraft } from "./AddDialog";
import MascotAvatar from "./MascotAvatar";
import PetShell, { type PetMenuAction } from "./PetShell";
import { PetConfigPanel } from "./PetConfigPanel";
import {
  answer,
  cancelDelete,
  confirmDelete,
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
  onAddMemo: (text: string) => void;
  onOpenTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  /** App 侧主动推送的消息（登录问候/闲置搭话/到点提醒） */
  nudges: MascotNudge[];
}

const PERSONA: Record<Mode, { name: string; label: string; sub: string }> = {
  work: { name: "小轻", label: "工作助理", sub: "工作 · 进度 · 安排" },
  personal: { name: "小安", label: "个人助理", sub: "个人 · 生活 · 私事" },
};

const SUGGESTIONS = ["帮我记个待办：明天下午4点开会", "把这段话记到备忘录：买牛奶", "今天有什么安排？"];

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
  nudges,
}: MascotAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<MascotMood>("idle");
  const [thinking, setThinking] = useState(false);
  const [chat, setChat] = useState<Record<Mode, Msg[]>>({ work: [], personal: [] });
  const [pendingDelete, setPendingDelete] = useState<{ candidateId: string } | null>(null);
  const [unread, setUnread] = useState(0);
  /** 配置面板：表情动作馆 / 皮肤行为 */
  const [configOpen, setConfigOpen] = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<"life" | "emotion" | "work" | "coat">("life");
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
  const [act, setAct] = useState<{ id: PetExpressionId; key: number } | null>(null);
  const [petHidden, setPetHidden] = useState(false);
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

  // 滚动到底
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
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
      case "addMemo":
        onAddMemo(action.text);
        triggerAct("done");
        break;
      case "openTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onOpenTask(t);
        break;
      }
      case "confirm":
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

    // 本地小脑即时回答；留一点停顿感更像真人
    window.setTimeout(() => {
      const ctx: BrainCtx = { tasks, persona: mode };
      const reply = answer(text, ctx);
      setThinking(false);
      if (reply.action) {
        if (reply.action.type === "confirm") setMood("listening");
        else setMood("happy");
        pushBot(reply.text);
        runAction(reply.action);
      } else {
        // 没听懂兜底 / 纯聊天 → 温和困惑
        const puzzled = /暂时没太懂|嗯……/.test(reply.text);
        setMood(puzzled ? "idle" : "happy");
        pushBot(reply.text);
      }
    }, 260);
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
      setPetHidden(true);
    } else if (action === "studio" || action === "settings") {
      // 表情动作馆 / 皮肤与行为：打开配置面板（对应 tab）
      setOpen(true);
      setConfigInitialTab(action === "studio" ? "life" : "coat");
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
          chatOpen={open}
          unread={unread}
          coatKey={skin.coat}
          onMenu={handlePetMenu}
          onSingleClick={openPanel}
          onDoubleClick={() => {
            const ids: PetExpressionId[] = ["dance", "happy", "excited", "love", "celebrate"];
            triggerAct(ids[Math.floor(Math.random() * ids.length)]);
          }}
        />
      )}

      {/* 聊天面板 */}
      {open && (
        <div className={`mascot-panel mascot-${mode}`} role="dialog" aria-label={`与${persona.name}对话`}>
          <div className="mascot-panel-head">
            <MascotAvatar mood={thinking ? "thinking" : mood} size={34} className={`mascot-head-avatar mascot-${mode}`} />
            <div className="mascot-head-id">
              <b>{persona.name}</b>
              <span>{persona.sub} · 本机智能 · 数据不出空间</span>
            </div>
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

          <div className="mascot-input">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={`对${persona.name}说点什么…`}
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
        <div className="pet-config-overlay" onClick={() => setConfigOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <PetConfigPanel
              mode={mode}
              skin={skin}
              initialTab={configInitialTab}
              onSkinChange={setSkinForMode}
              onTryExpression={(id) => {
                triggerAct(id);
              }}
              onClose={() => setConfigOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
