import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { Mode, MascotMood, Task } from "../types";
import type { TaskDraft } from "./AddDialog";
import MascotAvatar from "./MascotAvatar";
import {
  answer,
  cancelDelete,
  confirmDelete,
  readConfirm,
  type BrainAction,
  type BrainCtx,
} from "../lib/mascotBrain";

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
  const seenNudge = useRef<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const persona = PERSONA[mode];
  const msgs = chat[mode];

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
        break;
      }
      case "addMemo":
        onAddMemo(action.text);
        break;
      case "openTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onOpenTask(t);
        break;
      }
      case "confirm":
        setPendingDelete({ candidateId: action.candidateId });
        break;
      case "deleteTask": {
        const t = tasks.find((x) => x.id === action.id);
        if (t) onDeleteTask(t);
        setPendingDelete(null);
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
      setMood(reply.action ? "happy" : "idle");
      pushBot(reply.text);
      runAction(reply.action);
    }, 260);
  }

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        className={`mascot-fab mascot-${mode}`}
        aria-label={`和${persona.name}聊天`}
        onClick={openPanel}
      >
        <MascotAvatar mood={mood} size={58} className={`mascot-fab-avatar mascot-${mode}`} />
        {unread > 0 && <span className="mascot-unread">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {/* 聊天面板 */}
      {open && (
        <div className={`mascot-panel mascot-${mode}`} role="dialog" aria-label={`与${persona.name}对话`}>
          <div className="mascot-panel-head">
            <MascotAvatar mood={mood} size={34} className={`mascot-head-avatar mascot-${mode}`} />
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
                  <MascotAvatar mood={mood} size={24} className={`mascot-msg-avatar mascot-${mode}`} />
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
    </>
  );
}
