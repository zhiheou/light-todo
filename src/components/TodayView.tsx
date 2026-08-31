import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  ListTodo,
  Plus,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Trash2,
} from "lucide-react";
import { useState, Fragment } from "react";
import type { Dimension, Task, TodayMode } from "../types";
import { isOverdue } from "../lib/tasks";
import { dimensionColor } from "../lib/dimensions";
import TaskList from "./TaskList";

interface TodayViewProps {
  open: Task[];
  done: Task[];
  dimensions: Dimension[];
  /** 今日页形态切换；持久化在外部（App 层 viewPrefs 同键） */
  mode: TodayMode;
  onModeChange: (mode: TodayMode) => void;
  showCompleted: boolean;
  full: boolean;
  onToggle: (id: string) => void;
  onSelect: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** 维度管理（维度打卡形态下使用） */
  onAddDimension?: (name: string) => void;
  onDeleteDimension?: (id: string) => void;
  onRenameDimension?: (id: string, name: string) => void;
}

const MODE_ITEMS: Array<{ key: TodayMode; label: string; icon: typeof ListTodo }> = [
  { key: "list", label: "清单", icon: ListTodo },
  { key: "dimension", label: "维度", icon: Layers },
  { key: "timeline", label: "时间线", icon: Clock },
  { key: "schedule", label: "日程", icon: CalendarClock },
];

/** 时间线/日程排序键：无截止时间 → "zz"（排最后），有 → HH:mm */
function timeKey(task: Task): string {
  return task.dueTime ? task.dueTime : "zz";
}

function TimelineRow({ task, onToggle, onSelect }: { task: Task; onToggle: (id: string) => void; onSelect: (task: Task) => void }) {
  const now = new Date();
  const overdue = isOverdue(task, now);
  return (
    <article
      className={["task-row", "timeline", task.completed ? "done" : ""].join(" ")}
      onClick={() => onSelect(task)}
    >
      <button
        type="button"
        className="check"
        aria-label={task.completed ? "标记为未完成" : "标记完成"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(task.id);
        }}
      >
        {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      <div className="timeline-time">{task.dueTime || "全天"}</div>
      <div className="task-main">
        <div className="task-title-line">
          <span className="task-title">{task.title}</span>
          {overdue && <span className="meta-chip overdue">已逾期</span>}
        </div>
      </div>
    </article>
  );
}

function ScheduleRow({ task, onToggle, onSelect }: { task: Task; onToggle: (id: string) => void; onSelect: (task: Task) => void }) {
  const now = new Date();
  const overdue = isOverdue(task, now);
  return (
    <article
      className={["task-row", task.completed ? "done" : ""].join(" ")}
      onClick={() => onSelect(task)}
    >
      <button
        type="button"
        className="check"
        aria-label={task.completed ? "标记为未完成" : "标记完成"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(task.id);
        }}
      >
        {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      <div className="task-main">
        <div className="task-title-line">
          <span className="task-title">{task.title}</span>
          {overdue && <span className="meta-chip overdue">已逾期</span>}
        </div>
        {task.dueTime && <div className="schedule-time">{task.dueTime}</div>}
      </div>
    </article>
  );
}

/** 维度打卡：按维度分组 + 进度条 */
function DimensionMode({
  tasks,
  dimensions,
  onToggle,
  onSelect,
  onDelete,
  onAddDimension,
  onDeleteDimension,
  onRenameDimension,
}: {
  tasks: Task[];
  dimensions: Dimension[];
  onToggle: (id: string) => void;
  onSelect: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddDimension?: (name: string) => void;
  onDeleteDimension?: (id: string) => void;
  onRenameDimension?: (id: string, name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dims = dimensions.length > 0 ? dimensions : [];
  const grouped = dims.map((dim) => ({
    dim,
    tasks: tasks.filter((t) => t.dimensionId === dim.id),
  }));
  const unassigned = tasks.filter((t) => !t.dimensionId);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    onAddDimension?.(n);
    setName("");
    setAdding(false);
  };

  const commitRename = (dim: Dimension) => {
    const n = renameValue.trim();
    if (n) onRenameDimension?.(dim.id, n);
    setRenaming(null);
  };

  const renderGroup = (title: string, color: string, list: Task[]) => {
    const total = list.length;
    const done = list.filter((t) => t.completed).length;
    const ratio = total === 0 ? 0 : Math.round((done / total) * 100);
    return (
      <div className="dimension-group">
        <div className="dimension-head">
          <span className="dimension-dot" style={{ background: dimensionColor(color) }} />
          <span className="dimension-name">{title}</span>
          <span className="dimension-progress-text">{total ? `${done}/${total}` : "0/0"}</span>
        </div>
        {total > 0 && (
          <div className="dimension-progress">
            <div className="dimension-progress-fill" style={{ width: `${ratio}%`, background: dimensionColor(color) }} />
          </div>
        )}
        <TaskList
          tasks={list}
          selectedId={null}
          full={false}
          emptyText="还没有任务"
          onToggle={onToggle}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      </div>
    );
  };

  return (
    <div className="dimension-mode">
      {grouped.map(({ dim, tasks: list }) => (
        <div className="dimension-group" key={dim.id}>
          <div className="dimension-head">
            <span className="dimension-dot" style={{ background: dimensionColor(dim.color) }} />
            {renaming === dim.id ? (
              <input
                autoFocus
                className="dimension-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(dim)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(dim);
                  if (e.key === "Escape") setRenaming(null);
                }}
                aria-label="重命名维度"
              />
            ) : (
              <span
                className="dimension-name"
                title={onRenameDimension ? "双击重命名" : undefined}
                onDoubleClick={
                  onRenameDimension
                    ? () => {
                        setRenaming(dim.id);
                        setRenameValue(dim.name);
                      }
                    : undefined
                }
              >
                {dim.name}
              </span>
            )}
            <span className="dimension-progress-text">
              {list.filter((t) => t.completed).length}/{list.length}
            </span>
            <button
              type="button"
              className="dimension-delete"
              aria-label={`删除维度 ${dim.name}`}
              onClick={() => onDeleteDimension?.(dim.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
          {list.length > 0 && (
            <div className="dimension-progress">
              <div
                className="dimension-progress-fill"
                style={{
                  width: `${list.filter((t) => t.completed).length / list.length * 100}%`,
                  background: dimensionColor(dim.color),
                }}
              />
            </div>
          )}
          <TaskList
            tasks={list}
            selectedId={null}
            full={false}
            emptyText="还没有任务"
            onToggle={onToggle}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        </div>
      ))}
      {unassigned.length > 0 && (
        <Fragment key="unassigned">{renderGroup("未分配", "gray", unassigned)}</Fragment>
      )}
      {onAddDimension && (
        <div className="dimension-add" key="dimension-add">
          {adding ? (
            <div className="dimension-add-form">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="新维度名称"
                aria-label="新维度名称"
              />
              <button type="button" className="dimension-add-btn" onClick={create}>
                添加
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="dimension-add-toggle"
              onClick={() => setAdding(true)}
            >
              <Plus size={13} />
              新建维度
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 时间线：按截止时间排序 */
function TimelineMode({
  tasks,
  onToggle,
  onSelect,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onSelect: (task: Task) => void;
}) {
  const sorted = [...tasks].sort((a, b) => timeKey(a).localeCompare(timeKey(b)));
  if (sorted.length === 0) {
    return (
      <div className="empty">
        <Clock size={28} />
        <span>今天还没有任务</span>
      </div>
    );
  }
  return (
    <div>
      {sorted.map((task) => (
        <TimelineRow key={task.id} task={task} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** 日程：全天 / 上午 / 下午 / 晚上 */
function ScheduleMode({
  tasks,
  onToggle,
  onSelect,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onSelect: (task: Task) => void;
}) {
  const buckets: Array<{ key: string; label: string; icon: typeof Sun; test: (t: Task) => boolean }> = [
    { key: "all", label: "全天", icon: Sunrise, test: (t) => !t.dueTime },
    { key: "am", label: "上午", icon: Sun, test: (t) => !!t.dueTime && t.dueTime < "12:00" },
    { key: "pm", label: "下午", icon: Sunset, test: (t) => !!t.dueTime && t.dueTime >= "12:00" && t.dueTime < "18:00" },
    { key: "night", label: "晚上", icon: Moon, test: (t) => !!t.dueTime && t.dueTime >= "18:00" },
  ];
  const any = tasks.length > 0;
  return (
    <div className="today-sections">
      {buckets.map((bucket) => {
        const list = tasks.filter(bucket.test);
        if (list.length === 0) return null;
        const Icon = bucket.icon;
        return (
          <div className="today-section" key={bucket.key}>
            <div className="section-head">
              <Icon size={14} />
              <h2>{bucket.label}</h2>
              <span className="section-count">{list.length}</span>
            </div>
            {list.map((task) => (
              <ScheduleRow key={task.id} task={task} onToggle={onToggle} onSelect={onSelect} />
            ))}
          </div>
        );
      })}
      {!any && (
        <div className="empty">
          <CalendarClock size={28} />
          <span>今天还没有任务</span>
        </div>
      )}
    </div>
  );
}

export default function TodayView({
  open,
  done,
  dimensions,
  mode,
  onModeChange,
  showCompleted,
  full,
  onToggle,
  onSelect,
  onDelete,
  onAddDimension,
  onDeleteDimension,
  onRenameDimension,
}: TodayViewProps) {
  const all = [...open, ...done];
  return (
    <div className="today-view">
      <div className="today-modes" role="group" aria-label="今日视图形态">
        {MODE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={mode === item.key ? "active" : ""}
              onClick={() => onModeChange(item.key)}
            >
              <Icon size={14} />
              {item.label}
            </button>
          );
        })}
      </div>

      {mode === "list" && (
        <div className="today-sections">
          <div className="today-section">
            <div className="section-head">
              <h2>今日待办</h2>
              <span className="section-count">{open.length}</span>
            </div>
            <TaskList
              tasks={open}
              selectedId={null}
              full={full}
              emptyText="今天没有待办"
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          </div>
          {showCompleted && done.length > 0 && (
            <div className="today-section done-section">
              <div className="section-head">
                <h2>今日已完成</h2>
                <span className="section-count">{done.length}</span>
              </div>
              <TaskList
                tasks={done}
                selectedId={null}
                full={full}
                onToggle={onToggle}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            </div>
          )}
        </div>
      )}

      {mode === "dimension" && (
        <DimensionMode
          tasks={all}
          dimensions={dimensions}
          onToggle={onToggle}
          onSelect={onSelect}
          onDelete={onDelete}
          onAddDimension={onAddDimension}
          onDeleteDimension={onDeleteDimension}
          onRenameDimension={onRenameDimension}
        />
      )}

      {mode === "timeline" && (
        <TimelineMode tasks={all} onToggle={onToggle} onSelect={onSelect} />
      )}

      {mode === "schedule" && (
        <ScheduleMode tasks={all} onToggle={onToggle} onSelect={onSelect} />
      )}
    </div>
  );
}
