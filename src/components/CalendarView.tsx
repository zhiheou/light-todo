import type { CSSProperties } from "react";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flag,
  Target,
} from "lucide-react";
import type { Dimension, Goal, Task } from "../types";
import { goalProgress, goalIsActive } from "../lib/goals";
import { dimensionColor } from "../lib/dimensions";

interface CalendarViewProps {
  tasks: Task[];
  goals: Goal[];
  dimensions: Dimension[];
  onSelectTask: (task: Task) => void;
}

type CalendarLevel = "week" | "month" | "year";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day === 0 ? 6 : day - 1));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const LEVEL_ITEMS: Array<{ key: CalendarLevel; label: string }> = [
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
];

/** 周视图：当周日历表 + 本周目标 + 当周完成统计 */
function WeekView({
  monday,
  tasks,
  goals,
  dimensions,
  onSelectTask,
}: {
  monday: Date;
  tasks: Task[];
  goals: Goal[];
  dimensions: Dimension[];
  onSelectTask: (task: Task) => void;
}) {
  const today = new Date();
  const todayKey = dateKey(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const list = tasksByDay.get(task.dueDate) ?? [];
    list.push(task);
    tasksByDay.set(task.dueDate, list);
  }

  // 本周目标：周目标（锚点=本周一）优先，其次是进行中的月/年目标
  const weekAnchor = dateKey(monday);
  const weekGoals = goals.filter((g) => g.period === "week" && g.anchor === weekAnchor);
  const activeGoals = goals
    .filter((g) => g.period !== "week" && goalIsActive(g, today))
    .slice(0, 3);

  // 当周统计
  const weekTasks = tasks.filter((t) => {
    const k = t.dueDate;
    return k && k >= dateKey(days[0]) && k <= dateKey(days[6]);
  });
  const weekDone = weekTasks.filter((t) => t.completed).length;
  const weekTotal = weekTasks.length;
  const weekRatio = weekTotal === 0 ? 0 : weekDone / weekTotal;
  const ring = weekRatio * 100;

  const weekKey = `${monday.getFullYear()}年${monday.getMonth() + 1}月${monday.getDate()}日`;
  const endLabel = `${days[6].getMonth() + 1}月${days[6].getDate()}日`;

  return (
    <div className="calendar-week">
      <div className="calendar-week-head">
        <h3 className="calendar-week-range">
          {weekKey} – {endLabel}
        </h3>
        <span className="calendar-week-summary">
          已完成 <b>{weekDone}</b>/{weekTotal}
        </span>
      </div>

      {/* 当周日历表 */}
      <div className="calendar-week-grid">
        {days.map((day) => {
          const key = dateKey(day);
          const list = tasksByDay.get(key) ?? [];
          const isToday = key === todayKey;
          const dayName = `周${WEEKDAYS[day.getDay() === 0 ? 6 : day.getDay() - 1]}`;
          const isPast = day.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          return (
            <div
              key={key}
              className={["calendar-day", isToday ? "today" : "", isPast ? "past" : ""].join(" ")}
            >
              <div className="calendar-day-head">
                <span className="calendar-day-name">{dayName}</span>
                <span className="calendar-day-num">{day.getDate()}</span>
              </div>
              <div className="calendar-day-tasks">
                {list.slice(0, 4).map((task) => {
                  const dim = dimensions.find((d) => d.id === task.dimensionId);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={["calendar-task", task.completed ? "done" : ""].join(" ")}
                      style={dim ? { borderColor: dimensionColor(dim.color) } : undefined}
                      onClick={() => onSelectTask(task)}
                      title={task.title}
                    >
                      {task.completed ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                      <span>{task.title}</span>
                    </button>
                  );
                })}
                {list.length > 4 && <span className="calendar-more">+{list.length - 4} 更多</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="calendar-week-bottom">
        {/* 本周目标 */}
        <div className="calendar-week-goals">
          <div className="section-head">
            <Target size={14} />
            <h2>本周目标</h2>
          </div>
          {weekGoals.length === 0 && activeGoals.length === 0 ? (
            <div className="calendar-empty-tip">本周还没有目标，去「目标」页添加一个吧</div>
          ) : (
            <>
              {weekGoals.map((goal) => (
                <GoalChip key={goal.id} goal={goal} tasks={tasks} />
              ))}
              {activeGoals.map((goal) => (
                <GoalChip key={goal.id} goal={goal} tasks={tasks} active />
              ))}
            </>
          )}
        </div>

        {/* 当周统计 */}
        <div className="calendar-week-stats">
          <div className="section-head">
            <Flag size={14} />
            <h2>当周统计</h2>
          </div>
          <div className="calendar-stats-row">
            <div className="calendar-ring" style={{ "--ring": `${ring}%` } as CSSProperties}>
              <span>{weekTotal === 0 ? "—" : `${weekDone}/${weekTotal}`}</span>
            </div>
            <div className="calendar-stats-labels">
              <div>
                <span className="stat-dot done" />
                已完成
                <b>{weekDone}</b>
              </div>
              <div>
                <span className="stat-dot total" />
                共计划
                <b>{weekTotal}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalChip({ goal, tasks, active }: { goal: Goal; tasks: Task[]; active?: boolean }) {
  const { done, total, ratio } = goalProgress(goal, tasks);
  return (
    <div className={["goal-chip", active ? "active" : ""].join(" ")}>
      <span className="goal-chip-title">{goal.title}</span>
      <span className="goal-chip-count">{total ? `${done}/${total}` : "0/0"}</span>
      <span className="goal-chip-bar">
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </div>
  );
}

/** 月视图：CSS Grid 日历 */
function MonthView({
  month,
  tasks,
  dimensions,
  onSelectTask,
}: {
  month: Date;
  tasks: Task[];
  dimensions: Dimension[];
  onSelectTask: (task: Task) => void;
}) {
  const todayKey = dateKey(new Date());
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const firstWeekday = first.getDay(); // 0=日
  const cellsBefore = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const gridStart = addDays(first, -cellsBefore);
  const totalCells = Math.ceil((cellsBefore + daysInMonth) / 7) * 7;

  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const list = tasksByDay.get(task.dueDate) ?? [];
    list.push(task);
    tasksByDay.set(task.dueDate, list);
  }

  return (
    <div className="calendar-month">
      <div className="calendar-month-head">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-month-col-label">
            {w}
          </span>
        ))}
      </div>
      <div className="calendar-month-grid">
        {Array.from({ length: totalCells }, (_, i) => {
          const day = addDays(gridStart, i);
          const key = dateKey(day);
          const inMonth = day.getMonth() === m;
          const isToday = key === todayKey;
          const list = tasksByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={[
                "calendar-month-cell",
                inMonth ? "" : "outside",
                isToday ? "today" : "",
              ].join(" ")}
            >
              <span className="calendar-month-day">{day.getDate()}</span>
              <div className="calendar-month-tasks">
                {list.slice(0, 2).map((task) => {
                  const dim = dimensions.find((d) => d.id === task.dimensionId);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={["calendar-task", task.completed ? "done" : ""].join(" ")}
                      style={dim ? { borderColor: dimensionColor(dim.color) } : undefined}
                      onClick={() => onSelectTask(task)}
                      title={task.title}
                    >
                      <span>{task.title}</span>
                    </button>
                  );
                })}
                {list.length > 2 && <span className="calendar-more">+{list.length - 2}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 年视图：12 个月热力图 */
function YearView({ year, tasks }: { year: number; tasks: Task[] }) {
  const doneByDay = new Map<string, number>();
  for (const task of tasks) {
    if (!task.completed || typeof task.completedAt !== "number") continue;
    const key = dateKey(new Date(task.completedAt));
    doneByDay.set(key, (doneByDay.get(key) ?? 0) + 1);
  }
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

  // 热力等级：0 完成 → level0；1-2 → 1；3-4 → 2；5-8 → 3；9+ → 4
  function level(count: number): number {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 8) return 3;
    return 4;
  }

  return (
    <div className="calendar-year">
      <div className="calendar-year-head">
        <span className="calendar-year-title">{year} 全年完成热力图</span>
        <span className="calendar-year-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`heat heat-${l}`} />
          ))}
          <span>多</span>
        </span>
      </div>
      <div className="calendar-year-grid">
        {months.map((_, mi) => {
          const daysIn = new Date(year, mi + 1, 0).getDate();
          const first = new Date(year, mi, 1);
          const leading = first.getDay() === 0 ? 6 : first.getDay() - 1;
          const cells = Array.from({ length: Math.ceil((leading + daysIn) / 7) * 7 }, (_, i) =>
            addDays(first, i - leading),
          );
          return (
            <div key={mi} className="calendar-year-month">
              <span className="calendar-year-month-label">{monthNames[mi]}</span>
              <div className="calendar-year-month-grid">
                {cells.map((d, di) => {
                  const inMonth = d.getMonth() === mi;
                  const count = doneByDay.get(dateKey(d)) ?? 0;
                  const lv = inMonth ? level(count) : 0;
                  return <i key={di} className={`heat heat-${lv}${inMonth ? "" : " blank"}`} title={inMonth ? `${dateKey(d)} 完成 ${count}` : ""} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="calendar-year-summary">
        本年度共完成{" "}
        <b>
          {
            months.reduce((sum, _, mi) => {
              const daysIn = new Date(year, mi + 1, 0).getDate();
              let s = 0;
              for (let d = 1; d <= daysIn; d += 1) {
                s += doneByDay.get(`${year}-${pad(mi + 1)}-${pad(d)}`) ?? 0;
              }
              return sum + s;
            }, 0)
          }
        </b>{" "}
        项任务
      </div>
    </div>
  );
}

export default function CalendarView({
  tasks,
  goals,
  dimensions,
  onSelectTask,
}: CalendarViewProps) {
  const [level, setLevel] = useState<CalendarLevel>("week");
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));

  const shift = (n: number) => {
    if (level === "week") setCursor((c) => addDays(c, n * 7));
    else if (level === "month") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
    else setCursor((c) => new Date(c.getFullYear() + n, 0, 1));
  };

  const title =
    level === "week"
      ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
      : level === "month"
        ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
        : `${cursor.getFullYear()}年`;

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" aria-label="上一周/月/年" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="calendar-today-btn"
            onClick={() => setCursor(startOfWeek(new Date()))}
          >
            今天
          </button>
          <button type="button" aria-label="下一周/月/年" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
        <h3 className="calendar-title">{title}</h3>
        <div className="segmented" role="group" aria-label="日历粒度">
          {LEVEL_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={level === item.key ? "active" : ""}
              onClick={() => setLevel(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {level === "week" && (
        <WeekView
          monday={cursor}
          tasks={tasks}
          goals={goals}
          dimensions={dimensions}
          onSelectTask={onSelectTask}
        />
      )}
      {level === "month" && (
        <MonthView month={cursor} tasks={tasks} dimensions={dimensions} onSelectTask={onSelectTask} />
      )}
      {level === "year" && <YearView year={cursor.getFullYear()} tasks={tasks} />}
    </div>
  );
}
