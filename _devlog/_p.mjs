// src/lib/tasks.ts
function isOverdue(task, now) {
  if (task.completed || !task.dueDate) return false;
  const due = /* @__PURE__ */ new Date(`${task.dueDate}T${task.dueTime || "23:59"}:59`);
  return due.getTime() < now.getTime();
}

// src/lib/nlp.ts
var WEEKDAYS = {
  \u4E00: 1,
  \u4E8C: 2,
  \u4E09: 3,
  \u56DB: 4,
  \u4E94: 5,
  \u516D: 6,
  \u65E5: 0,
  \u5929: 0
};
function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateString2(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfDay(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function nextDayWith(target, now) {
  const d = startOfDay(now);
  while (!target(d)) d.setDate(d.getDate() + 1);
  return d;
}
function isWeekday(d) {
  return d.getDay() !== 0 && d.getDay() !== 6;
}
function nextMonthlyDay(day, now) {
  const today = startOfDay(now);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastThisMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const target = Math.min(day, lastThisMonth);
  const candidate = new Date(first.getFullYear(), first.getMonth(), target);
  if (candidate.getTime() >= today.getTime()) return candidate;
  const nextLast = new Date(first.getFullYear(), first.getMonth() + 2, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth() + 1, Math.min(day, nextLast));
}
function nextWeekday(day, now) {
  return nextDayWith((d) => d.getDay() === day, now);
}
function startOfNextWeek(now) {
  const monday = startOfDay(now);
  const offset = (now.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset + 7);
  return monday;
}
var PRIORITY_RULES = [
  { re: /(高|紧急|P1|p1)/, p: 1, strip: /(高|紧急|P1|p1)/ },
  { re: /(重要|P2|p2)/, p: 2, strip: /(重要|P2|p2)/ },
  { re: /(低|P3|p3)/, p: 3, strip: /(低|P3|p3)/ },
  { re: /(无|P4|p4)/, p: 4, strip: /(无|P4|p4)/ }
];
function parseTime(text) {
  const colon = text.match(/(\d{1,2})[:：](\d{1,2})/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    const isPm = /(下午|晚上|傍晚)/.test(text);
    let h = hour;
    if (isPm && h < 12) h += 12;
    return { time: `${pad(h)}:${pad(minute)}`, isPm };
  }
  const dian = text.match(/(\d{1,2})点(半|一刻|三刻|\d{1,2}分?)?/);
  if (dian) {
    let hour = Number(dian[1]);
    let minute = 0;
    const suffix = dian[2];
    if (suffix === "\u534A") minute = 30;
    else if (suffix === "\u4E00\u523B") minute = 15;
    else if (suffix === "\u4E09\u523B") minute = 45;
    else if (suffix) minute = Number(suffix.replace(/分$/, "")) || 0;
    const isPm = /(下午|晚上|傍晚)/.test(text);
    if (isPm && hour < 12) hour += 12;
    return { time: `${pad(hour)}:${pad(minute)}`, isPm };
  }
  return null;
}
var STRIP_RULES = [
  /(高|紧急|P1|p1|重要|P2|p2|低|P3|p3|无|P4|p4)/g,
  /每月\d{1,2}[日号]/g,
  /每(?:周|星期)[一二三四五六日天]/g,
  /每个工作日|工作日/g,
  /每(?:隔)?\d{1,2}天/g,
  /每天|每日/g,
  /(?:这|本|下)?(?:周|星期)[一二三四五六日天]/g,
  /(?:下|本|这)个?月|周末|尽快|尽早|抓紧/g,
  /今天|明天|后天|大后天/g,
  /(?:下班|中午|傍晚|晚饭|今天|明天|后天)?(?:前|之前|以前)/g,
  /月(?:底|末)/g,
  /(?:之前|以前|之内|以内|内)\s*(?:完成|提交|交|给|发|处理|搞定|弄好)?/g,
  /(?:下班|中午|傍晚|晚饭|早上|上午|下午|晚上|深夜|清晨|凌晨)/g,
  /\d{1,2}[月/]\d{1,2}[日号]?/g,
  /\d{1,2}[日号]/g,
  /\d{4}-\d{1,2}-\d{1,2}/g,
  /\d{1,2}[:：]\d{1,2}/g,
  /\d{1,2}点(?:半|一刻|三刻|\d{1,2}分?)?/g,
  /\d{1,2}\s*(?:天|日)\s*(?:之?内|内)/g,
  /提醒/g
];
function stripTokens(title) {
  let clean = normalizeCnTime(title);
  for (const rule of STRIP_RULES) clean = clean.replace(rule, " ");
  clean = clean.replace(/^\s*(?:记得|别忘了|记住|记着)\s*[，,：:、]?\s*/, "");
  clean = clean.replace(
    /^\s*(?:请|麻烦|你|好呀|好的|可以)?\s*(?:帮我|给我|替我)?\s*(?:记|建|添加|加|设|安排|存|放)(?:个|一个|一下)?\s*(?:待办|任务|事项|备忘录|提醒)?\s*(?:里|中|上面)?\s*[，,：:、]?\s*/,
    ""
  );
  clean = clean.replace(/^\s*(请|麻烦|帮我|记得|提醒|我|你|一下)+\s*/g, " ");
  clean = clean.replace(/\s+/g, " ").replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "");
  return clean.trim();
}
var CN_NUM = { \u4E00: 1, \u4E8C: 2, \u4E24: 2, \u4E09: 3, \u56DB: 4, \u4E94: 5, \u516D: 6, \u4E03: 7, \u516B: 8, \u4E5D: 9, \u5341: 10 };
function cnToNum(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "\u5341") return 10;
  if (s.length === 2 && s[0] === "\u5341") return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.length === 2 && s[1] === "\u5341") return (CN_NUM[s[0]] ?? 0) * 10;
  if (s.length === 3 && s[1] === "\u5341") return (CN_NUM[s[0]] ?? 0) * 10 + (CN_NUM[s[2]] ?? 0);
  if (s.length === 1 && CN_NUM[s] !== void 0) return CN_NUM[s];
  return null;
}
function normalizeCnTime(text) {
  let t = text;
  t = t.replace(/明早/g, "\u660E\u5929\u65E9\u4E0A").replace(/明晚/g, "\u660E\u5929\u665A\u4E0A").replace(/明儿个?/g, "\u660E\u5929").replace(/后儿个?/g, "\u540E\u5929").replace(/今早/g, "\u4ECA\u5929\u65E9\u4E0A").replace(/今儿个?/g, "\u4ECA\u5929").replace(/今晚/g, "\u4ECA\u5929\u665A\u4E0A").replace(/半晌|晌午/g, "\u4E2D\u5348");
  t = t.replace(/([一二两三四五六七八九十]{1,3})(?=\s*(?:点|号|日))/g, (m) => {
    const n = cnToNum(m);
    return n === null ? m : String(n);
  });
  return t;
}
function parseQuickAdd(input) {
  const title = input.title.trim();
  const notes = (input.notes ?? "").trim();
  const now = input.now ?? /* @__PURE__ */ new Date();
  const merged = normalizeCnTime(`${title} ${notes}`.trim());
  let cleanTitle = title;
  let priority = 3;
  let repeat = null;
  let dueDate = "";
  let dueTime = "";
  let hasReminder = false;
  for (const rule of PRIORITY_RULES) {
    if (rule.re.test(title)) {
      priority = rule.p;
      break;
    }
  }
  const monthly = merged.match(/每月(\d{1,2})[日号]/);
  if (monthly) {
    const day = Number(monthly[1]);
    repeat = { freq: "monthly", interval: 1, dayOfMonth: day };
    dueDate = toDateString2(nextMonthlyDay(day, now));
  }
  const weekly = merged.match(/每(?:周|星期)([一二三四五六日天])/);
  if (weekly && !repeat) {
    const weekday = WEEKDAYS[weekly[1]];
    repeat = { freq: "weekly", interval: 1, weekday };
    dueDate = toDateString2(nextWeekday(weekday, now));
  }
  const weekdayRecur = /每个工作日|工作日/.test(merged);
  if (weekdayRecur && !repeat) {
    repeat = { freq: "weekday", interval: 1 };
    dueDate = toDateString2(nextDayWith(isWeekday, now));
  }
  const interval = merged.match(/每(?:隔)?(\d{1,2})天/);
  if (interval && !repeat) {
    const n = Math.max(1, Number(interval[1]));
    repeat = { freq: "interval", interval: n };
    dueDate = toDateString2(now);
  }
  if (/每天|每日/.test(merged) && !repeat) {
    repeat = { freq: "daily", interval: 1 };
    dueDate = toDateString2(now);
  }
  const weekdayDate = merged.match(/(下|这|本)?(?:周|星期)([一二三四五六日天])/);
  const bareWeekday = merged.match(/(^|[\s,，。.!！?？:：;；(（])([一二三四五六日天])(前|之前|以前|下班前|完成|交|给|发|开会|会议|汇总|提交|汇报|截止)/);
  const parseWeekdayAnchor = (day, which) => {
    if (which === "\u4E0B") return nextWeekday(day, startOfNextWeek(now));
    return nextWeekday(day, now);
  };
  if (weekdayDate && !repeat) {
    const day = WEEKDAYS[weekdayDate[2]];
    dueDate = toDateString2(parseWeekdayAnchor(day, weekdayDate[1]));
  } else if (bareWeekday && !repeat && !dueDate) {
    const day = WEEKDAYS[bareWeekday[2]];
    if (day !== void 0) dueDate = toDateString2(parseWeekdayAnchor(day, void 0));
  } else if (weekdayDate && repeat && repeat.freq === "weekly") {
  }
  if (/周末/.test(merged) && !dueDate) {
    dueDate = toDateString2(nextWeekday(6, now));
  }
  if (/(下|本|这)个月/.test(merged) && !dueDate) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    dueDate = toDateString2(d);
  }
  if (/(尽快|尽早|抓紧)/.test(merged) && !dueDate) {
    dueDate = toDateString2(now);
  }
  const relative = merged.match(/(今天|明天|后天)/);
  if (relative) {
    const offset = relative[1] === "\u660E\u5929" ? 1 : relative[1] === "\u540E\u5929" ? 2 : 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    dueDate = toDateString2(d);
  }
  const monthDay = merged.match(/(\d{1,2})[月/](\d{1,2})[日号]?/);
  if (monthDay) {
    const year = now.getFullYear();
    const d = new Date(year, Number(monthDay[1]) - 1, Number(monthDay[2]));
    const today = startOfDay(now);
    if (d.getTime() < today.getTime()) d.setFullYear(year + 1);
    dueDate = toDateString2(d);
  } else {
    const dayOfMonth = merged.match(/(\d{1,2})[日号]/);
    if (dayOfMonth && !repeat) {
      dueDate = toDateString2(nextMonthlyDay(Number(dayOfMonth[1]), now));
    }
  }
  const isoDate = merged.match(/\d{4}-\d{1,2}-\d{1,2}/);
  if (isoDate) {
    const d = /* @__PURE__ */ new Date(`${isoDate[0]}T00:00:00`);
    if (!Number.isNaN(d.getTime())) dueDate = toDateString2(d);
  }
  const hasDeadlineWord = /(前|之前|以前|前完成|前交|之前交)/.test(merged);
  const monthEnd = merged.match(/月(底|末)(前|之前|以前)?/);
  if (monthEnd) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    dueDate = toDateString2(last);
  }
  const eodQualifier = merged.match(/(下班|中午|傍晚|晚上|今天|明天|后天)?\s*(下班前|中午前|傍晚前|晚饭前)/);
  if (eodQualifier) {
    const q = eodQualifier[2];
    if (!dueDate) dueDate = toDateString2(now);
    if (!dueTime) dueTime = q === "\u4E2D\u5348\u524D" ? "12:00" : q === "\u4E0B\u73ED\u524D" ? "18:00" : "17:00";
  }
  const withinN = merged.match(/(\d{1,2})\s*(?:天|日)\s*(?:之?内|内)/);
  if (withinN && !dueDate) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(withinN[1]));
    dueDate = toDateString2(d);
  }
  void hasDeadlineWord;
  const time = parseTime(merged);
  if (time) dueTime = time.time;
  hasReminder = /提醒/.test(merged);
  if (hasReminder && !dueTime) dueTime = "09:00";
  if (dueTime && !dueDate) dueDate = toDateString2(now);
  if (hasReminder && !dueDate) dueDate = toDateString2(now);
  const remindAt = dueDate && dueTime ? new Date((/* @__PURE__ */ new Date(`${dueDate}T${dueTime}:00`)).getTime() - 10 * 60 * 1e3).toISOString() : "";
  if (title) cleanTitle = stripTokens(title) || "\u672A\u547D\u540D\u4EFB\u52A1";
  return {
    title: cleanTitle,
    priority,
    dueDate,
    dueTime,
    remindAt,
    repeat
  };
}

// src/lib/mascotBrain.ts
function isConfirmRecord(raw) {
  return /^(好|好的|嗯|行|可以|记|记吧|记一下|要|要的|对|去吧|ok)/.test(raw.trim());
}
function isCancelRecord(raw) {
  return /^(不|不用|算了|不要|别|先不了|不了|嗯?不用|没事)/.test(raw.trim());
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTask(t) {
  const when = t.dueDate ? `${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}` : "\u672A\u8BBE\u65E5\u671F";
  return `${t.completed ? "\u2713" : "\xB7"} ${t.title}\uFF08${when}\uFF09`;
}
function niceDay(d, now) {
  const key = dateKey(d);
  const today = dateKey(now);
  if (key === today) return "\u4ECA\u5929";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === dateKey(tomorrow)) return "\u660E\u5929";
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function tryDelete(raw, ctx) {
  const del = /(删|删除|清掉|去掉|移除|划掉)/.test(raw);
  if (!del) return null;
  const kw = raw.replace(/(帮我|请|你|把|那|个|这条|这个|刚才的|刚刚的|刚才|刚刚|之前|的记录|记录|条目|条|任务|待办|删掉|删除|清掉|去掉|移除|划掉|一下|的)/g, "").trim();
  const candidates = ctx.tasks.filter((t) => kw && t.title.includes(kw));
  if (candidates.length === 0) {
    return { text: "\u62B1\u6B49\uFF0C\u6211\u6CA1\u627E\u5230\u8981\u5220\u7684\u4EFB\u52A1\u3002\u80FD\u8BF4\u5F97\u66F4\u5177\u4F53\u4E00\u70B9\u5417\uFF1F\u6BD4\u5982\u300C\u5220\u6389 \u5F00\u4F1A\u300D\u3002", localOnly: true };
  }
  if (candidates.length === 1) {
    const t = candidates[0];
    return {
      text: `\u4F60\u786E\u5B9A\u8981\u5220\u9664\u300C${t.title}\u300D\u5417\uFF1F\u5220\u9664\u540E\u53EF\u4EE5\u64A4\u9500\u3002`,
      awaitingConfirm: true,
      action: { type: "confirm", candidateId: t.id }
    };
  }
  const list = candidates.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
  return {
    text: `\u627E\u5230\u51E0\u4E2A\u4EFB\u52A1\uFF0C\u4F60\u8BF4\u54EA\u4E00\u4E2A\uFF1F
${list}`,
    localOnly: true,
    choices: candidates.map((t) => ({ id: t.id, title: t.title, op: "delete" }))
  };
}
function tryComplete(raw, ctx) {
  if (/(还有|还剩|剩下|多少|几个|哪些|有没有|检查|看看|看下|列出|列一下)/.test(raw)) return null;
  if (/(前|之前|以前|月底|月末|尽快|尽早|抓紧)/.test(raw) && /(完成|做完|搞定|办好|弄好)/.test(raw)) return null;
  const doneWord = /(完成|做完|搞定|办完|打勾|勾掉|弄完|做好了)/.test(raw);
  const undoWord = /(取消完成|没完成|又没做|恢复|撤销完成|还没做)/.test(raw);
  if (!doneWord && !undoWord) return null;
  const kw = raw.replace(/(帮我|请|你|把|那|个|这条|这个|任务|待办|已经|一下|标成|标记|为|已完成|完成|做完|搞定|办完|打勾|勾掉|弄完|做好了|取消完成|没完成|又没做|恢复|撤销完成|还没做|了|的)/g, "").trim();
  const pool = ctx.tasks.filter((t2) => undoWord ? t2.completed : !t2.completed);
  const candidates = kw ? pool.filter((t2) => t2.title.includes(kw)) : [];
  if (candidates.length === 0) {
    return { text: `\u6CA1\u627E\u5230\u8981${undoWord ? "\u53D6\u6D88\u5B8C\u6210" : "\u5B8C\u6210"}\u7684\u4EFB\u52A1\u3002\u8BF4\u5177\u4F53\u70B9\uFF1F\u6BD4\u5982\u300C\u5B8C\u6210\u4E86 \u5F00\u4F1A\u300D\u3002`, localOnly: true };
  }
  if (candidates.length > 1) {
    const list = candidates.map((t2, i) => `${i + 1}. ${t2.title}`).join("\n");
    return {
      text: `\u627E\u5230\u51E0\u4E2A\uFF0C\u4F60\u8BF4\u54EA\u4E2A\uFF1F
${list}`,
      localOnly: true,
      choices: candidates.map((t2) => ({ id: t2.id, title: t2.title, op: undoWord ? "uncomplete" : "complete" }))
    };
  }
  const t = candidates[0];
  return {
    text: undoWord ? `\u597D\uFF0C\u628A\u300C${t.title}\u300D\u6807\u56DE\u672A\u5B8C\u6210\u3002` : `\u597D\uFF0C\u5B8C\u6210\u300C${t.title}\u300D\u2705`,
    action: { type: "completeTask", id: t.id, done: !undoWord }
  };
}
function tryUpdate(raw, ctx) {
  const editWord = /(改到|改成|改为|推迟到|延到|提前到|调整到|修改)/.test(raw);
  if (!editWord) return null;
  const m = raw.match(/(?:把)?(.+?)(?:改到|改成|改为|推迟到|延到|提前到|调整到|修改为|修改)(.+)/);
  if (!m) return null;
  const kw = m[1].replace(/(帮我|请|你|那|个|这条|这个|任务|待办)/g, "").trim();
  const rest = m[2].trim();
  const candidates = ctx.tasks.filter((t2) => kw && t2.title.includes(kw) && !t2.completed);
  if (candidates.length === 0) {
    return { text: `\u6CA1\u627E\u5230\u8981\u6539\u7684\u4EFB\u52A1\u3002\u8BF4\u5177\u4F53\u70B9\uFF1F\u6BD4\u5982\u300C\u628A\u5F00\u4F1A\u6539\u5230\u660E\u5929\u4E0B\u53483\u70B9\u300D\u3002`, localOnly: true };
  }
  if (candidates.length > 1) {
    const list = candidates.map((t2, i) => `${i + 1}. ${t2.title}`).join("\n");
    return {
      text: `\u627E\u5230\u51E0\u4E2A\uFF0C\u4F60\u8BF4\u54EA\u4E2A\uFF1F
${list}`,
      localOnly: true,
      choices: candidates.map((t2) => ({ id: t2.id, title: t2.title, op: "update" }))
    };
  }
  const t = candidates[0];
  const p = parseQuickAdd({ title: rest, notes: "", now: ctx.now ?? /* @__PURE__ */ new Date() });
  const patch = {};
  if (p.dueDate) patch.dueDate = p.dueDate;
  if (p.dueTime) patch.dueTime = p.dueTime;
  if (/重要|紧急|稍后|普通/.test(rest) && p.priority !== 3) patch.priority = p.priority;
  if (Object.keys(patch).length === 0) {
    return { text: `\u60F3\u628A\u5B83\u6539\u6210\u4EC0\u4E48\uFF1F\u6BD4\u5982\u300C\u628A${kw}\u6539\u5230\u660E\u5929\u4E0B\u53483\u70B9\u300D\u3002` };
  }
  const when = patch.dueDate ? `${patch.dueDate}${patch.dueTime ? " " + patch.dueTime : ""}` : "";
  return {
    text: `\u597D\uFF0C\u628A\u300C${t.title}\u300D\u6539\u6210 ${when || "\u65B0\u8BBE\u7F6E"}\u3002`,
    action: { type: "updateTask", id: t.id, patch }
  };
}
var FEELING_WORDS = /(好烦|烦死|心烦|心累|好累|累死|压力|焦虑|难过|委屈|伤心|沮丧|低落|崩溃|崩溃了|好气|气死|生气|暴躁|烦躁|郁闷|不开心|心情.{0,2}不好|心情.{0,2}差|心情.{0,2}糟|有点烦|emo|抑郁|孤独|失眠|撑不住|撑不下去|开心|高兴|好棒|好开心|太棒|幸福|满足|轻松|畅快|舒服|忙完|总算.*完|终于.*完|累瘫|忙死)/;
var NEG_FEELING = /(烦|累|压力|焦虑|难过|委屈|伤心|沮丧|低落|崩溃|气|暴躁|烦躁|郁闷|不开心|emo|抑郁|孤独|失眠|撑不住|撑不下去)/;
function tryFeeling(raw) {
  if (!FEELING_WORDS.test(raw)) return null;
  const cleaned = raw.replace(/^(我|我好|感觉|今天|最近)/, "").replace(/(记到|记一下|备忘录|待办)/g, "").replace(/[，。！？\s]+/g, " ").trim();
  if (!cleaned) return null;
  const moody = NEG_FEELING.test(raw);
  const text = cleaned.length > 24 ? cleaned.slice(0, 24) + "\u2026" : cleaned;
  const text2 = moody ? `\u62B1\u62B1\u4F60 \u{1FAC2} \u8F9B\u82E6\u4E86\uFF0C\u6211\u5728\u8FD9\u513F\u966A\u7740\u4F60\u3002\u8981\u4E0D\u8981\u6211\u628A\u8FD9\u53E5\u8BB0\u6210\u4E00\u6761 #\u5FC3\u60C5 \u5907\u5FD8\uFF1F\u4E4B\u540E\u60F3\u56DE\u770B\u4E5F\u5728\u3002\uFF08\u4E5F\u53EF\u4EE5\u8BF4\u4E0D\u8BB0\uFF09` : `\u771F\u4E3A\u4F60\u5F00\u5FC3\u5440\uFF01\u{1F973} \u8981\u4E0D\u8981\u628A\u8FD9\u4EFD\u5FC3\u60C5\u8BB0\u6210\u4E00\u6761 #\u5FC3\u60C5 \u5907\u5FD8\uFF1F\u60F3\u7559\u4F4F\u8FD9\u4E00\u523B\u5C31\u70B9\u8BB0\u3002`;
  return { text: text2, action: { type: "askRecordFeeling", text } };
}
function tryAddMemo(raw) {
  const m = raw.match(/(?:记到|写进|存到|加到|放进)?(?:备忘录|记事本|备注)(?:里|中|上面)?[:：]?\s*(.+)/);
  if (!m) return null;
  const text = m[1].trim();
  if (!text) return null;
  const cleaned = text.replace(/^(帮我|请|麻烦)/, "").trim();
  const tags = FEELING_WORDS.test(cleaned) ? ["\u5FC3\u60C5"] : void 0;
  const tagNote = tags ? "\uFF08\u5DF2\u6807 #\u5FC3\u60C5\uFF09" : "";
  return { text: `\u597D\uFF0C\u6211\u8BB0\u5230\u5907\u5FD8\u5F55\u91CC\u4E86\uFF1A
\u300C${cleaned}\u300D${tagNote}`, action: { type: "addMemo", text: cleaned, tags } };
}
function stripHelp(raw) {
  let s = raw;
  s = s.replace(/\s*(?:帮我|给我|替我)?\s*(?:记(?:个)?(?:一下)?|安排一下|加一下)\s*$/i, "");
  s = s.replace(/^(?:记得|别忘了|记住)[\s，,：:的]*/i, "");
  s = s.replace(/^(?:帮我|给我|替我)?\s*(?:记|建|添加|加|设|安排|存|放)(?:个|一个|一下)?\s*(?:待办|任务|事项|备忘录|提醒)?\s*(?:里|中|上面)?[\s，,：:的]*/i, "");
  s = s.replace(/^(?:请|麻烦)\s*/i, "");
  return s.replace(/^[\s,，。.!！?？:：;；-]+|[\s,，。.!！?？:：;；-]+$/g, "").trim();
}
function tryAddTask(raw) {
  const cleaned = stripHelp(raw);
  const now = /* @__PURE__ */ new Date();
  const fillers = /^(呢|啊|吧|呀|哦|嘛|吗|个|一下|了|的|好|嗯)*$/;
  if (!cleaned || fillers.test(cleaned)) {
    return { text: "\u60F3\u8BB0\u4EC0\u4E48\u5F85\u529E\u5440\uFF1F\u8DDF\u6211\u8BF4\u4E0B\u5185\u5BB9\u5C31\u884C\uFF0C\u6BD4\u5982\u300C\u660E\u5929\u4E0B\u53483\u70B9\u4EA4\u5468\u62A5\u300D\u3002" };
  }
  const parsed = parseQuickAdd({ title: cleaned, notes: "", now });
  const hasVerb = /(帮我记|给我记|记一下|记个|记下来|帮我记个|安排|添加|新建|创建|设个|提醒我|帮我约|帮我排|帮我建|建个|加个|存个|放个|记得|记着)/.test(raw);
  const hasTime = !!parsed.dueDate || !!parsed.dueTime;
  const todoMark = /(待办|任务|开会|开个会|会议|会|约|安排|面试|出差|请假|汇报|交[^，。]*|买|取|寄|送|取快递|修|准备|打卡|回复|周报|月报|报表|文案|材料|东西|事情|例会|健身|运动|锻炼|学习|读书|复习|考试|体检|缴费|还款|报名|打车|订票|合同|对接|整理|预算|方案|房租|水电|喝水|吃药|锻炼|接|送|办|弄|搞|清|洗|打扫|预约|挂号|报销|签字|盖章)/.test(cleaned);
  const chitchat = /(天气|心情|感觉|觉得|好像|不错|真好|开心|难过|累了|好累|好烦|怎么样啊|是吗|哈哈)/.test(cleaned) && !hasVerb;
  if (chitchat) return null;
  const isQuestion = /[?？]|(还有|还剩|哪些|什么|怎么|如何|为什么|为啥|是否|有没有|能不能|可不可以|多久|几点|在哪|是谁)|(吗|呢|么)$/.test(raw.trim());
  if (isQuestion && !hasVerb) return null;
  if (!hasVerb && !todoMark && !hasTime) return null;
  const vague2 = /^(那事|这事|这个|那个|它|这些|那些|东西|事情|事|啥|什么)$/;
  if (!parsed.title || fillers.test(parsed.title) || vague2.test(parsed.title.trim())) {
    return { text: "\u60F3\u8BB0\u4EC0\u4E48\u5F85\u529E\u5440\uFF1F\u8DDF\u6211\u8BF4\u4E0B\u5185\u5BB9\u5C31\u884C\uFF0C\u6BD4\u5982\u300C\u660E\u5929\u4E0B\u53483\u70B9\u4EA4\u5468\u62A5\u300D\u3002" };
  }
  const nice = parsed.dueDate ? `${parsed.dueDate}${parsed.dueTime ? " " + parsed.dueTime : ""}` : "\u672A\u8BBE\u65E5\u671F";
  return {
    text: `\u597D\uFF0C\u6211\u5E2E\u4F60\u8BB0\u4E0B\u4E86\uFF1A
\u300C${parsed.title}\u300D
\u23F0 ${nice}`,
    action: { type: "addTask", parsed }
  };
}
function tryQuery(raw, ctx) {
  const now = ctx.now ?? /* @__PURE__ */ new Date();
  const today = dateKey(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tKey = dateKey(tomorrow);
  const ask = /(有什么|哪些|安排是|安排吧|查|列|看看|看下|盘点|汇总|忙什么|要做|待办是|有啥|多少|几个|还剩|剩下|还有|没做|未完成|没完成|剩下的|待办的)/.test(raw) && !/(建|添加|加个|记下|记个|安排一个|安排个)/.test(raw);
  const askRemaining = ask && /(未完成|没完成|没做|没干|剩余|剩下|还剩|还有多少|多少.*(待办|任务|事)|几件|几个)/.test(raw) && !/逾期|过期|明天/.test(raw);
  if (askRemaining) {
    const open = ctx.tasks.filter((t) => !t.completed);
    if (open.length === 0) return { text: "\u4F60\u5DF2\u7ECF\u5168\u90E8\u5B8C\u6210\u5566\uFF0C\u4E00\u4EF6\u4E0D\u5269\uFF0C\u5389\u5BB3\uFF01\u{1F389}" };
    const list = open.slice(0, 8).map(fmtTask).join("\n");
    return { text: `\u4F60\u8FD8\u6709 ${open.length} \u4EF6\u6CA1\u5B8C\u6210\uFF1A
${list}${open.length > 8 ? `
\u2026\u7B49\u5171 ${open.length} \u4EF6` : ""}` };
  }
  const askOverdue = ask && /(逾期|过期|拖欠|还没弄|没做完|未完成)/.test(raw);
  const askToday = ask && !/明天/.test(raw) && /(今天|今日|现在|当下|最近|本周)/.test(raw) || /今天的?(待办|任务|安排|事)/.test(raw);
  const askTomorrow = ask && /明天/.test(raw);
  if (askOverdue) {
    const od = ctx.tasks.filter((t) => isOverdue(t, now));
    if (od.length === 0) return { text: "\u6CA1\u6709\u903E\u671F\u7684\u4EFB\u52A1\uFF0C\u5F88\u68D2\uFF01" };
    const list = od.slice(0, 8).map(fmtTask).join("\n");
    return { text: `\u6709 ${od.length} \u6761\u903E\u671F\u4E86\uFF1A
${list}
\u8981\u6211\u5E2E\u4F60\u9010\u4E2A\u5904\u7406\u5417\uFF1F` };
  }
  if (askToday) {
    const openToday = ctx.tasks.filter((t) => !t.completed && (t.dueDate === today || isOverdue(t, now)));
    if (openToday.length === 0) return { text: "\u4ECA\u5929\u6CA1\u6709\u5B89\u6392\uFF0C\u5F88\u8F7B\u677E\uFF5E\u8981\u4E0D\u8981\u5B89\u6392\u70B9\u5C0F\u4E8B\uFF1F" };
    const done = ctx.tasks.filter((t) => t.completed);
    const list = openToday.slice(0, 8).map(fmtTask).join("\n");
    return { text: `\u4ECA\u5929\u6709\u8FD9\u4E9B\uFF1A
${list}${done.length ? `
\u5DF2\u5B8C\u6210 ${done.length} \u4EF6` : ""}` };
  }
  if (askTomorrow) {
    const tomorrowList = ctx.tasks.filter((t) => !t.completed && t.dueDate === tKey);
    if (tomorrowList.length === 0) return { text: `\u660E\u5929\uFF08${niceDay(tomorrow, now)}\uFF09\u6CA1\u6709\u5B89\u6392\u3002` };
    const list = tomorrowList.slice(0, 8).map(fmtTask).join("\n");
    return { text: `\u660E\u5929\uFF08${niceDay(tomorrow, now)}\uFF09\u6709 ${tomorrowList.length} \u4EF6\uFF1A
${list}` };
  }
  return null;
}
function tryGreet(raw, ctx) {
  if (/^(谢谢|谢啦|多谢|辛苦了|辛苦|感谢|好的谢谢)/.test(raw.trim())) {
    return { text: "\u4E0D\u5BA2\u6C14\uFF5E\u8FD9\u662F\u6211\u8BE5\u505A\u7684 \u{1F60A} \u8FD8\u6709\u4E8B\u968F\u65F6\u53EB\u6211\u3002" };
  }
  if (!/(你好|您好|嗨|hi|哈喽|hello|在吗|你是|你是谁|你叫什么|帮个忙)/i.test(raw)) return null;
  const now = ctx.now ?? /* @__PURE__ */ new Date();
  const hour = now.getHours();
  const timeGreet = hour < 6 ? "\u591C\u6DF1\u4E86" : hour < 12 ? "\u65E9\u4E0A\u597D" : hour < 18 ? "\u4E0B\u5348\u597D" : "\u665A\u4E0A\u597D";
  const persona = ctx.persona === "personal" ? "\u4E2A\u4EBA" : "\u5DE5\u4F5C";
  return {
    text: `${timeGreet}\uFF01\u6211\u662F\u4F60\u7684${persona}\u52A9\u7406\uFF0C\u76F4\u63A5\u8DDF\u6211\u8BF4\u5C31\u884C\u2014\u2014\u6BD4\u5982\u300C\u660E\u5929\u4E0B\u53484\u70B9\u6709\u4E2A\u4F1A\uFF0C\u5E2E\u6211\u8BB0\u4E00\u4E0B\u300D\uFF0C\u6216\u8005\u300C\u628A\u8FD9\u6BB5\u8BB0\u5230\u5907\u5FD8\u5F55\u300D\u3002`
  };
}
function isGrantDeleteIntent(raw) {
  return /(允许|同意|授权|准了|准许)[^。！？!?]{0,6}(删|删除|删待办|删任务)/.test(raw.trim());
}
function readConfirm(raw) {
  const yes = /^(是的?|是|确定|确认|删|删吧|好|好的|行|可以|去吧|嗯|对)/.test(raw.trim());
  const no = /^(不|不要|别|取消|算了|等等|先不了|嗯?不)/.test(raw.trim());
  if (yes) return { yes: true };
  if (no) return { yes: false };
  return null;
}
var OFF_TOPIC = [
  "\u4EE3\u7801",
  "\u7A0B\u5E8F",
  "\u7F16\u7A0B",
  "python",
  "javascript",
  "java",
  "\u5199\u4E2A\u51FD\u6570",
  "\u5199\u4E2A\u811A\u672C",
  "debug",
  "bug",
  "\u6559\u6211\u5199",
  "\u600E\u4E48\u5199",
  "\u5E2E\u6211\u5199",
  "\u5B9E\u73B0\u4E00\u4E2A",
  "\u751F\u6210\u4EE3\u7801",
  "\u5199\u4EE3\u7801",
  "\u751F\u6210\u56FE\u7247",
  "\u753B\u4E00\u5E45",
  "\u753B\u4E2A",
  "ps \u4E00\u4E0B",
  "\u4FEE\u56FE",
  "\u751F\u6210\u89C6\u9891",
  "\u5199\u4F5C\u6587",
  "\u5199\u6587\u7AE0",
  "\u5199\u5C0F\u8BF4",
  "\u5199\u8BD7",
  "\u7FFB\u8BD1\u4E00\u4E0B",
  "\u7FFB\u6210",
  "\u722C\u866B",
  "\u7F51\u9875\u5236\u4F5C",
  "\u505A\u7F51\u9875",
  "\u80A1\u7968\u9884\u6D4B",
  "\u52A0\u5BC6\u8D27\u5E01",
  "\u6BD4\u7279\u5E01",
  "\u63A8\u8350\u80A1\u7968",
  "\u5F69\u7968",
  "\u8D4C\u535A",
  "\u8FDD\u6CD5",
  "\u7834\u89E3",
  "\u9ED1\u5BA2",
  "\u5165\u4FB5",
  "\u653B\u51FB",
  "\u66B4\u529B",
  "\u8272\u60C5",
  "\u6210\u4EBA",
  "\u6BD2\u54C1",
  "\u6B66\u5668",
  "\u9493\u9C7C",
  "\u8BC8\u9A97",
  "\u6570\u5B66\u9898",
  "\u89E3\u65B9\u7A0B",
  "\u7B97\u4E00\u4E0B\u8FD9\u4E2A",
  "\u7269\u7406\u9898",
  "\u5316\u5B66",
  "\u4F5C\u4E1A",
  "\u65B0\u95FB",
  "\u5929\u6C14\u600E\u4E48\u6837",
  "\u4ECA\u5929\u51E0\u53F7\u519C\u5386",
  "\u5E2E\u6211\u67E5",
  "\u600E\u4E48\u505A\u83DC",
  "\u83DC\u8C31",
  "\u63A8\u8350\u7535\u5F71",
  "\u63A8\u8350\u4E66",
  "\u63A8\u8350\u97F3\u4E50",
  "\u8BB2\u4E2A\u6545\u4E8B",
  "\u8BB2\u4E2A\u7B11\u8BDD"
];
var OFF_TOPIC_RE = new RegExp(OFF_TOPIC.join("|"), "i");
var OFF_TOPIC_PATTERNS = [
  /推荐.{0,4}(电影|剧|书|音乐|歌|游戏|餐厅|地方|景点|动漫)/,
  /(天气|气温|下雨|温度).{0,3}(怎么样|如何|如何样|预报)?/,
  /(讲|说).{0,3}(个)?(笑话|故事|段子)/,
  /(翻译|解释|总结|润色|改写).{0,4}(一下|这段|这句|下)/,
  /(算|解).{0,2}(一下|个)?(方程|数学|题)/
];
var CODE_NOUN_RE = /(c\+\+|c#|c语言|rust|go语言|前端|后端|数据库|接口|算法|链表|数组|函数|变量|爬虫|脚本|代码|程序|网站)/i;
var BUILD_VERB_RE = /(写|做|实现|编|教|生成|给我写|帮我写|搞个|设计|开发|搭一个|建个网站|修)/;
function isOffTopic(raw) {
  const t = raw.trim();
  if (OFF_TOPIC_RE.test(t)) return true;
  if (OFF_TOPIC_PATTERNS.some((re) => re.test(t))) return true;
  const hasTime = /(明天|今天|后天|周[一二三四五六日天]|\d{1,2}月|\d{1,2}日|上午|下午|晚上|今晚|\d+点|\d+:\d+|号)/.test(t);
  const hasTodoWord = /(待办|任务|开会|会议|约|安排|提醒|行程|备忘|去|到|看|交|汇报|面试|出差)/.test(t);
  if (BUILD_VERB_RE.test(t) && CODE_NOUN_RE.test(t) && !hasTime && !hasTodoWord) return true;
  const SERVICE_REQ = /^(帮我|请|给我|能不能|可以|麻烦|帮忙|帮我弄|搞)/;
  if (SERVICE_REQ.test(t) && !hasTodoWord && !/(心情|累|烦|难过|焦虑|开心)/.test(t)) return true;
  return false;
}
function offTopicReply() {
  return {
    text: "\u8FD9\u4E9B\u6211\u53EF\u5E2E\u4E0D\u4E0A\u5FD9\u2014\u2014\u6211\u662F\u8F7B\u5F85\u529E\u7684\u5C0F\u52A9\u7406\uFF0C\u53EA\u64C5\u957F\u7BA1\u4F60\u7684\u5F85\u529E\u548C\u5907\u5FD8\uFF0C\u4E5F\u80FD\u966A\u4F60\u804A\u804A\u5FC3\u60C5\u3002\u8981\u4E0D\u8981\u8BD5\u8BD5\u300C\u4ECA\u5929\u6709\u4EC0\u4E48\u5B89\u6392\u300D\uFF0C\u6216\u8DDF\u6211\u8BF4\u300C\u5E2E\u6211\u8BB0\u4E2A\u5F85\u529E\u300D\uFF1F"
  };
}
function answer(raw, ctx) {
  const text = raw.trim();
  if (!text) return { text: "\u55EF\uFF1F\u6211\u5728\u542C\u3002\u4F60\u53EF\u4EE5\u8BF4'\u5E2E\u6211\u5EFA\u4E2A\u5F85\u529E'\u6216'\u8BB0\u5230\u5907\u5FD8\u5F55'\u3002" };
  if (isOffTopic(text)) return offTopicReply();
  const greet = tryGreet(text, ctx);
  if (greet) return greet;
  const t = tryDelete(text, ctx);
  if (t) return t;
  const done = tryComplete(text, ctx);
  if (done) return done;
  const upd = tryUpdate(text, ctx);
  if (upd) return upd;
  const q = tryQuery(text, ctx);
  if (q) return q;
  const memo2 = tryAddMemo(text);
  if (memo2) return memo2;
  const feel = tryFeeling(text);
  if (feel) return feel;
  const task = tryAddTask(text);
  if (task) return task;
  const looksLikeThing = /^[一-龥A-Za-z0-9]{2,14}$/.test(text.trim()) && !/[?？]/.test(text) && !/(还有|还剩|剩下|多少|几个|哪些|有没有|什么|怎么|为啥|为什么|吗|呢|待办|任务|安排|提醒)/.test(text);
  if (looksLikeThing) {
    return {
      text: `\u4F60\u662F\u60F3\u8BA9\u6211\u8BB0\u4E0B\u300C${text.trim()}\u300D\u5417\uFF1F\u56DE\u300C\u8BB0\u4E0B\u6765\u300D\u6211\u5C31\u5EFA\uFF0C\u6216\u8005\u76F4\u63A5\u8BF4\u300C\u8BB0\u4E2A\u5F85\u529E\uFF1A${text.trim()}\u300D\u3002`,
      localOnly: true,
      quickAdd: text.trim(),
      fallback: true
    };
  }
  const guess = guessIntent(text);
  if (guess) return { text: guess, localOnly: true, fallback: true };
  return { text: fallbackMenu(text), localOnly: true, fallback: true };
}
function guessIntent(raw) {
  const t = raw.trim();
  if (/(今天|明天|后天|下周|本周|周[一二三四五六日天]|\d+点|\d+号|\d+日|上午|下午|晚上|早上)/.test(t)) {
    return `\u4F60\u662F\u60F3\u5B89\u6392\u300C${t}\u300D\u8FD9\u4EF6\u4E8B\u5417\uFF1F
\u56DE\u300C\u8BB0\u4E0B\u6765\u300D\u6211\u5C31\u5EFA\u4E2A\u5F85\u529E\u3002`;
  }
  if (/(怎么|如何|能不能|可不可以|有没有办法|教我)/.test(t)) {
    return `\u8FD9\u662F\u5728\u95EE\u6211\u600E\u4E48\u505A\u5417\uFF1F\u6211\u64C5\u957F\uFF1A\u5EFA\u5F85\u529E\u3001\u67E5\u4ECA\u5929\u3001\u6807\u5B8C\u6210\u3001\u5220\u4EFB\u52A1\u3002
\u8BF4\u8BF4\u4F60\u60F3\u5B89\u6392\u4EC0\u4E48\u4E8B\uFF0C\u6211\u5E2E\u4F60\u8BB0\u4E0B\u3002`;
  }
  return null;
}
function fallbackMenu(raw) {
  const short = raw.trim().slice(0, 12) + (raw.trim().length > 12 ? "\u2026" : "");
  return `\u8FD9\u53E5\u6211\u62FF\u4E0D\u592A\u51C6\uFF0C\u4E0D\u8FC7\u8FD9\u4E9B\u6211\u5F88\u5728\u884C\uFF1A
\u2022 \u300C\u660E\u5929\u4E0B\u53483\u70B9\u5F00\u4F1A\u300D\u2192 \u5EFA\u5F85\u529E
\u2022 \u300C\u4ECA\u5929\u6709\u4EC0\u4E48\u5B89\u6392\u300D\u2192 \u67E5
\u2022 \u300C\u5B8C\u6210\u4E86 \u5F00\u4F1A\u300D\u2192 \u6807\u5B8C\u6210
\u2022 \u300C\u597D\u7D2F\u554A\u300D\u2192 \u966A\u4F60\u804A\u804A
\uFF08\u521A\u624D\u90A3\u53E5\u300C${short}\u300D\u60F3\u8BB0\u4E0B\u6765\u7684\u8BDD\uFF0C\u8BF4\u300C\u8BB0\u4E2A\u5F85\u529E\u300D\u5C31\u884C\uFF09`;
}

// _devlog/_probe.ts
var NOW = new Date(2026, 8, 4, 10, 0, 0);
function mk(id, title, dueDate = "", dueTime = "", extra = {}) {
  return { id, title, notes: "", priority: 3, dueDate, dueTime, remindAt: "", completed: false, createdAt: 0, updatedAt: 0, ...extra };
}
var base = [mk("t0", "\u5F00\u4F1A", "2026-09-04", "16:00")];
var ctxWork = { tasks: base, persona: "work", now: NOW };
var emptyCtx = { tasks: [], persona: "work", now: NOW };
console.log("================ A. \u65E5\u671F\u8BED\u4E49 ================");
var dateCases = [
  "\u4E0B\u5468\u4E00\u5F00\u4F1A",
  "\u4E0B\u4E0B\u5468\u4E00\u5F00\u4F1A",
  "\u8FD9\u5468\u4E94\u4EA4\u5468\u62A5",
  "\u672C\u5468\u4E94\u5F00\u4F1A",
  "\u5468\u4E94\u5F00\u4F1A",
  "\u9694\u5468\u5468\u4E00\u5F00\u4F1A",
  "\u6708\u5E95\u4EA4\u9884\u7B97",
  "\u6708\u521D\u4EA4\u9884\u7B97",
  "\u56FD\u5E86\u53BB\u73A9",
  "\u8FC7\u5E74\u56DE\u5BB6",
  "\u5927\u540E\u5929\u4F53\u68C0",
  "\u4E0B\u4E2A\u67085\u53F7\u4EA4\u623F\u79DF",
  "\u6708\u5E95\u524D\u5B8C\u6210\u9884\u7B97",
  "\u5468\u4E09\u4E4B\u524D\u4EA4\u65B9\u6848",
  "\u5468\u672B\u53BB\u722C\u5C71",
  "\u4E0B\u5468\u4E8C\u524D\u7ED9\u65B9\u6848",
  "3\u5929\u5185\u4EA4\u6750\u6599",
  "\u660E\u5929\u8981\u5F00\u4F1A\u5417",
  "\u4E0B\u54681\u5F00\u4F1A",
  "\u661F\u671F\u516B\u5F00\u4F1A"
];
for (const q of dateCases) {
  const p = parseQuickAdd({ title: q, notes: "", now: NOW });
  console.log(`P ${q}
   \u2192 date=${p.dueDate || "-"} time=${p.dueTime || "-"} title=\u300C${p.title}\u300D repeat=${p.repeat ? JSON.stringify(p.repeat) : "-"}`);
}
console.log("\n================ B. \u65F6\u95F4\u8BED\u4E49 ================");
var timeCases = [
  "\u660E\u5929\u51CC\u66683\u70B9\u770B\u7403",
  "\u660E\u5929\u6E05\u65E9\u51FA\u53D1",
  "\u534A\u591C1\u70B9\u8D77\u5E8A\u770B\u7403",
  "\u660E\u5929\u4E0B\u5348\u8336\u65F6\u95F4\u5F00\u4F1A",
  "\u4E00\u4E2A\u5C0F\u65F6\u540E\u5F00\u4F1A",
  "\u4E24\u5C0F\u65F6\u540E\u5F00\u4F1A",
  "\u5341\u5206\u949F\u540E\u5F00\u4F1A",
  "\u660E\u5929\u4E2D\u5348\u5F00\u4F1A",
  "\u660E\u65E9\u516B\u70B9\u51FA\u53D1",
  "\u4ECA\u665A12\u70B9\u7761\u89C9",
  "\u660E\u5929\u4E0A\u534810\u70B9\u5F00\u4F1A",
  "\u660E\u59298\u70B9\u5F00\u4F1A"
];
for (const q of timeCases) {
  const p = parseQuickAdd({ title: q, notes: "", now: NOW });
  const r = answer(q, ctxWork);
  console.log(`P ${q}
   \u2192 date=${p.dueDate || "-"} time=${p.dueTime || "-"} title=\u300C${p.title}\u300D | answer=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} ${r.text.replace(/\n/g, " ").slice(0, 60)}`);
}
console.log("\n================ C. \u591A\u540C\u540D\u4EFB\u52A1 ================");
var multi = [
  mk("m1", "\u5F00\u4F1A", "2026-09-04", "16:00"),
  mk("m2", "\u5F00\u4F1A", "2026-09-05", "09:00"),
  mk("m3", "\u5F00\u4F1A", "2026-09-08", "14:00")
];
var ctxMulti = { tasks: multi, persona: "work", now: NOW };
var multiCases = ["\u5B8C\u6210\u5F00\u4F1A", "\u5220\u6389\u5F00\u4F1A", "\u628A\u5F00\u4F1A\u6539\u5230\u660E\u5929\u4E0B\u53483\u70B9", "\u5F00\u4F1A\u505A\u5B8C\u4E86", "\u628A\u660E\u5929\u7684\u5F00\u4F1A\u5220\u4E86", "\u4ECA\u5929\u6709\u4EC0\u4E48\u5B89\u6392"];
for (const q of multiCases) {
  const r = answer(q, ctxMulti);
  console.log(`A ${q}
   \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} choices=${r.choices ? r.choices.map((c) => `${c.id}:${c.op}`).join(",") : "-"} localOnly=${!!r.localOnly}
     text=${r.text.replace(/\n/g, " \u23CE ").slice(0, 120)}`);
}
console.log("\n================ D. \u6A21\u7CCA/\u6307\u4EE3 ================");
var vague = [
  "\u90A3\u4E2A\u5220\u4E86",
  "\u4E0A\u6B21\u90A3\u4E2A\u5220\u4E86",
  "\u7B97\u4E86\u5427",
  "\u4E0D\u5BF9",
  "\u90A3\u4E2A\u5B8C\u6210\u4E86",
  "\u628A\u5B83\u6539\u6210\u660E\u5929",
  "\u8FD9\u6761\u4E0D\u8981\u4E86",
  "\u6E05\u6389",
  "\u521A\u624D\u90A3\u4E2A",
  "\u5C31\u90A3\u4E2A",
  "\u55EF",
  "\u597D",
  "\u884C\u5427"
];
for (const q of vague) {
  const r = answer(q, ctxWork);
  console.log(`A ${q}
   \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} localOnly=${!!r.localOnly} fallback=${!!r.fallback}
     text=${r.text.replace(/\n/g, " \u23CE ").slice(0, 130)}`);
}
console.log("\n================ E. \u8FB9\u754C/\u5783\u573E\u8F93\u5165 ================");
var edge = [
  "",
  "   ",
  "\u3002",
  "\uFF1F\uFF1F\uFF1F",
  "\u3002\u3002\u3002",
  "\u{1F440}",
  "\uFF1F\uFF1F\uFF1F\u5220\u6389\u5F00\u4F1A",
  "\u5220\u6389\u5F00\u4F1A\uFF1F\uFF1F\uFF1F",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "I need to book a meeting tomorrow at 3pm",
  "\u4E0B\u5468\u4E00\u5F00\u4F1A\u987A\u4FBF\u770B\u770B\u8FD9\u4E2Aproject\u7684\u8FDB\u5EA6\u600E\u4E48\u6837",
  "\u5F00 \u4F1A",
  "\u5F00\u4F1A\u3002",
  "\u300C\u5F00\u4F1A\u300D",
  "\uFF08\u5F00\u4F1A\uFF09",
  "<\u5F00\u4F1A>",
  "\u5F00(something)\u4F1A",
  "\u6211\u628A\u4EFB\u52A1\u5B8C\u6210\u4E86",
  "\u6211\u628A\u4F1A\u5F00\u4E86",
  "\u5F00\u5B8C\u4F1A\u4E86",
  "\u4F1A\u5F00\u5B8C\u4E86",
  "\u8FD9\u4E2A\u4F1A\u5F00\u5B8C\u4E86\u5417",
  "\u5B8C\u6210",
  "\u5220\u9664",
  "\u6539\u5230",
  "\u8BB0\u8D26",
  "\u8BB0\u4E8B"
];
for (const q of edge) {
  const r = answer(q, ctxWork);
  console.log(`A ${JSON.stringify(q).slice(0, 40)}
   \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} localOnly=${!!r.localOnly} offTopic=${isOffTopic(q)}
     text=${r.text.replace(/\n/g, " \u23CE ").slice(0, 120)}`);
}
console.log("\n================ F. \u60C5\u7EEA+\u4EFB\u52A1\u6DF7\u5408 ================");
var emo = [
  "\u70E6\u6B7B\u4E86\u660E\u5929\u8FD8\u8981\u5F00\u4F1A",
  "\u597D\u70E6\u554A",
  "\u7D2F\u6B7B\u4E86",
  "\u660E\u5929\u53C8\u8981\u5F00\u4F1A\uFF0C\u70E6\u6B7B\u4E86",
  "\u597D\u5F00\u5FC3\uFF0C\u4E0B\u5468\u53BB\u65C5\u6E38",
  "\u538B\u529B\u597D\u5927\uFF0C\u660E\u5929\u8981\u4EA4\u5468\u62A5",
  "\u5FC3\u7D2F\uFF0C\u4E0D\u60F3\u5E72\u6D3B",
  "\u592A\u68D2\u4E86\uFF01\u4ECA\u5929\u63D0\u524D\u4E0B\u73ED",
  "\u7EC8\u4E8E\u628A\u5468\u62A5\u5199\u5B8C\u4E86",
  "\u597D\u7D2F\uFF0C\u5E2E\u6211\u8BB0\u4E2A\u5F85\u529E\u660E\u5929\u4E70\u5496\u5561"
];
for (const q of emo) {
  const r = answer(q, ctxWork);
  console.log(`A ${q}
   \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} localOnly=${!!r.localOnly}
     text=${r.text.replace(/\n/g, " \u23CE ").slice(0, 110)}`);
}
console.log("\n================ G. \u5EFA/\u5220/\u6539/\u67E5/\u5B8C\u6210 \u4EA4\u53C9 ================");
var cross = [
  "\u53D6\u6D88\u660E\u5929\u7684\u4F1A\u8BAE",
  "\u5220\u6389\u4E0B\u5468\u7684\u4F1A\u8BAE\u5B89\u6392\u4E86\u5417",
  "\u660E\u5929\u7684\u4F1A\u53D6\u6D88\u4E86",
  "\u628A\u4F1A\u8BAE\u63A8\u8FDF\u4E00\u5C0F\u65F6",
  "\u4F1A\u8BAE\u6539\u5230\u660E\u5929",
  "\u6709\u4F1A\u8BAE\u5417",
  "\u6211\u5B8C\u6210\u4E86\u4F1A\u8BAE\u7EAA\u8981",
  "\u5B8C\u6210\u4F1A\u8BAE\u7EAA\u8981",
  "\u522B\u5FD8\u4E86\u63D0\u9192\u6211\u660E\u5929\u5F00\u4F1A",
  "\u5E2E\u6211\u5220\u6389\u5B8C\u6210\u7684\u4EFB\u52A1",
  "\u6240\u6709\u4EFB\u52A1\u90FD\u505A\u5B8C\u4E86",
  "\u8BB0\u8D26",
  "\u5E2E\u6211\u8BB0\u4E00\u7B14",
  "\u8BB0\u4E2A\u8D26\uFF1A\u4E70\u83DC50"
];
for (const q of cross) {
  const r = answer(q, ctxWork);
  console.log(`A ${q}
   \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} localOnly=${!!r.localOnly}
     text=${r.text.replace(/\n/g, " \u23CE ").slice(0, 120)}`);
}
console.log("\n================ H. \u8D8A\u754C/\u6076\u610F ================");
var off = [
  "\u5E2E\u6211\u5199\u4E2Apython\u811A\u672C",
  "\u5E2E\u6211\u5199\u4E00\u9996\u8BD7",
  "\u4ECA\u5929\u5929\u6C14\u600E\u4E48\u6837",
  "\u67E5\u4E00\u4E0B\u73B0\u5728\u51E0\u70B9",
  "\u63A8\u8350\u4E00\u90E8\u7535\u5F71",
  "\u8BB2\u4E2A\u7B11\u8BDD",
  "\u4F60\u600E\u4E48\u770B\u4E2D\u7F8E\u5173\u7CFB",
  "\u7279\u6717\u666E\u6700\u8FD1\u600E\u4E48\u6837",
  "\u5E2E\u6211\u89E3\u4E2A\u65B9\u7A0B",
  "\u6559\u6211\u600E\u4E48\u5199\u4EE3\u7801",
  "\u5E2E\u6211\u8BA2\u673A\u7968",
  "\u94F6\u884C\u5361\u5BC6\u7801\u600E\u4E48\u627E\u56DE",
  "\u5E2E\u6211\u67E5\u4E0B\u5FEB\u9012",
  "\u7B97\u4E00\u4E0B 3+5 \u7B49\u4E8E\u51E0",
  "\u6253\u5F00\u8BA1\u7B97\u5668"
];
for (const q of off) {
  const r = answer(q, ctxWork);
  console.log(`A ${q}
   \u2192 offTopic=${isOffTopic(q)} action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} localOnly=${!!r.localOnly} fallback=${!!r.fallback}
     text=${r.text.replace(/\n/g, " \u23CE ").slice(0, 110)}`);
}
console.log("\n================ I. \u5907\u5FD8\u5F55/\u5FC3\u60C5\u8FB9\u754C ================");
var memo = [
  "\u8BB0\u5230\u5907\u5FD8\u5F55\uFF1A\u660E\u5929\u4E70\u725B\u5976",
  "\u5907\u5FD8\u5F55\uFF1A\u4F1A\u8BAE\u7EAA\u8981\u8981\u5B58\u6863",
  "\u5E2E\u6211\u8BB0\u5230\u5907\u5FD8\u5F55\u91CC\uFF1A\u4E70\u5496\u5561\u8C46",
  "\u6211\u5E2E\u4F60\u8BB0\u5230\u5907\u5FD8\u5F55\u4E86",
  "\u8BB0\u5230\u5907\u5FD8\u5F55",
  "\u8BB0\u5230\u5907\u5FD8\u5F55\uFF1A",
  "\u8BB0\u5F55\uFF1A\u4ECA\u5929\u5B66\u5230\u5F88\u591A"
];
for (const q of memo) {
  const r = answer(q, ctxWork);
  console.log(`A ${q}
   \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} ${r.action ? JSON.stringify(r.action).slice(0, 90) : ""}`);
}
console.log("\n-- \u5FC3\u60C5\u786E\u8BA4\u5224\u65AD --");
for (const s of ["\u597D", "\u597D\u7684", "\u55EF", "\u884C", "\u8BB0\u5427", "\u4E0D\u7528", "\u7B97\u4E86", "\u4E0D\u597D", "\u4E0D\u662F", "\u522B\u8BB0", "\u8BB0", "\u4E0D\u8BB0\u4E86"]) {
  console.log(`   isConfirm(${s})=${isConfirmRecord(s)} isCancel(${s})=${isCancelRecord(s)}`);
}
console.log("-- \u5220\u9664\u786E\u8BA4\u5224\u65AD --");
for (const s of ["\u662F", "\u662F\u7684", "\u5220\u5427", "\u597D", "\u55EF", "\u5BF9", "\u4E0D", "\u4E0D\u8981", "\u53D6\u6D88", "\u7B97\u4E86", "\u7B49\u7B49", "\u55EF\u4E0D", "\u4E0D\u5BF9"]) {
  console.log(`   readConfirm(${s})=${JSON.stringify(readConfirm(s))}`);
}
console.log(`   isGrantDeleteIntent("\u5141\u8BB8\u5220\u9664")=${isGrantDeleteIntent("\u5141\u8BB8\u5220\u9664")}`);
console.log("\n================ J. \u7A7A\u4EFB\u52A1\u5217\u8868 ================");
for (const q of ["\u4ECA\u5929\u6709\u4EC0\u4E48\u5B89\u6392", "\u5B8C\u6210\u5F00\u4F1A", "\u5220\u6389\u5F00\u4F1A", "\u628A\u5F00\u4F1A\u6539\u5230\u660E\u5929", "\u660E\u5929\u7684\u4F1A\u53D6\u6D88\u4E86"]) {
  const r = answer(q, emptyCtx);
  console.log(`A ${q} \u2192 action=${r.action?.type ?? "(\u65E0\u52A8\u4F5C)"} text=${r.text.replace(/\n/g, " ").slice(0, 90)}`);
}
