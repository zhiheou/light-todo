import { CalendarRange, CheckCircle2, Flag, Plus, Target, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Dimension, Goal, GoalPeriod, Task } from "../types";
import { goalIsActive, goalProgress, anchorOf } from "../lib/goals";
import { dimensionColor } from "../lib/dimensions";

interface GoalsViewProps {
  goals: Goal[];
  tasks: Task[];
  dimensions: Dimension[];
  onAddGoal: (partial: Partial<Goal>) => string;
  onDeleteGoal: (id: string) => void;
  onSelectTask: (task: Task) => void;
}

const PERIOD_LABEL: Record<GoalPeriod, string> = {
  year: "年",
  month: "月",
  week: "周",
};

const PERIOD_ITEMS: Array<{ key: GoalPeriod; label: string }> = [
  { key: "year", label: "年目标" },
  { key: "month", label: "月目标" },
  { key: "week", label: "周目标" },
];

function periodTitle(goal: Goal): string {
  if (goal.period === "year") return `${goal.anchor} 年度`;
  if (goal.period === "month") {
    const [y, m] = goal.anchor.split("-").map(Number);
    return `${y}年${m}月`;
  }
  const [y, m, d] = goal.anchor.split("-").map(Number);
  return `${y}年${m}月${d}日 当周`;
}

export default function GoalsView({
  goals,
  tasks,
  dimensions,
  onAddGoal,
  onDeleteGoal,
  onSelectTask,
}: GoalsViewProps) {
  const [tab, setTab] = useState<GoalPeriod>("month");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const now = new Date();

  const list = goals
    .filter((g) => g.period === tab)
    .sort((a, b) => b.anchor.localeCompare(a.anchor) || b.createdAt - a.createdAt);

  const create = () => {
    const name = title.trim();
    if (!name) return;
    onAddGoal({ title: name, period: tab, anchor: anchorOf(tab, now), ...(note.trim() ? { note: note.trim() } : {}) });
    setTitle("");
    setNote("");
    setShowForm(false);
  };

  return (
    <div className="goals-view">
      <div className="goals-toolbar">
        <div className="segmented" role="group" aria-label="目标周期">
          {PERIOD_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? "active" : ""}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={showForm ? "add-button active" : "add-button"}
          onClick={() => setShowForm((v) => !v)}
          aria-label="新建目标"
        >
          <Plus size={16} />
        </button>
      </div>

      {showForm && (
        <div className="goals-form">
          <div className="goals-form-row">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder={`${PERIOD_LABEL[tab]}目标，例如：读完一本书`}
              aria-label="目标标题"
            />
            <button type="button" className="goals-form-create" onClick={create}>
              创建
            </button>
            <button
              type="button"
              className="goals-form-cancel"
              onClick={() => setShowForm(false)}
              aria-label="取消"
            >
              <X size={15} />
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="备注（可选）"
            aria-label="目标备注"
          />
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <Target size={28} />
          <span>还没有{PERIOD_LABEL[tab]}目标</span>
          <button type="button" className="empty-action" onClick={() => setShowForm(true)}>
            新建一个
          </button>
        </div>
      ) : (
        <div className="goals-list">
          {list.map((goal) => {
            const { done, total, ratio } = goalProgress(goal, tasks);
            const active = goalIsActive(goal, now);
            const linked = tasks.filter((t) => t.goalId === goal.id);
            const percent = total === 0 ? 0 : Math.round(ratio * 100);
            return (
              <div className={["goal-card", active ? "active" : ""].join(" ")} key={goal.id}>
                <div className="goal-card-head">
                  <div className="goal-card-title-wrap">
                    <span className="goal-card-period">{PERIOD_LABEL[goal.period]}</span>
                    <span className="goal-card-title">{goal.title}</span>
                    {active && <span className="goal-card-active">进行中</span>}
                  </div>
                  <span className="goal-card-count">
                    {total ? `${done}/${total}` : "0/0"}
                  </span>
                  <button
                    type="button"
                    className="goal-card-delete"
                    aria-label="删除目标"
                    onClick={() => onDeleteGoal(goal.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="goal-card-meta">
                  <CalendarRange size={12} />
                  {periodTitle(goal)}
                  {goal.note && <span className="goal-card-note">{goal.note}</span>}
                </div>
                <div className="goal-card-progress">
                  <div className="goal-card-bar">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <span className="goal-card-percent">{percent}%</span>
                </div>
                {linked.length > 0 && (
                  <div className="goal-card-tasks">
                    {linked.slice(0, 4).map((task) => {
                      const dim = dimensions.find((d) => d.id === task.dimensionId);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          className={["goal-task", task.completed ? "done" : ""].join(" ")}
                          onClick={() => onSelectTask(task)}
                        >
                          {task.completed ? <CheckCircle2 size={13} /> : <Flag size={13} />}
                          <span>{task.title}</span>
                          {dim && <i style={{ background: dimensionColor(dim.color) }} />}
                        </button>
                      );
                    })}
                    {linked.length > 4 && <span className="goal-card-more">+{linked.length - 4} 更多</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
