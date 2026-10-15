'use strict';
/* Bami Fitness - single-user workout planner/tracker. Data lives in localStorage on the device. */

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? '' : Number(v));
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => ymd(new Date());

// ---------- constants ----------
const TYPES = {
  plan: { label: 'Plan', icon: '📋' },
  free: { label: 'Free style', icon: '🏋️' },
  sport: { label: 'Sport', icon: '🏅' },
};
// [MET, icon] - MET values from the Compendium of Physical Activities (rounded)
const SPORTS = {
  Pickleball: [4.5, '🏓'], Running: [9.8, '🏃'], Cycling: [7.5, '🚴'], Swimming: [6, '🏊'],
  Badminton: [5.5, '🏸'], Tennis: [7.3, '🎾'], Football: [7, '⚽'], Basketball: [6.5, '🏀'],
  Yoga: [2.5, '🧘'], HIIT: [8, '🔥'], Walking: [3.5, '🚶'], Hiking: [6, '🥾'], Other: [5, '🏅'],
};
const INTENSITY = { Light: 0.8, Moderate: 1, Hard: 1.25 };
const STRENGTH_MET = 5;
const COMMON_EXERCISES = [
  'Bench Press', 'Incline Dumbbell Press', 'Overhead Press', 'Squat', 'Front Squat', 'Deadlift',
  'Romanian Deadlift', 'Barbell Row', 'Pull-up', 'Lat Pulldown', 'Leg Press', 'Lunge',
  'Dumbbell Curl', 'Triceps Pushdown', 'Lateral Raise', 'Hip Thrust', 'Plank',
];

// ---------- storage ----------
const KEY = 'fitlog.v1';
const defaults = () => ({ settings: { weightKg: 70, heightCm: 170, age: 30, sex: 'male', weeklyGoal: 4, restSec: 90 }, plans: [], sessions: [] });
function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r) return { ...defaults(), ...r, settings: { ...defaults().settings, ...r.settings } };
  } catch { /* corrupted or blocked storage: start fresh */ }
  return defaults();
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Could not save - storage is full or blocked'); }
}

// ---------- domain ----------
const metFor = (s) => (s.type === 'sport' ? (SPORTS[s.sport] || SPORTS.Other)[0] : STRENGTH_MET);
/** Basal metabolic rate in kcal/day (Mifflin-St Jeor) from the profile in Settings. */
const bmr = () => {
  const p = db.settings;
  return Math.max(800, 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5));
};
/** kcal = MET × (BMR per hour) × hours: a MET is a multiple of the resting rate, so a personal BMR beats the one-size 1 kcal/kg/h rule. */
const estKcal = (s) => Math.round(metFor(s) * (INTENSITY[s.intensity] || 1) * (bmr() / 24) * (Number(s.durationMin) || 0) / 60);
const sessionIcon = (s) => (s.type === 'sport' ? (SPORTS[s.sport] || SPORTS.Other)[1] : TYPES[s.type].icon);
const doneSessions = () => db.sessions.filter((s) => s.status === 'done');
const sessionsOn = (date) => db.sessions.filter((s) => s.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
const setCount = (s) => s.exercises.reduce((n, e) => n + e.sets.length, 0);
const sortedDesc = () => [...db.sessions].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

function exerciseNames() {
  const counts = new Map();
  for (const s of doneSessions()) for (const e of s.exercises) {
    const k = e.name.trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}
function allExerciseNames() {
  const set = new Set([...exerciseNames(), ...db.plans.flatMap((p) => p.exercises.map((e) => e.name)), ...COMMON_EXERCISES]);
  return [...set].filter(Boolean);
}
/** Top set (heaviest) of the most recent done session containing this exercise. */
function lastPerf(name, excludeId) {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  for (const s of sortedDesc()) {
    if (s.status !== 'done' || s.id === excludeId) continue;
    const ex = s.exercises.find((e) => e.name.trim().toLowerCase() === key);
    if (!ex) continue;
    const top = ex.sets.filter((x) => Number(x.weight) > 0).sort((a, b) => b.weight - a.weight)[0];
    if (top) return { reps: top.reps, weight: top.weight };
  }
  return null;
}

// ---------- ui state ----------
const ui = {
  view: 'home', sel: today(),
  dashMode: 'week', progEx: '', progRange: '3M', progMetric: 'weight',
};
let draft = null;       // session or plan being edited in the sheet
let sheetMode = null;   // 'session' | 'plan'
let isNew = false;

// ---------- views ----------
function render() {
  const views = { home: homeView, plans: plansView, dash: dashView, progress: progressView, settings: settingsView };
  $('#view').innerHTML = views[ui.view]();
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === ui.view));
  $('#exlist').innerHTML = allExerciseNames().map((n) => `<option value="${esc(n)}">`).join('');
}

function homeView() {
  const selD = parseYmd(ui.sel);
  const mon = mondayOf(selD);
  const t = today();
  const weekKeys = Array.from({ length: 7 }, (_, i) => ymd(addDays(mon, i)));
  const weekDone = doneSessions().filter((s) => weekKeys.includes(s.date));
  const weekKcal = weekDone.reduce((n, s) => n + (s.kcal || 0), 0);
  const days = weekKeys.map((k, i) => {
    const ss = sessionsOn(k);
    const dots = ss.slice(0, 3).map((s) => `<span class="dot ${s.status === 'done' ? 'done' : 'plan'}"></span>`).join('');
    return `<button class="day${k === ui.sel ? ' sel' : ''}${k === t ? ' today' : ''}" data-act="sel" data-d="${k}">
      <span class="dn">${DAY[i]}</span><span class="dd">${parseYmd(k).getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join('');
  const list = sessionsOn(ui.sel);
  const heading = ui.sel === t ? 'Today' : `${DAY[(selD.getDay() + 6) % 7]}, ${selD.getDate()} ${MONTH[selD.getMonth()]}`;
  return `
  <header class="top">
    <div><h1>${MONTH[selD.getMonth()]} ${selD.getFullYear()}</h1>
      <div class="sub">${weekDone.length}/${db.settings.weeklyGoal} workouts · ${fmt(weekKcal)} kcal this week</div></div>
    <div class="weeknav">
      <button class="icon-btn" data-act="shift" data-n="-7" aria-label="Previous week">‹</button>
      <button class="icon-btn" data-act="sel" data-d="${t}" aria-label="Today">●</button>
      <button class="icon-btn" data-act="shift" data-n="7" aria-label="Next week">›</button>
    </div>
  </header>
  <div class="week">${days}</div>
  <h3>${heading}</h3>
  <div class="list">${list.length ? list.map(sessionCard).join('') : '<div class="empty">Nothing here yet.<br>Tap + to plan or log a session.</div>'}</div>
  <button class="fab" data-act="add" aria-label="Add session">+</button>`;
}

function sessionCard(s) {
  const bits = [];
  if (s.time) bits.push(s.time);
  if (s.exercises.length) bits.push(`${s.exercises.length} exercises · ${setCount(s)} sets`);
  if (s.durationMin) bits.push(`${s.durationMin} min`);
  if (s.status === 'done' && s.kcal) bits.push(`${fmt(s.kcal)} kcal`);
  const right = s.status === 'done'
    ? '<span class="pill done">Done</span>'
    : `<button class="check" data-act="quickdone" data-id="${s.id}" aria-label="Mark done">✓</button>`;
  return `<div class="session" data-act="edit" data-id="${s.id}" role="button" tabindex="0">
    <div class="ico">${sessionIcon(s)}</div>
    <div class="meta"><div class="name">${esc(s.name)}</div><div class="info">${esc(bits.join(' · '))}</div></div>${right}</div>`;
}

function plansView() {
  const cards = db.plans.map((p) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div><b>${esc(p.name)}</b><div class="sub" style="color:var(--muted);font-size:13px">${p.exercises.length} exercises · ${p.exercises.reduce((n, e) => n + e.sets, 0)} sets</div></div>
        <div style="display:flex;gap:6px"><button class="ghost" data-act="plan-edit" data-id="${p.id}">Edit</button>
        <button class="primary sm" data-act="plan-use" data-id="${p.id}">Schedule</button></div>
      </div>
      <div class="hint">${esc(p.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · '))}</div>
    </div>`).join('');
  return `
  <header class="top"><div><h1>Plans</h1><div class="sub">Reusable named workouts</div></div>
    <button class="primary sm" data-act="plan-new">+ New plan</button></header>
  <div class="list">${cards || '<div class="empty">No plans yet.<br>Create one like "Push Day" or "Leg Day", then schedule it on any date.</div>'}</div>`;
}

// --- dashboard ---
function aggregate(keyFn, keys) {
  const m = Object.fromEntries(keys.map((k) => [k, { kcal: 0, min: 0, count: 0 }]));
  for (const s of doneSessions()) {
    const a = m[keyFn(s.date)];
    if (a) { a.kcal += s.kcal || 0; a.min += s.durationMin || 0; a.count++; }
  }
  return m;
}
function dashView() {
  const now = new Date();
  const monNow = mondayOf(now);
  const weekKey = (d) => ymd(mondayOf(parseYmd(d)));
  const monthKey = (d) => d.slice(0, 7);
  const weeks = Array.from({ length: 8 }, (_, i) => ymd(addDays(monNow, (i - 7) * 7)));
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const W = aggregate(weekKey, weeks);
  const M = aggregate(monthKey, months);
  const thisW = W[weeks[7]], thisM = M[months[5]];
  const goal = db.settings.weeklyGoal;

  // streak of consecutive weeks meeting the goal (the current week only counts once met)
  const allWeeks = aggregate(weekKey, Array.from({ length: 52 }, (_, i) => ymd(addDays(monNow, -i * 7))));
  let streak = 0;
  for (let i = 0; i < 52; i++) {
    const c = allWeeks[ymd(addDays(monNow, -i * 7))].count;
    if (c >= goal) streak++; else if (i > 0) break;
  }

  const mode = ui.dashMode;
  const items = mode === 'week'
    ? weeks.map((k, i) => ({ label: `${parseYmd(k).getDate()}/${parseYmd(k).getMonth() + 1}`, value: W[k].kcal, cur: i === 7 }))
    : months.map((k, i) => ({ label: MONTH[Number(k.slice(5)) - 1], value: M[k].kcal, cur: i === 5 }));
  const rangeStart = mode === 'week' ? weeks[0] : `${months[0]}-01`;

  // breakdown by activity within the chart range
  const byType = {};
  for (const s of doneSessions()) {
    if (s.date < rangeStart) continue;
    const k = s.type === 'sport' ? s.sport : TYPES[s.type].label;
    byType[k] = byType[k] || { kcal: 0, count: 0 };
    byType[k].kcal += s.kcal || 0; byType[k].count++;
  }
  const rows = Object.entries(byType).sort((a, b) => b[1].kcal - a[1].kcal);
  const maxK = Math.max(1, ...rows.map((r) => r[1].kcal));

  // heatmap: last 12 weeks, one column per week
  const byDay = {};
  doneSessions().forEach((s) => { byDay[s.date] = (byDay[s.date] || 0) + 1; });
  const t = today();
  let heat = '';
  for (let w = 11; w >= 0; w--) for (let d = 0; d < 7; d++) {
    const k = ymd(addDays(monNow, -w * 7 + d));
    const c = byDay[k] || 0;
    heat += `<i class="${k > t ? 'off' : c >= 3 ? 'l3' : c === 2 ? 'l2' : c === 1 ? 'l1' : ''}" title="${k}: ${c} session(s)"></i>`;
  }
  const activeDays12w = Object.keys(byDay).filter((k) => k >= ymd(addDays(monNow, -77)) && k <= t).length;

  return `
  <header class="top"><div><h1>Dashboard</h1><div class="sub">Calories are estimated from your profile (age, sex, height, weight)</div></div></header>
  <div class="tiles">
    <div class="tile"><div class="v">${fmt(thisW.kcal)} <small>kcal</small></div><div class="l">This week</div></div>
    <div class="tile"><div class="v">${thisW.count}<small> / ${goal}</small></div><div class="l">Workouts this week</div>
      <div class="progress"><i style="width:${Math.min(100, goal ? thisW.count / goal * 100 : 0)}%"></i></div></div>
    <div class="tile"><div class="v">${fmt(thisM.kcal)} <small>kcal</small></div><div class="l">This month · ${thisM.count} workouts</div></div>
    <div class="tile"><div class="v">${streak}<small> wk</small></div><div class="l">Goal streak</div></div>
  </div>

  <h3>Calories burned</h3>
  <div class="seg accent" style="margin-bottom:10px">
    <button class="${mode === 'week' ? 'on' : ''}" data-act="dashmode" data-v="week">Weekly</button>
    <button class="${mode === 'month' ? 'on' : ''}" data-act="dashmode" data-v="month">Monthly</button>
  </div>
  <div class="card">${barChart(items)}</div>

  <h3>Frequency · last 12 weeks <span style="text-transform:none;letter-spacing:0">(${activeDays12w} active days)</span></h3>
  <div class="card"><div class="heat">${heat}</div></div>

  <h3>By activity · ${mode === 'week' ? 'last 8 weeks' : 'last 6 months'}</h3>
  <div class="card"><div class="bars">${rows.length ? rows.map(([k, v]) => `
    <div class="hbar"><span>${esc(k)}</span><span class="t"><i style="width:${v.kcal / maxK * 100}%"></i></span><span class="n">${fmt(v.kcal)} kcal</span></div>`).join('') : '<div class="empty" style="padding:10px">No completed sessions in this range.</div>'}</div></div>`;
}

function barChart(items) {
  const W = 340, H = 170, pl = 6, pr = 6, pt = 18, pb = 24;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (W - pl - pr) / items.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Calories bar chart">`;
  items.forEach((it, i) => {
    const h = Math.max(2, (H - pt - pb) * it.value / max);
    const x = pl + i * bw + bw * 0.17, w = bw * 0.66, y = H - pb - h;
    s += `<rect class="bar${it.cur ? ' cur' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>`;
    if (it.value) s += `<text class="val" x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}">${fmt(it.value)}</text>`;
    s += `<text class="lbl" x="${(x + w / 2).toFixed(1)}" y="${H - 8}">${esc(it.label)}</text>`;
  });
  return s + '</svg>';
}

function lineChart(pts, unit) {
  if (!pts.length) return '';
  const W = 340, H = 190, pl = 38, pr = 14, pt = 20, pb = 26;
  const ys = pts.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
  const t0 = pts[0].x.getTime(), t1 = pts[pts.length - 1].x.getTime();
  const X = (d) => (t1 === t0 ? (pl + W - pr) / 2 : pl + (d.getTime() - t0) / (t1 - t0) * (W - pl - pr));
  const Y = (v) => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Progress line chart">`;
  for (let i = 0; i <= 3; i++) {
    const v = lo + (hi - lo) * i / 3, y = Y(v);
    s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="ylbl" x="${pl - 5}" y="${(y + 3).toFixed(1)}">${Math.round(v * 10) / 10}</text>`;
  }
  s += `<polyline class="line" points="${pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
  pts.forEach((p, i) => {
    s += `<circle class="pt" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.5"><title>${ymd(p.x)}: ${Math.round(p.y * 10) / 10} ${unit}</title></circle>`;
    if (i === pts.length - 1) s += `<text class="ptl" x="${Math.min(X(p.x), W - 24).toFixed(1)}" y="${(Y(p.y) - 9).toFixed(1)}">${Math.round(p.y * 10) / 10}</text>`;
  });
  const lbl = (d) => `${d.getDate()} ${MONTH[d.getMonth()]}`;
  s += `<text class="lbl" x="${pl}" y="${H - 8}" style="text-anchor:start">${lbl(pts[0].x)}</text>`;
  if (pts.length > 1) s += `<text class="lbl" x="${W - pr}" y="${H - 8}" style="text-anchor:end">${lbl(pts[pts.length - 1].x)}</text>`;
  return s + '</svg>';
}

// --- progress ---
function progressView() {
  const names = exerciseNames();
  if (!ui.progEx || !names.includes(ui.progEx)) ui.progEx = names[0] || '';
  const header = '<header class="top"><div><h1>Progress</h1><div class="sub">Track strength per exercise</div></div></header>';
  if (!names.length) return `${header}<div class="empty">Log a completed session with weights<br>to see your progress here.</div>`;

  const key = ui.progEx.trim().toLowerCase();
  const days = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365, All: 99999 }[ui.progRange];
  const cutoff = ymd(addDays(new Date(), -days));
  const metrics = {
    weight: { label: 'Top weight', unit: 'kg', fn: (sets) => Math.max(...sets.map((x) => Number(x.weight) || 0)) },
    e1rm: { label: 'Est. 1RM', unit: 'kg', fn: (sets) => Math.max(...sets.map((x) => (Number(x.weight) || 0) * (1 + (Number(x.reps) || 0) / 30))) },
    volume: { label: 'Volume', unit: 'kg', fn: (sets) => sets.reduce((n, x) => n + (Number(x.reps) || 0) * (Number(x.weight) || 0), 0) },
  };
  const m = metrics[ui.progMetric];
  const entries = [];
  for (const s of [...doneSessions()].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))) {
    if (s.date < cutoff) continue;
    const ex = s.exercises.find((e) => e.name.trim().toLowerCase() === key);
    if (!ex) continue;
    const sets = ex.sets.filter((x) => Number(x.weight) > 0 || Number(x.reps) > 0);
    if (!sets.length) continue;
    const top = [...sets].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
    entries.push({ date: s.date, y: m.fn(sets), top, sets: sets.length, x: parseYmd(s.date) });
  }
  const best = entries.reduce((b, e) => (e.y > (b?.y ?? -1) ? e : b), null);
  const change = entries.length > 1 ? entries[entries.length - 1].y - entries[0].y : null;
  const pct = change != null && entries[0].y ? change / entries[0].y * 100 : null;
  const r1 = (v) => Math.round(v * 10) / 10;

  return `${header}
  <label>Exercise<select data-act="progex">${names.map((n) => `<option value="${esc(n)}"${n === ui.progEx ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
  <div class="chips" style="margin-top:12px">${['1M', '3M', '6M', '1Y', 'All'].map((r) => `<button class="${ui.progRange === r ? 'on' : ''}" data-act="progrange" data-v="${r}">${r}</button>`).join('')}</div>
  <div class="seg" style="margin-top:10px">${Object.entries(metrics).map(([k, v]) => `<button class="${ui.progMetric === k ? 'on' : ''}" data-act="progmetric" data-v="${k}">${v.label}</button>`).join('')}</div>
  ${entries.length ? `
  <div class="tiles" style="margin-top:14px">
    <div class="tile"><div class="v">${r1(best.y)}<small> ${m.unit}</small></div><div class="l">Best ${m.label.toLowerCase()} · ${best.date}</div></div>
    <div class="tile"><div class="v delta ${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change == null ? '–' : `${change > 0 ? '+' : ''}${r1(change)}`}<small> ${change == null ? '' : m.unit}</small></div>
      <div class="l">${pct == null ? 'Need 2+ sessions' : `${pct > 0 ? '+' : ''}${r1(pct)}% since ${entries[0].date}`}</div></div>
  </div>
  <div class="card" style="margin-top:12px">${lineChart(entries, m.unit)}</div>
  <h3>Recent sessions</h3>
  <div class="card"><table class="table"><tr><th>Date</th><th>Sets</th><th>Top set</th></tr>
    ${[...entries].reverse().slice(0, 10).map((e) => `<tr><td>${e.date}</td><td>${e.sets}</td><td>${e.top.reps || '–'} × ${e.top.weight || 0} kg</td></tr>`).join('')}</table></div>`
    : '<div class="empty">No sessions with this exercise in the selected range.</div>'}`;
}

function settingsView() {
  const s = db.settings;
  return `
  <header class="top"><div><h1>Settings</h1></div></header>
  <h3>Profile</h3>
  <div class="card">
    <div class="row2" style="margin-top:0">
      <label>Age<input inputmode="numeric" data-set="age" value="${s.age}"></label>
      <label>Sex<select data-set="sex"><option value="male"${s.sex === 'male' ? ' selected' : ''}>Male</option><option value="female"${s.sex === 'female' ? ' selected' : ''}>Female</option></select></label>
    </div>
    <div class="row2">
      <label>Height (cm)<input inputmode="decimal" data-set="heightCm" value="${s.heightCm}"></label>
      <label>Weight (kg)<input inputmode="decimal" data-set="weightKg" value="${s.weightKg}"></label>
    </div>
    <div class="hint">Resting metabolism (BMR): <b>${fmt(bmr())} kcal/day</b>. Used to estimate calories burned in each session.</div>
  </div>
  <h3>Training</h3>
  <div class="card">
    <div class="row2" style="margin-top:0">
      <label>Weekly workout goal<input inputmode="numeric" data-set="weeklyGoal" value="${s.weeklyGoal}"></label>
      <label>Rest timer (sec)<input inputmode="numeric" data-set="restSec" value="${s.restSec}"></label>
    </div>
  </div>
  <h3>Backup</h3>
  <div class="card">
    <div class="hint" style="margin:0 0 10px">Data is stored only on this phone. Export a backup now and then, especially before clearing browser data or changing phones.</div>
    <div style="display:flex;gap:8px"><button class="primary" data-act="export">Export JSON</button><button class="ghost" data-act="import">Import…</button></div>
    <div class="hint">${db.sessions.length} sessions · ${db.plans.length} plans</div>
  </div>
  <h3>Danger zone</h3>
  <button class="danger" style="margin-top:0" data-act="reset">Erase all data</button>`;
}

// ---------- session editor ----------
function newDraft(date, plan) {
  const d = {
    id: uid(), date, time: '18:00', type: 'plan', name: '', planId: '', sport: 'Pickleball',
    durationMin: 60, intensity: 'Moderate', kcal: 0, kcalManual: false, notes: '',
    status: date > today() ? 'planned' : date === today() ? 'planned' : 'done', exercises: [],
  };
  if (plan) applyPlan(d, plan);
  return d;
}
function applyPlan(d, plan) {
  d.type = 'plan'; d.planId = plan.id; d.name = plan.name;
  d.exercises = plan.exercises.map((e) => {
    const last = lastPerf(e.name, d.id);
    return { name: e.name, sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: last ? last.weight : '' })) };
  });
}
function openSheet(mode) { sheetMode = mode; $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; renderSheet(); }
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; draft = null; sheetMode = null; }
function renderSheet(keepScroll = true) {
  const body = $('#sheetBody');
  const top = body.scrollTop;
  body.innerHTML = sheetMode === 'plan' ? planEditorHTML() : sessionEditorHTML();
  if (keepScroll) body.scrollTop = top;
}

function sessionEditorHTML() {
  const d = draft;
  const kc = d.kcalManual ? d.kcal : estKcal(d);
  const typeFields = d.type === 'plan'
    ? `<label class="field">Plan<select data-f="planId"><option value="">Custom name…</option>${db.plans.map((p) => `<option value="${p.id}"${p.id === d.planId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
       <label class="field">Name<input data-f="name" value="${esc(d.name)}" placeholder="e.g. Push Day"></label>`
    : d.type === 'free'
      ? `<label class="field">Name<input data-f="name" value="${esc(d.name)}" placeholder="Free style"></label>`
      : `<label class="field">Sport<select data-f="sport">${Object.keys(SPORTS).map((k) => `<option${k === d.sport ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
         <label class="field">Title (optional)<input data-f="name" value="${esc(d.name)}" placeholder="e.g. Doubles with the team"></label>`;
  const exercises = d.type === 'sport' ? '' : `
    <h3>Exercises</h3>
    ${d.exercises.map((e, i) => exerciseHTML(e, i)).join('')}
    <div style="display:flex;gap:8px;margin-top:10px"><input id="newex" list="exlist" placeholder="Add exercise…" style="flex:1"><button class="primary sm" data-act="addex">Add</button></div>`;
  return `
  <div class="sheet-top"><button class="link" data-act="close">Cancel</button><h2>${isNew ? 'New session' : 'Edit session'}</h2><button class="primary sm" data-act="save">Save</button></div>
  <div class="seg">${Object.entries(TYPES).map(([k, t]) => `<button class="${d.type === k ? 'on' : ''}" data-act="type" data-v="${k}">${t.icon} ${t.label}</button>`).join('')}</div>
  ${typeFields}
  <div class="row2"><label>Date<input type="date" data-f="date" value="${d.date}"></label><label>Time<input type="time" data-f="time" value="${d.time || ''}"></label></div>
  <div class="seg accent" style="margin-top:12px">
    <button class="${d.status === 'planned' ? 'on' : ''}" data-act="status" data-v="planned">Planned</button>
    <button class="${d.status === 'done' ? 'on' : ''}" data-act="status" data-v="done">Done</button></div>
  <div class="row3">
    <label>Minutes<input inputmode="numeric" data-f="durationMin" value="${d.durationMin}"></label>
    <label>Intensity<select data-f="intensity">${Object.keys(INTENSITY).map((k) => `<option${k === d.intensity ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
    <label>Calories<input id="kcalInput" inputmode="numeric" data-f="kcal" value="${kc}"></label></div>
  <div class="hint">Auto-estimated (${metFor(d)} MET × your BMR of ${fmt(bmr())} kcal/day). Type the number from your watch to replace it ·<a href="#" class="link" style="padding:0" data-act="kcalauto">reset to estimate</a></div>
  ${exercises}
  <label class="field">Notes<textarea data-f="notes" rows="3" placeholder="How it felt, injuries, equipment…">${esc(d.notes)}</textarea></label>
  ${isNew ? '' : '<button class="danger" data-act="delete">Delete session</button>'}`;
}

function exerciseHTML(e, i) {
  const last = lastPerf(e.name, draft.id);
  return `<div class="ex">
    <div class="ex-head"><input list="exlist" data-ex="${i}" data-f="exname" value="${esc(e.name)}" placeholder="Exercise name">
      <button data-act="rest" aria-label="Start rest timer">⏱</button><button data-act="delex" data-ex="${i}" aria-label="Remove exercise">✕</button></div>
    <div class="set-row hdr"><span>Set</span><span>Reps</span><span>kg</span><span></span></div>
    ${e.sets.map((x, j) => `<div class="set-row"><span class="n">${j + 1}</span>
      <input inputmode="numeric" data-ex="${i}" data-set="${j}" data-f="reps" value="${esc(x.reps)}">
      <input inputmode="decimal" data-ex="${i}" data-set="${j}" data-f="weight" value="${esc(x.weight)}">
      <button class="x" data-act="delset" data-ex="${i}" data-set="${j}" aria-label="Remove set">−</button></div>`).join('')}
    <button class="link" data-act="addset" data-ex="${i}">+ Add set</button>
    ${last ? `<span class="hint" style="margin-left:8px">Last: ${last.reps || '–'} × ${last.weight} kg</span>` : ''}
  </div>`;
}

function saveSession() {
  const d = structuredClone(draft);
  if (!d.date) return toast('Pick a date');
  d.durationMin = Number(d.durationMin) || 0;
  d.exercises = d.type === 'sport' ? [] : d.exercises
    .map((e) => ({ name: e.name.trim(), sets: e.sets.filter((x) => x.reps !== '' || x.weight !== '').map((x) => ({ reps: num(x.reps), weight: num(x.weight) })) }))
    .filter((e) => e.name);
  if (!d.name.trim()) d.name = d.type === 'sport' ? d.sport : d.type === 'plan' ? 'Workout' : 'Free style';
  d.name = d.name.trim();
  d.kcal = d.kcalManual ? Number(d.kcal) || 0 : estKcal(d);
  const i = db.sessions.findIndex((s) => s.id === d.id);
  if (i >= 0) db.sessions[i] = d; else db.sessions.push(d);
  save(); ui.sel = d.date; closeSheet(); render();
  toast(d.status === 'done' ? `Saved · ${fmt(d.kcal)} kcal` : 'Saved');
}

// ---------- plan editor ----------
function planEditorHTML() {
  const p = draft;
  return `
  <div class="sheet-top"><button class="link" data-act="close">Cancel</button><h2>${isNew ? 'New plan' : 'Edit plan'}</h2><button class="primary sm" data-act="plan-save">Save</button></div>
  <label>Plan name<input data-f="name" value="${esc(p.name)}" placeholder="e.g. Push Day"></label>
  <div class="plan-row hdr"><span>Exercise</span><span>Sets</span><span>Reps</span><span></span></div>
  ${p.exercises.map((e, i) => `<div class="plan-row">
    <input list="exlist" data-ex="${i}" data-f="name" value="${esc(e.name)}" placeholder="Exercise">
    <input inputmode="numeric" data-ex="${i}" data-f="sets" value="${esc(e.sets)}">
    <input inputmode="numeric" data-ex="${i}" data-f="reps" value="${esc(e.reps)}">
    <button class="x" style="color:var(--muted)" data-act="plan-delex" data-ex="${i}" aria-label="Remove">✕</button></div>`).join('')}
  <button class="link" data-act="plan-addex" style="margin-top:8px">+ Add exercise</button>
  ${isNew ? '' : '<button class="danger" data-act="plan-delete">Delete plan</button>'}`;
}

// ---------- rest timer & toast ----------
let restTimer = null, restEnd = 0;
function startRest(sec) {
  restEnd = Date.now() + sec * 1000;
  clearInterval(restTimer);
  const el = $('#rest');
  el.hidden = false;
  const tick = () => {
    const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
    el.innerHTML = `<span>Rest</span><span class="t">${Math.floor(left / 60)}:${pad(left % 60)}</span><button data-act="rest-add">+15s</button><button data-act="rest-stop">Skip</button>`;
    if (left === 0) { stopRest(); navigator.vibrate?.([250, 120, 250]); toast('Rest over - next set!'); }
  };
  tick(); restTimer = setInterval(tick, 250);
}
function stopRest() { clearInterval(restTimer); $('#rest').hidden = true; }
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const nav = e.target.closest('#nav button');
  if (nav) { ui.view = nav.dataset.view; window.scrollTo(0, 0); return render(); }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const a = el.dataset.act, id = el.dataset.id, v = el.dataset.v;
  const exI = el.dataset.ex !== undefined ? Number(el.dataset.ex) : null;
  if (el.tagName === 'A') e.preventDefault();
  if (a === 'quickdone') e.stopPropagation();

  switch (a) {
    // schedule
    case 'sel': ui.sel = el.dataset.d; return render();
    case 'shift': ui.sel = ymd(addDays(parseYmd(ui.sel), Number(el.dataset.n))); return render();
    case 'add': draft = newDraft(ui.sel); isNew = true; return openSheet('session');
    case 'edit': draft = structuredClone(db.sessions.find((s) => s.id === id)); isNew = false; return openSheet('session');
    case 'quickdone': {
      const s = db.sessions.find((x) => x.id === id);
      s.status = 'done'; if (!s.kcalManual) s.kcal = estKcal(s);
      save(); render(); return toast(`Done · ~${fmt(s.kcal)} kcal (tap session to enter watch value)`);
    }
    // plans
    case 'plan-new': draft = { id: uid(), name: '', exercises: [{ name: '', sets: 3, reps: 10 }] }; isNew = true; return openSheet('plan');
    case 'plan-edit': draft = structuredClone(db.plans.find((p) => p.id === id)); isNew = false; return openSheet('plan');
    case 'plan-use': draft = newDraft(ui.sel, db.plans.find((p) => p.id === id)); isNew = true; return openSheet('session');
    case 'plan-addex': draft.exercises.push({ name: '', sets: 3, reps: 10 }); return renderSheet();
    case 'plan-delex': draft.exercises.splice(exI, 1); return renderSheet();
    case 'plan-save': return savePlan();
    case 'plan-delete':
      if (confirm('Delete this plan? Past sessions are kept.')) { db.plans = db.plans.filter((p) => p.id !== draft.id); save(); closeSheet(); render(); }
      return;
    // sheet (session)
    case 'close': return closeSheet();
    case 'save': return saveSession();
    case 'delete':
      if (confirm('Delete this session?')) { db.sessions = db.sessions.filter((s) => s.id !== draft.id); save(); closeSheet(); render(); }
      return;
    case 'type': draft.type = v; return renderSheet();
    case 'status': draft.status = v; return renderSheet();
    case 'kcalauto': draft.kcalManual = false; return renderSheet();
    case 'addex': {
      const input = $('#newex'); const name = input.value.trim();
      if (!name) return input.focus();
      const last = lastPerf(name, draft.id);
      draft.exercises.push({ name, sets: [{ reps: last ? last.reps : '', weight: last ? last.weight : '' }] });
      return renderSheet();
    }
    case 'delex': draft.exercises.splice(exI, 1); return renderSheet();
    case 'addset': {
      const sets = draft.exercises[exI].sets, prev = sets[sets.length - 1];
      sets.push({ reps: prev ? prev.reps : '', weight: prev ? prev.weight : '' });
      return renderSheet();
    }
    case 'delset': draft.exercises[exI].sets.splice(Number(el.dataset.set), 1); return renderSheet();
    case 'rest': return startRest(db.settings.restSec);
    case 'rest-add': restEnd += 15000; return;
    case 'rest-stop': return stopRest();
    // dashboard / progress
    case 'dashmode': ui.dashMode = v; return render();
    case 'progrange': ui.progRange = v; return render();
    case 'progmetric': ui.progMetric = v; return render();
    // settings
    case 'export': return exportData();
    case 'import': return $('#importFile').click();
    case 'reset':
      if (confirm('Erase ALL sessions, plans and settings from this device? Export a backup first.')) { db = defaults(); save(); render(); toast('All data erased'); }
      return;
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.session[role=button]')) { e.preventDefault(); e.target.click(); }
});

// text inputs update the draft without re-rendering (keeps focus and keyboard open)
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.set !== undefined && !t.dataset.f && t.closest('#view')) return; // settings handled on change
  if (!draft || !t.dataset.f) return;
  const f = t.dataset.f;
  if (sheetMode === 'plan') {
    if (t.dataset.ex !== undefined) draft.exercises[t.dataset.ex][f] = f === 'name' ? t.value : num(t.value);
    else draft[f] = t.value;
    return;
  }
  if (t.dataset.ex !== undefined && t.dataset.set !== undefined) { draft.exercises[t.dataset.ex].sets[t.dataset.set][f] = t.value; return; }
  if (f === 'exname') { draft.exercises[t.dataset.ex].name = t.value; return; }
  draft[f] = t.value;
  if (f === 'kcal') draft.kcalManual = true;
  if (f === 'durationMin') syncKcal();
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'progex') { ui.progEx = t.value; return render(); }
  if (t.dataset.set !== undefined && t.closest('#view')) {
    const key = t.dataset.set;
    const v = key === 'sex' ? t.value : Number(t.value);
    if (key !== 'sex' && !(v > 0)) { toast('Enter a positive number'); return render(); }
    db.settings[key] = v; save(); render(); return toast('Saved');
  }
  if (t.id === 'importFile') return importData(t.files[0]);
  if (!draft || sheetMode !== 'session') return;
  const f = t.dataset.f;
  if (f === 'exname') return renderSheet(); // refresh the "Last:" hint
  if (f === 'planId') {
    const plan = db.plans.find((p) => p.id === t.value);
    draft.planId = t.value;
    if (plan) {
      if (!draft.exercises.length || confirm('Replace the current exercises with this plan?')) applyPlan(draft, plan);
      else draft.name = plan.name;
    }
    return renderSheet();
  }
  if (f === 'sport' || f === 'intensity') { draft[f] = t.value; syncKcal(); }
});

function syncKcal() {
  if (draft.kcalManual) return;
  const k = $('#kcalInput'); if (k) k.value = estKcal(draft);
}

function savePlan() {
  const p = structuredClone(draft);
  p.name = (p.name || '').trim();
  if (!p.name) return toast('Give the plan a name');
  p.exercises = p.exercises.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), sets: Math.max(1, Number(e.sets) || 3), reps: Number(e.reps) || 10 }));
  if (!p.exercises.length) return toast('Add at least one exercise');
  const i = db.plans.findIndex((x) => x.id === p.id);
  if (i >= 0) db.plans[i] = p; else db.plans.push(p);
  save(); closeSheet(); render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `bami-fitness-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  $('#importFile').value = '';
  if (!file) return;
  try {
    const r = JSON.parse(await file.text());
    if (!Array.isArray(r.sessions) || !Array.isArray(r.plans)) throw new Error('bad shape');
    if (!confirm(`Replace current data with the backup (${r.sessions.length} sessions, ${r.plans.length} plans)?`)) return;
    db = { ...defaults(), ...r, settings: { ...defaults().settings, ...r.settings } };
    save(); render(); toast('Backup restored');
  } catch { toast('That file is not a valid Bami Fitness backup'); }
}

// ---------- boot ----------
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
