'use strict';
/* Bami Fitness - single-user workout planner/tracker. Data lives in localStorage on the device. */

const APP_VERSION = '2.3.0'; // keep in sync via tools/bump_version.py

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
const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? '' : Number(v));
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today = () => ymd(new Date());

// ---------- constants ----------
const TYPES = {
  plan: { label: 'Routine', icon: '📋' },
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

// ---------- storage ----------
const KEY = 'fitlog.v1'; // kept from v1 so existing data survives the rename
const defaults = () => ({
  settings: { weightKg: 70, heightCm: 170, age: 30, sex: 'male', goal: 'general', weeklyGoal: 4, restSec: 90 },
  plans: [], sessions: [], customEx: [],
});
/** Older plans stored `sets: 3, reps: 10` per exercise; plans now hold one row per set. */
function migrate(r) {
  for (const p of r.plans || []) for (const e of p.exercises || []) {
    if (!Array.isArray(e.sets)) e.sets = Array.from({ length: Number(e.sets) || 3 }, () => ({ reps: e.reps || 10, weight: '' }));
    delete e.reps;
  }
  return r;
}
function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r) return migrate({ ...defaults(), ...r, settings: { ...defaults().settings, ...r.settings } });
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
/**
 * BMI = kg / m². Category uses the WHO Asia-Pacific cut-offs (23 / 25), which fit Vietnamese adults better than 25 / 30.
 * BMI itself ignores age and sex, so they feed the body-fat estimate (Deurenberg 1991) that sits next to it.
 */
function bodyStats() {
  const p = db.settings, m = p.heightCm / 100, bmi = p.weightKg / (m * m);
  const adult = p.age >= 18;
  const cat = bmi < 18.5 ? ['Underweight', 'warn'] : bmi < 23 ? ['Normal', 'ok'] : bmi < 25 ? ['Overweight', 'warn'] : ['Obese', 'danger'];
  const bf = 1.2 * bmi + 0.23 * p.age - 10.8 * (p.sex === 'male' ? 1 : 0) - 5.4;
  return { bmi, adult, cat, bf: Math.max(3, bf), lo: 18.5 * m * m, hi: 22.9 * m * m };
}
function bodyCard() {
  const b = bodyStats();
  return `<div class="tiles">
    <div class="tile"><div class="v">${r1(b.bmi).toFixed(1)}</div><div class="l">BMI · ${b.adult ? `<span class="cat ${b.cat[1]}">${b.cat[0]}</span>` : 'adults 18+ only'}</div></div>
    <div class="tile"><div class="v">${b.adult ? r1(b.bf).toFixed(1) : '–'}<small>${b.adult ? ' %' : ''}</small></div><div class="l">Est. body fat</div></div>
  </div>
  <div class="hint">${b.adult ? `Healthy weight for ${db.settings.heightCm} cm: ${r1(b.lo).toFixed(1)}–${r1(b.hi).toFixed(1)} kg (Asia-Pacific range). ` : 'For under 18, compare against BMI-for-age charts instead. '}Body fat is a rough estimate from BMI, age and sex; BMI does not tell muscle from fat.</div>`;
}

/** kcal = MET × (BMR per hour) × hours: a MET is a multiple of the resting rate, so a personal BMR beats the one-size 1 kcal/kg/h rule. */
const estKcal = (s) => Math.round(metFor(s) * (INTENSITY[s.intensity] || 1) * (bmr() / 24) * (Number(s.durationMin) || 0) / 60);
const doneSessions = () => db.sessions.filter((s) => s.status === 'done');
const sessionsOn = (date) => db.sessions.filter((s) => s.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
const setCount = (s) => s.exercises.reduce((n, e) => n + e.sets.length, 0);
const sortedDesc = () => [...db.sessions].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Legacy sets have no `done` flag and count as done; only sets explicitly left unchecked are ignored. */
const countsAsDone = (x) => x.done !== false;

const library = () => [...LIBRARY_FLAT, ...db.customEx];
const exInfo = (name) => library().find((x) => sameName(x.name, name));

function exerciseNames() {
  const counts = new Map();
  for (const s of doneSessions()) for (const e of s.exercises) {
    const k = e.name.trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}
/** Sets of the most recent done session containing this exercise (shown in the PREVIOUS column). */
function lastSets(name, excludeId) {
  for (const s of sortedDesc()) {
    if (s.status !== 'done' || s.id === excludeId) continue;
    const ex = s.exercises.find((e) => sameName(e.name, name));
    if (ex && ex.sets.length) return ex.sets.filter(countsAsDone);
  }
  return [];
}

// ---------- coaching (rules live in coach.js) ----------
const goalKey = () => (GOALS[db.settings.goal] ? db.settings.goal : 'general');
/** Exercises for a muscle: ones you already do first, then library order (compound lifts come first). */
function suggestExercises(muscle, n, exclude) {
  const used = new Map();
  for (const s of doneSessions()) for (const e of s.exercises) used.set(e.name.toLowerCase(), (used.get(e.name.toLowerCase()) || 0) + 1);
  return library().filter((x) => x.muscle === muscle && !exclude.some((y) => sameName(y, x.name)))
    .map((x, i) => ({ x, i, n: used.get(x.name.toLowerCase()) || 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i).slice(0, n).map((o) => o.x.name);
}
const coachCtx = () => ({ goalKey: goalKey(), info: exInfo, suggest: suggestExercises });
const weekBounds = (dateStr) => { const m = mondayOf(parseYmd(dateStr)); return [ymd(m), ymd(addDays(m, 6))]; };
const between = (list, a, b) => list.filter((s) => s.date >= a && s.date <= b);
const FIND_MARK = { warn: '!', tip: '→', ok: '✓' };

function findingsHTML(list, interactive) {
  return list.map((f) => `<div class="find ${f.level}"><span class="fi">${FIND_MARK[f.level]}</span><div>${esc(f.text)}${
    f.add?.length
      ? (interactive
        ? `<div class="adds">${f.add.map((n) => `<button class="addchip" data-act="addsug" data-n="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`
        : `<div class="try">Try: ${esc(f.add.join(', '))}</div>`)
      : ''}</div></div>`).join('');
}
const COACH_NOTE = '<div class="hint">General guidance from common training rules - not medical advice or a personal programme.</div>';

/** Per-session / per-muscle analysis of the session or plan being edited. */
function draftAnalysis() {
  const d = draft;
  const finished = d.status === 'done';
  const cleaned = (list) => list.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: finished ? true : x.done })) }));
  if (sheetMode === 'plan') {
    const pseudo = { id: d.id, date: today(), status: 'planned', type: 'plan', intensity: 'Moderate', exercises: d.exercises };
    return assessSession({ session: pseudo, weekSessions: null, neighbors: [], restSec: db.settings.restSec, ...coachCtx() });
  }
  const date = d.date || today();
  const [a, b] = weekBounds(date);
  const others = db.sessions.filter((x) => x.id !== d.id);
  const near = others.filter((x) => Math.abs(dayNum(x.date) - dayNum(date)) <= 3);
  return assessSession({ session: { ...d, date, exercises: cleaned(d.exercises) }, weekSessions: between(others, a, b), neighbors: near, restSec: db.settings.restSec, ...coachCtx() });
}
function analysisHTML(a) {
  const t = a.totals;
  const tiles = t.sets ? `<div class="tiles three">
    <div class="tile"><div class="v">${t.sets}</div><div class="l">Sets · ${t.exercises} exercises</div></div>
    <div class="tile"><div class="v">${fmt(t.volume)}</div><div class="l">Volume (kg)</div></div>
    <div class="tile"><div class="v">~${t.estMin}<small> min</small></div><div class="l">Est. duration</div></div></div>` : '';
  const rows = a.rows.length ? `<div class="card mtable"><div class="hint" style="margin:0 0 8px">Sets per muscle in this ${sheetMode === 'plan' ? 'routine' : 'session'} (3-10 is the sweet spot)</div>${a.rows.map((r) => `
    <div class="mrow"><span class="mn">${esc(r.muscle)}</span>
      <span class="mbar"><i class="${r.status}" style="width:${Math.min(100, r.sets / 12 * 100)}%"></i></span>
      <span class="mv">${r.sets}${r.week != null ? `<small> · week ${r.week}/${r.min}-${r.max}</small>` : ''}</span></div>`).join('')}</div>` : '';
  const empty = !t.sets && sheetMode === 'plan' ? '<div class="empty" style="padding:14px">Add exercises to see the analysis.</div>' : '';
  return `${tiles}${rows}<div class="finds">${findingsHTML(a.findings, true)}</div>${empty}${COACH_NOTE}`;
}
let anaTimer;
function refreshAnalysis() {
  clearTimeout(anaTimer);
  anaTimer = setTimeout(() => { const el = $('#ana'); if (el && draft) el.innerHTML = analysisHTML(draftAnalysis()); }, 200);
}

// ---------- ui state ----------
const ui = {
  view: 'home', sel: today(),
  dashMode: 'week', revPeriod: 'week', revBasis: 'plan', progEx: '', progRange: '3M', progMetric: 'weight',
};
let draft = null;       // session or plan being edited in the sheet
let sheetMode = null;   // 'session' | 'plan'
let isNew = false;

// ---------- views ----------
function render() {
  const views = { home: homeView, plans: plansView, dash: dashView, progress: progressView, settings: settingsView };
  $('#view').innerHTML = views[ui.view]();
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === ui.view));
}

const tagOf = (s) => sessionTag(s, exInfo);
const planTag = (p) => sessionTag({ type: 'plan', name: p.name, tag: p.tag, exercises: p.exercises }, exInfo);
const tagBadge = (tag, status) => `<span class="cico ${status === 'done' ? 'done' : 'plan'}" style="--c:${TAGS[tag].color}" title="${esc(tag)}">${tagSvg(tag)}</span>`;

function calendarHTML() {
  const sel = parseYmd(ui.sel), y = sel.getFullYear(), m = sel.getMonth(), t = today();
  const start = mondayOf(new Date(y, m, 1)), end = addDays(mondayOf(new Date(y, m + 1, 0)), 6);
  const monthKey = `${y}-${pad(m + 1)}`;
  const used = new Map();
  let cells = '';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = ymd(d), ss = sessionsOn(key);
    ss.forEach((x) => { if (key.startsWith(monthKey)) used.set(tagOf(x), true); });
    const icons = ss.slice(0, 2).map((x) => tagBadge(tagOf(x), x.status)).join('') + (ss.length > 2 ? `<span class="more">+${ss.length - 2}</span>` : '');
    cells += `<button class="cell${key.startsWith(monthKey) ? '' : ' out'}${key === t ? ' today' : ''}${key === ui.sel ? ' sel' : ''}" data-act="sel" data-d="${key}" aria-label="${key}">
      <span class="cn">${d.getDate()}</span><span class="cicos">${icons}</span></button>`;
  }
  const legend = [...used.keys()].map((tag) => `<span class="lg" style="--c:${TAGS[tag].color}">${tagSvg(tag)}${esc(tag)}</span>`).join('');
  return `<div class="cal-head">${DAY.map((d) => `<span>${d}</span>`).join('')}</div><div class="cal">${cells}</div>
    <div class="legend2">${legend}<span class="lg2"><i class="cico done" style="--c:#8d8d9a"></i>done <i class="cico plan" style="--c:#8d8d9a"></i>planned</span></div>`;
}

/** One-tap row for the selected day: pick a plan (or a sport) and it lands on the calendar with its icon. */
function quickPlanRow() {
  const chip = (act, attr, tag, label) => `<button class="qchip" data-act="${act}" ${attr} style="--c:${TAGS[tag].color}"><i>${tagSvg(tag)}</i>${esc(label)}</button>`;
  return `<div class="chips scroll quick">
    ${db.plans.map((p) => chip('quickplan', `data-id="${p.id}"`, planTag(p), p.name)).join('')}
    ${chip('quickpreset', 'data-v="pickleball"', 'Pickleball', 'Pickleball')}
    ${chip('quickpreset', 'data-v="cardio"', 'Cardio', 'Cardio')}
    ${chip('quickpreset', 'data-v="free"', 'Workout', 'Free style')}
  </div>${db.plans.length ? '' : '<div class="hint">Create routines (Push, Pull, Legs…) in the Routines tab and they show up here.</div>'}`;
}

function homeView() {
  const selD = parseYmd(ui.sel);
  const t = today();
  const weekKeys = Array.from({ length: 7 }, (_, i) => ymd(addDays(mondayOf(selD), i)));
  const weekDone = doneSessions().filter((s) => weekKeys.includes(s.date));
  const weekKcal = weekDone.reduce((n, s) => n + (s.kcal || 0), 0);
  const list = sessionsOn(ui.sel);
  const heading = ui.sel === t ? 'Today' : `${DAY[(selD.getDay() + 6) % 7]}, ${selD.getDate()} ${MONTH[selD.getMonth()]}`;
  return `
  <header class="top">
    <div><div class="brand">Bami Fitness</div><h1>${MONTH[selD.getMonth()]} ${selD.getFullYear()}</h1>
      <div class="sub">${weekDone.length}/${db.settings.weeklyGoal} workouts · ${fmt(weekKcal)} kcal this week</div></div>
    <div class="weeknav">
      <button class="icon-btn" data-act="monthshift" data-n="-1" aria-label="Previous month">‹</button>
      <button class="icon-btn" data-act="sel" data-d="${t}" aria-label="Today">●</button>
      <button class="icon-btn" data-act="monthshift" data-n="1" aria-label="Next month">›</button>
    </div>
  </header>
  ${calendarHTML()}
  ${weekCheckCard(weekKeys)}
  <h3>${heading}</h3>
  <div class="list">${list.length ? list.map(sessionCard).join('') : '<div class="empty" style="padding:18px">Nothing planned for this day.</div>'}</div>
  <h3>Add a routine to this day</h3>
  ${quickPlanRow()}
  <button class="fab" data-act="add" aria-label="Add session">+</button>`;
}

function weekCheckCard(weekKeys) {
  const ss = between(db.sessions, weekKeys[0], weekKeys[6]);
  if (!ss.length) return '';
  const r = assessPeriod({ sessions: ss, weeks: 1, frac: 1, basis: 'plan', weeklyGoal: db.settings.weeklyGoal, age: db.settings.age, ...coachCtx() });
  return `<div class="card weekcheck" data-act="openreview" role="button" tabindex="0">
    <div class="wc-head"><h2>Week check</h2><span class="pill">${ss.length} sessions · ${r.totals.sets} sets</span></div>
    <div class="finds">${findingsHTML(r.findings.slice(0, 2), false)}</div><div class="hint">Tap for the full review ›</div></div>`;
}

function sessionCard(s) {
  const bits = [];
  if (s.time) bits.push(s.time);
  if (s.exercises.length) bits.push(`${s.exercises.length} exercises · ${setCount(s)} sets`);
  if (s.durationMin) bits.push(`${s.durationMin} min`);
  if (s.status === 'done' && s.kcal) bits.push(`${fmt(s.kcal)} kcal`);
  const hr = s.avgHr ? ` · <span class="hr">♥ ${s.avgHr} avg</span>` : '';
  const right = s.status === 'done'
    ? '<span class="pill done">Done</span>'
    : `<button class="check" data-act="quickdone" data-id="${s.id}" aria-label="Mark done">✓</button>`;
  return `<div class="session ${s.status}" data-act="edit" data-id="${s.id}" role="button" tabindex="0">
    <div class="ico" style="--c:${TAGS[tagOf(s)].color}">${tagSvg(tagOf(s))}</div>
    <div class="meta"><div class="name">${esc(s.name)}</div><div class="info">${esc(bits.join(' · '))}${hr}</div></div>${right}</div>`;
}

function plansView() {
  const cards = db.plans.map((p) => {
    const sets = p.exercises.reduce((n, e) => n + e.sets.length, 0);
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div><h2 class="hname">${tagBadge(planTag(p), 'done')}${esc(p.name)}</h2><div class="hint" style="margin-top:2px">${p.exercises.length} exercises · ${sets} sets</div></div>
        <div style="display:flex;gap:6px"><button class="ghost" data-act="plan-edit" data-id="${p.id}">Edit</button>
        <button class="primary sm" data-act="plan-use" data-id="${p.id}">Schedule</button></div>
      </div>
      <div class="hint">${esc(p.exercises.map((e) => `${e.name} ×${e.sets.length}`).join(' · '))}</div>
    </div>`;
  }).join('');
  return `
  <header class="top"><div><div class="brand">Bami Fitness</div><h1>Routines</h1><div class="sub">Reusable workouts: Push, Pull, Legs…</div></div>
    <button class="primary sm" data-act="plan-new">+ New routine</button></header>
  <div class="list">${cards || '<div class="empty">No routines yet.<br>Create one like "Push" or "Legs" and pick its exercises from the library.<br>Then on the Schedule tab just choose a date and a routine.</div>'}</div>`;
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
  const inRange = doneSessions().filter((s) => s.date >= rangeStart).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  // breakdown by activity within the chart range
  const byType = {};
  for (const s of inRange) {
    const k = s.type === 'sport' ? s.sport : TYPES[s.type].label;
    byType[k] = byType[k] || { kcal: 0, count: 0 };
    byType[k].kcal += s.kcal || 0; byType[k].count++;
  }
  const rows = Object.entries(byType).sort((a, b) => b[1].kcal - a[1].kcal);
  const maxK = Math.max(1, ...rows.map((r) => r[1].kcal));

  // heart rate across sessions in range
  const hrAvg = inRange.filter((s) => s.avgHr), hrMax = inRange.filter((s) => s.maxHr), hrMin = inRange.filter((s) => s.minHr);
  const pts = (list, k) => list.map((s) => ({ x: parseYmd(s.date), y: s[k], date: s.date }));
  const hrSection = hrAvg.length || hrMax.length ? `
  <div class="tiles three">
    <div class="tile cool"><div class="v">${hrMin.length ? Math.min(...hrMin.map((s) => s.minHr)) : '–'}</div><div class="l">Lowest bpm</div></div>
    <div class="tile"><div class="v">${hrAvg.length ? Math.round(hrAvg.reduce((n, s) => n + s.avgHr, 0) / hrAvg.length) : '–'}</div><div class="l">Avg bpm</div></div>
    <div class="tile hot"><div class="v">${hrMax.length ? Math.max(...hrMax.map((s) => s.maxHr)) : '–'}</div><div class="l">Peak bpm</div></div>
  </div>
  <div class="card" style="margin-top:10px">${lineChart([{ cls: 'max', pts: pts(hrMax, 'maxHr') }, { cls: 'avg', pts: pts(hrAvg, 'avgHr') }, { cls: 'min', pts: pts(hrMin, 'minHr') }], 'bpm')}
    <div class="legend"><span><i style="background:var(--hot)"></i>Max</span><span><i style="background:var(--accent)"></i>Avg</span><span><i style="background:var(--cool)"></i>Min</span><span>per session</span></div></div>`
    : '<div class="card empty" style="padding:18px">Add average / max / min heart rate to a session<br>(from your watch) to see it here.</div>';

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
  <header class="top"><div><div class="brand">Bami Fitness</div><h1>Dashboard</h1><div class="sub">Calories are estimated from your profile (age, sex, height, weight)</div></div></header>
  <div class="tiles">
    <div class="tile"><div class="v">${fmt(thisW.kcal)} <small>kcal</small></div><div class="l">This week</div></div>
    <div class="tile"><div class="v">${thisW.count}<small> / ${goal}</small></div><div class="l">Workouts this week</div>
      <div class="progress"><i style="width:${Math.min(100, goal ? thisW.count / goal * 100 : 0)}%"></i></div></div>
    <div class="tile"><div class="v">${fmt(thisM.kcal)} <small>kcal</small></div><div class="l">This month · ${thisM.count} workouts</div></div>
    <div class="tile"><div class="v">${streak}<small> wk</small></div><div class="l">Goal streak</div></div>
  </div>

  ${reviewSection()}

  <h3>Body</h3>
  ${bodyCard()}

  <h3>Calories burned</h3>
  <div class="seg accent" style="margin-bottom:10px">
    <button class="${mode === 'week' ? 'on' : ''}" data-act="dashmode" data-v="week">Weekly</button>
    <button class="${mode === 'month' ? 'on' : ''}" data-act="dashmode" data-v="month">Monthly</button>
  </div>
  <div class="card">${barChart(items)}</div>

  <h3>Heart rate · ${mode === 'week' ? 'last 8 weeks' : 'last 6 months'}</h3>
  ${hrSection}

  <h3>Frequency · last 12 weeks <span style="text-transform:none;letter-spacing:0">(${activeDays12w} active days)</span></h3>
  <div class="card"><div class="heat">${heat}</div></div>

  <h3>By activity · ${mode === 'week' ? 'last 8 weeks' : 'last 6 months'}</h3>
  <div class="card"><div class="bars">${rows.length ? rows.map(([k, v]) => `
    <div class="hbar"><span>${esc(k)}</span><span class="t"><i style="width:${v.kcal / maxK * 100}%"></i></span><span class="n">${fmt(v.kcal)} kcal</span></div>`).join('') : '<div class="empty" style="padding:10px">No completed sessions in this range.</div>'}</div></div>`;
}

/** Week/month review: what was done (actual) or what is scheduled (plan) against sensible weekly targets. */
function reviewSection() {
  const sel = parseYmd(ui.sel), basis = ui.revBasis, month = ui.revPeriod === 'month';
  let a, b, weeks, label;
  if (!month) { [a, b] = weekBounds(ui.sel); weeks = 1; const d = parseYmd(a); label = `Week of ${d.getDate()} ${MONTH[d.getMonth()]}`; }
  else {
    a = ymd(new Date(sel.getFullYear(), sel.getMonth(), 1)); b = ymd(new Date(sel.getFullYear(), sel.getMonth() + 1, 0));
    weeks = parseYmd(b).getDate() / 7; label = `${MONTH[sel.getMonth()]} ${sel.getFullYear()}`;
  }
  const t = today();
  const span = dayNum(b) - dayNum(a) + 1;
  const frac = basis === 'actual' && t >= a && t <= b ? Math.max(1 / 7, (dayNum(t) - dayNum(a) + 1) / span) : 1;
  const list = between(db.sessions, a, b).filter((s) => basis === 'plan' || s.status === 'done');
  const head = `<h3 id="review">Training review · ${GOALS[goalKey()].label}</h3>
  <div class="seg"><button class="${!month ? 'on' : ''}" data-act="revperiod" data-v="week">Week</button><button class="${month ? 'on' : ''}" data-act="revperiod" data-v="month">Month</button></div>
  <div class="seg accent" style="margin-top:8px"><button class="${basis === 'actual' ? 'on' : ''}" data-act="revbasis" data-v="actual">Actual</button><button class="${basis === 'plan' ? 'on' : ''}" data-act="revbasis" data-v="plan">Plan</button></div>
  <div class="hint">Actual = finished sessions only. Plan = finished + scheduled sessions.</div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0"><button class="icon-btn" data-act="revshift" data-n="-1" aria-label="Previous">‹</button><b>${label}</b><button class="icon-btn" data-act="revshift" data-n="1" aria-label="Next">›</button></div>`;
  if (basis === 'actual' && a > t) return `${head}<div class="card empty" style="padding:18px">Nothing is logged for a future period yet.<br>Switch to <b>Plan</b> to review what you have scheduled.</div>`;
  if (!list.length) return `${head}<div class="card empty" style="padding:18px">No ${basis === 'plan' ? 'sessions' : 'finished sessions'} in this ${month ? 'month' : 'week'}.${basis === 'plan' ? '<br>Schedule some on the Schedule tab to get a plan review.' : ''}</div>`;

  const r = assessPeriod({ sessions: list, weeks, frac, basis, weeklyGoal: db.settings.weeklyGoal, age: db.settings.age, ...coachCtx() });
  const to = r.totals;
  const bars = r.rows.map((x) => {
    const scale = Math.max(x.max * 1.2, x.sets, 1);
    return `<div class="mrow"><span class="mn">${esc(x.muscle)}</span>
      <span class="mbar"><i class="${x.status}" style="width:${x.sets / scale * 100}%"></i><b style="left:${x.min / scale * 100}%"></b></span>
      <span class="mv">${x.sets}<small> / ${x.min}-${x.max}</small></span></div>`;
  }).join('');
  const tips = basis === 'actual' ? overloadTips(db.sessions, exInfo) : [];
  const hr = r.hrPct ? `<div class="hint">Average heart rate across these sessions: ${Math.round(r.hrPct * 100)}% of your estimated max (${Math.round(hrMaxFor(db.settings.age))} bpm).</div>` : '';
  return `${head}
  <div class="tiles three">
    <div class="tile"><div class="v">${to.sessions}</div><div class="l">Sessions</div></div>
    <div class="tile"><div class="v">${to.sets}</div><div class="l">Lifting sets</div></div>
    <div class="tile"><div class="v">${to.minutes}<small> / ${to.targetMin}</small></div><div class="l">Minutes</div></div>
  </div>
  <div class="card mtable" style="margin-top:10px"><div class="hint" style="margin:0 0 8px">Sets per muscle vs target range${frac < 1 ? ' (this period is still in progress)' : ''}</div>${bars}</div>
  <div class="finds">${findingsHTML(r.findings, false)}${findingsHTML(tips, false)}</div>${hr}${COACH_NOTE}`;
}

function barChart(items) {
  const W = 340, H = 170, pl = 6, pr = 6, pt = 18, pb = 24;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (W - pl - pr) / items.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Calories bar chart">`;
  items.forEach((it, i) => {
    const h = Math.max(2, (H - pt - pb) * it.value / max);
    const x = pl + i * bw + bw * 0.17, w = bw * 0.66, y = H - pb - h;
    s += `<rect class="bar${it.cur ? ' cur' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
    if (it.value) s += `<text class="val" x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}">${fmt(it.value)}</text>`;
    s += `<text class="lbl" x="${(x + w / 2).toFixed(1)}" y="${H - 8}">${esc(it.label)}</text>`;
  });
  return s + '</svg>';
}

/** series: [{cls, pts:[{x: Date, y: number}]}] with pts sorted by x; all series share the axes. */
function lineChart(series, unit, labelLast) {
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return '';
  const W = 340, H = 190, pl = 38, pr = 14, pt = 20, pb = 26;
  let lo = Math.min(...all.map((p) => p.y)), hi = Math.max(...all.map((p) => p.y));
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
  const xs = all.map((p) => p.x.getTime());
  const t0 = Math.min(...xs), t1 = Math.max(...xs);
  const X = (d) => (t1 === t0 ? (pl + W - pr) / 2 : pl + (d.getTime() - t0) / (t1 - t0) * (W - pl - pr));
  const Y = (v) => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Line chart">`;
  for (let i = 0; i <= 3; i++) {
    const v = lo + (hi - lo) * i / 3, y = Y(v);
    s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="ylbl" x="${pl - 5}" y="${(y + 3).toFixed(1)}">${Math.round(v)}</text>`;
  }
  series.forEach((sr, si) => {
    if (!sr.pts.length) return;
    if (sr.pts.length > 1) s += `<polyline class="line ${sr.cls}" points="${sr.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
    sr.pts.forEach((p, i) => {
      s += `<circle class="pt ${sr.cls}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.5"><title>${ymd(p.x)}: ${r1(p.y)} ${unit}</title></circle>`;
      if (labelLast && si === 0 && i === sr.pts.length - 1) s += `<text class="ptl" x="${Math.min(X(p.x), W - 24).toFixed(1)}" y="${(Y(p.y) - 9).toFixed(1)}">${r1(p.y)}</text>`;
    });
  });
  const lbl = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MONTH[d.getMonth()]}`; };
  s += `<text class="lbl" x="${pl}" y="${H - 8}" style="text-anchor:start">${lbl(t0)}</text>`;
  if (t1 > t0) s += `<text class="lbl" x="${W - pr}" y="${H - 8}" style="text-anchor:end">${lbl(t1)}</text>`;
  return s + '</svg>';
}

// --- progress ---
function progressView() {
  const names = exerciseNames();
  if (!ui.progEx || !names.includes(ui.progEx)) ui.progEx = names[0] || '';
  const header = '<header class="top"><div><div class="brand">Bami Fitness</div><h1>Progress</h1><div class="sub">Track strength per exercise</div></div></header>';
  if (!names.length) return `${header}<div class="empty">Log a completed session with weights<br>to see your progress here.</div>`;

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
    const ex = s.exercises.find((e) => sameName(e.name, ui.progEx));
    if (!ex) continue;
    const sets = ex.sets.filter((x) => countsAsDone(x) && (Number(x.weight) > 0 || Number(x.reps) > 0));
    if (!sets.length) continue;
    const top = [...sets].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
    entries.push({ date: s.date, y: m.fn(sets), top, sets: sets.length, x: parseYmd(s.date) });
  }
  const best = entries.reduce((b, e) => (e.y > (b?.y ?? -1) ? e : b), null);
  const change = entries.length > 1 ? entries[entries.length - 1].y - entries[0].y : null;
  const pct = change != null && entries[0].y ? change / entries[0].y * 100 : null;

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
  <div class="card" style="margin-top:12px">${lineChart([{ cls: 'avg', pts: entries }], m.unit, true)}</div>
  <h3>Recent sessions</h3>
  <div class="card"><table class="table"><tr><th>Date</th><th>Sets</th><th>Top set</th></tr>
    ${[...entries].reverse().slice(0, 10).map((e) => `<tr><td>${e.date}</td><td>${e.sets}</td><td>${e.top.reps || '–'} × ${e.top.weight || 0} kg</td></tr>`).join('')}</table></div>`
    : '<div class="empty">No sessions with this exercise in the selected range.</div>'}`;
}

function settingsView() {
  const s = db.settings;
  return `
  <header class="top"><div><div class="brand">Bami Fitness</div><h1>Settings</h1></div></header>
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
  </div>
  <h3>Body</h3>
  ${bodyCard()}
  <div class="hint">Resting metabolism (BMR): <b>${fmt(bmr())} kcal/day</b>. Used to estimate calories burned in each session.</div>
  <h3>Training</h3>
  <div class="card">
    <label>Main goal<select data-set="goal">${Object.entries(GOALS).map(([k, g]) => `<option value="${k}"${k === goalKey() ? ' selected' : ''}>${g.label}</option>`).join('')}</select></label>
    <div class="hint">Sets the weekly targets used by the analysis (sets per muscle, training minutes).</div>
    <div class="row2">
      <label>Weekly workout goal<input inputmode="numeric" data-set="weeklyGoal" value="${s.weeklyGoal}"></label>
      <label>Rest timer (sec)<input inputmode="numeric" data-set="restSec" value="${s.restSec}"></label>
    </div>
  </div>
  <h3>About</h3>
  <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
    <div><b>Bami Fitness</b><div class="hint" style="margin:2px 0 0">Version ${APP_VERSION}</div><div class="hint" id="updMsg" style="margin:2px 0 0">${esc(ui.updMsg || '')}</div></div>
    <button class="ghost" data-act="checkupdate">Check for updates</button>
  </div>
  <h3>Backup</h3>
  <div class="card">
    <div class="hint" style="margin:0 0 10px">Data is stored only on this phone. Export a backup now and then, especially before clearing browser data or changing phones.</div>
    <div style="display:flex;gap:8px"><button class="primary" data-act="export">Export JSON</button><button class="ghost" data-act="import">Import…</button></div>
    <div class="hint">${db.sessions.length} sessions · ${db.plans.length} routines</div>
  </div>
  <h3>Danger zone</h3>
  <button class="danger" style="margin-top:0" data-act="reset">Erase all data</button>`;
}

// ---------- session editor ----------
function newDraft(date, plan) {
  const d = {
    id: uid(), date, time: '18:00', type: 'plan', name: '', planId: '', sport: 'Pickleball',
    durationMin: 60, intensity: 'Moderate', kcal: 0, kcalManual: false, notes: '', tag: '',
    avgHr: '', maxHr: '', minHr: '',
    status: date < today() ? 'done' : 'planned', exercises: [],
  };
  if (plan) applyPlan(d, plan);
  return d;
}
function applyPlan(d, plan) {
  d.type = 'plan'; d.planId = plan.id; d.name = plan.name; d.tag = plan.tag || '';
  d.exercises = plan.exercises.map((e) => ({
    name: e.name, sets: e.sets.map((x) => ({ reps: x.reps ?? '', weight: x.weight ?? '', done: false })),
  }));
  const n = d.exercises.reduce((t, e) => t + e.sets.length, 0);
  if (n) d.durationMin = Math.max(20, Math.round((n * (0.75 + db.settings.restSec / 60) + 5) / 5) * 5);
}
const blankSets = (name, excludeId) => {
  const prev = lastSets(name, excludeId);
  return Array.from({ length: Math.min(5, Math.max(prev.length, 3)) }, () => ({ reps: '', weight: '', done: false }));
};

function openSheet(mode) { sheetMode = mode; $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; renderSheet(false); }
function closeSheet() { stopRest(); $('#sheet').hidden = true; document.body.style.overflow = ''; draft = null; sheetMode = null; }
function renderSheet(keepScroll = true) {
  const body = $('#sheetBody');
  const top = body.scrollTop;
  body.innerHTML = sheetMode === 'plan' ? planEditorHTML() : sessionEditorHTML();
  body.scrollTop = keepScroll ? top : 0;
}

/** One exercise: header + set table. Session mode adds PREVIOUS and the done tick; plan mode is targets only. */
function exerciseBlock(e, i, mode) {
  const info = exInfo(e.name);
  const session = mode === 'session';
  const prev = session ? lastSets(e.name, draft.id) : [];
  const rows = e.sets.map((x, j) => {
    const p = prev[j] || null;
    const inputs = `
      <input inputmode="decimal" data-ex="${i}" data-set="${j}" data-f="weight" placeholder="${p ? esc(p.weight) : ''}" value="${esc(x.weight)}">
      <input inputmode="numeric" data-ex="${i}" data-set="${j}" data-f="reps" placeholder="${p ? esc(p.reps) : ''}" value="${esc(x.reps)}">`;
    return session
      ? `<div class="srow${x.done ? ' done' : ''}"><span class="n">${j + 1}</span>
          <button class="prev" data-act="useprev" data-ex="${i}" data-set="${j}"${p ? '' : ' disabled'}>${p ? `${p.weight || '–'} × ${p.reps || '–'}` : '–'}</button>${inputs}
          <button class="chk${x.done ? ' on' : ''}" data-act="toggleset" data-ex="${i}" data-set="${j}" aria-label="Mark set done">✓</button>
          <button class="x" data-act="delset" data-ex="${i}" data-set="${j}" aria-label="Remove set">×</button></div>`
      : `<div class="srow plan"><span class="n">${j + 1}</span>${inputs}
          <button class="x" data-act="delset" data-ex="${i}" data-set="${j}" aria-label="Remove set">×</button></div>`;
  }).join('');
  return `<div class="ex">
    <div class="ex-head"><div class="ex-title"><b>${esc(e.name)}</b><small>${esc(info ? `${info.muscle} · ${info.equip}` : 'Custom')}</small></div>
      ${session ? '<button class="sq" data-act="rest" aria-label="Start rest timer">⏱</button>' : ''}
      <button class="sq" data-act="delex" data-ex="${i}" aria-label="Remove exercise">✕</button></div>
    <div class="srow hdr${session ? '' : ' plan'}"><span>SET</span>${session ? '<span>PREVIOUS</span>' : ''}<span>KG</span><span>REPS</span>${session ? '<span>✓</span>' : ''}<span></span></div>
    ${rows}
    <button class="addset" data-act="addset" data-ex="${i}">+ Add set</button>
  </div>`;
}

function sessionEditorHTML() {
  const d = draft;
  const kc = d.kcalManual ? d.kcal : estKcal(d);
  const typeFields = d.type === 'plan'
    ? `<label class="field">Routine<select data-f="planId"><option value="">Custom name…</option>${db.plans.map((p) => `<option value="${p.id}"${p.id === d.planId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
       <label class="field">Name<input data-f="name" value="${esc(d.name)}" placeholder="e.g. Push Day"></label>`
    : d.type === 'free'
      ? `<label class="field">Name<input data-f="name" value="${esc(d.name)}" placeholder="Free style"></label>`
      : `<label class="field">Sport<select data-f="sport">${Object.keys(SPORTS).map((k) => `<option${k === d.sport ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
         <label class="field">Title (optional)<input data-f="name" value="${esc(d.name)}" placeholder="e.g. Doubles with the team"></label>`;
  const exercises = d.type === 'sport' ? '' : `
    <h3>Exercises</h3>
    ${d.exercises.map((e, i) => exerciseBlock(e, i, 'session')).join('')}
    <button class="addex" data-act="addex">+ Add exercises</button>`;
  return `
  <div class="sheet-top"><button class="link" data-act="close">Cancel</button><h2>${isNew ? 'New session' : 'Edit session'}</h2><button class="primary sm" data-act="save">Save</button></div>
  <div class="seg">${Object.entries(TYPES).map(([k, t]) => `<button class="${d.type === k ? 'on' : ''}" data-act="type" data-v="${k}">${t.icon} ${t.label}</button>`).join('')}</div>
  ${typeFields}
  <label class="field">Calendar icon<select data-f="tag"><option value="">Auto · ${esc(sessionTag({ ...d, tag: '' }, exInfo))}</option>${PICK_TAGS.map((k) => `<option${k === d.tag ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
  <div class="row2"><label>Date<input type="date" data-f="date" value="${d.date}"></label><label>Time<input type="time" data-f="time" value="${d.time || ''}"></label></div>
  <div class="seg accent" style="margin-top:12px">
    <button class="${d.status === 'planned' ? 'on' : ''}" data-act="status" data-v="planned">Planned</button>
    <button class="${d.status === 'done' ? 'on' : ''}" data-act="status" data-v="done">Done</button></div>
  ${exercises}
  <h3>Analysis</h3>
  <div id="ana">${analysisHTML(draftAnalysis())}</div>
  <h3>Session stats</h3>
  <div class="row3" style="margin-top:0">
    <label>Minutes<input inputmode="numeric" data-f="durationMin" value="${d.durationMin}"></label>
    <label>Intensity<select data-f="intensity">${Object.keys(INTENSITY).map((k) => `<option${k === d.intensity ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
    <label>Calories<input id="kcalInput" inputmode="numeric" data-f="kcal" value="${kc}"></label></div>
  <div class="hint">Auto-estimated (${metFor(d)} MET × your BMR of ${fmt(bmr())} kcal/day). Type the number from your watch to replace it · <a href="#" class="link" style="padding:0" data-act="kcalauto">reset to estimate</a></div>
  <h3>Heart rate (bpm)</h3>
  <div class="row3" style="margin-top:0">
    <label>Average<input inputmode="numeric" data-f="avgHr" value="${esc(d.avgHr)}" placeholder="e.g. 128"></label>
    <label>Max<input inputmode="numeric" data-f="maxHr" value="${esc(d.maxHr)}" placeholder="e.g. 165"></label>
    <label>Min<input inputmode="numeric" data-f="minHr" value="${esc(d.minHr)}" placeholder="e.g. 78"></label></div>
  <label class="field">Notes<textarea data-f="notes" rows="3" placeholder="How it felt, injuries, equipment…">${esc(d.notes)}</textarea></label>
  ${d.status === 'planned' && d.date <= today() ? '<button class="primary finish" data-act="finish">✓ Finish workout</button>' : ''}
  ${isNew ? '' : '<button class="danger" data-act="delete">Delete session</button>'}`;
}

function saveSession() {
  const d = structuredClone(draft);
  if (!d.date) return toast('Pick a date');
  d.durationMin = Number(d.durationMin) || 0;
  for (const k of ['avgHr', 'maxHr', 'minHr']) {
    d[k] = num(d[k]);
    if (d[k] !== '' && !(d[k] >= 30 && d[k] <= 250)) return toast('Heart rate should be between 30 and 250 bpm');
  }
  const [lo, av, hi] = [d.minHr, d.avgHr, d.maxHr];
  if ((lo !== '' && av !== '' && lo > av) || (av !== '' && hi !== '' && av > hi) || (lo !== '' && hi !== '' && lo > hi)) {
    return toast('Heart rate: min ≤ average ≤ max');
  }
  d.exercises = d.type === 'sport' ? [] : d.exercises
    .map((e) => ({
      name: e.name.trim(),
      sets: e.sets.filter((x) => x.reps !== '' || x.weight !== '')
        // a finished session counts every filled set; a planned one keeps the ticks as they are
        .map((x) => ({ reps: num(x.reps), weight: num(x.weight), done: d.status === 'done' ? true : !!x.done })),
    }))
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
  <div class="sheet-top"><button class="link" data-act="close">Cancel</button><h2>${isNew ? 'New routine' : 'Edit routine'}</h2><button class="primary sm" data-act="plan-save">Save</button></div>
  <label>Routine name<input data-f="name" value="${esc(p.name)}" placeholder="e.g. Push Day"></label>
  <label class="field">Calendar icon<select data-f="tag"><option value="">Auto · ${esc(sessionTag({ type: 'plan', name: p.name, exercises: p.exercises }, exInfo))}</option>${PICK_TAGS.map((k) => `<option${k === p.tag ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
  ${p.exercises.map((e, i) => exerciseBlock(e, i, 'plan')).join('')}
  <button class="addex" data-act="addex">+ Add exercises</button>
  <h3>Analysis</h3>
  <div id="ana">${analysisHTML(draftAnalysis())}</div>
  ${isNew ? '' : '<button class="danger" data-act="plan-delete">Delete routine</button>'}`;
}

// ---------- exercise picker ----------
const pick = { q: '', muscle: 'All', sel: new Set(), cb: null };
function openPicker(cb) {
  Object.assign(pick, { q: '', muscle: 'All', sel: new Set(), cb });
  $('#picker').hidden = false;
  $('#pickerBody').innerHTML = `
    <div class="sheet-top"><button class="link" data-pk="close">Cancel</button><h2>Exercise library</h2><button class="primary sm" id="pickDone" data-pk="done">Add</button></div>
    <input id="pickQ" type="search" placeholder="Search by name or equipment…" autocomplete="off">
    <div class="chips scroll" id="pickChips"></div>
    <div class="plist" id="pickList"></div>`;
  $('#pickerBody').scrollTop = 0;
  renderPicker();
}
function closePicker() { $('#picker').hidden = true; }
function renderPicker() {
  const q = pick.q.trim().toLowerCase();
  $('#pickChips').innerHTML = ['All', ...MUSCLES].map((m) => `<button class="${pick.muscle === m ? 'on' : ''}" data-pk="muscle" data-v="${m}">${m}</button>`).join('');
  const items = library()
    .filter((x) => (pick.muscle === 'All' || x.muscle === pick.muscle) && (!q || x.name.toLowerCase().includes(q) || x.equip.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const row = (x) => `<button class="pitem${pick.sel.has(x.name) ? ' on' : ''}" data-pk="toggle" data-n="${esc(x.name)}">
      <span class="pic">${esc(x.name[0].toUpperCase())}</span><span class="pt"><b>${esc(x.name)}</b><small>${esc(x.muscle)} · ${esc(x.equip)}</small></span><span class="pchk">✓</span></button>`;
  const exact = library().some((x) => sameName(x.name, pick.q));
  const create = pick.q.trim() && !exact
    ? `<button class="pitem create" data-pk="create"><span class="pic">+</span><span class="pt"><b>Create "${esc(pick.q.trim())}"</b><small>Custom exercise${pick.muscle === 'All' ? '' : ` · ${esc(pick.muscle)}`}</small></span></button>` : '';
  $('#pickList').innerHTML = create + (items.map(row).join('') || (create ? '' : '<div class="empty">No exercises match.</div>'));
  $('#pickDone').textContent = pick.sel.size ? `Add (${pick.sel.size})` : 'Add';
}
$('#picker').addEventListener('input', (e) => {
  if (e.target.id !== 'pickQ') return;
  pick.q = e.target.value; renderPicker(); $('#pickerBody').scrollTop = 0;
});
$('#picker').addEventListener('click', (e) => {
  const el = e.target.closest('[data-pk]'); if (!el) return;
  const a = el.dataset.pk;
  if (a === 'close') return closePicker();
  if (a === 'muscle') { pick.muscle = el.dataset.v; renderPicker(); $('#pickerBody').scrollTop = 0; return; }
  if (a === 'toggle') { const n = el.dataset.n; pick.sel.has(n) ? pick.sel.delete(n) : pick.sel.add(n); return renderPicker(); }
  if (a === 'create') {
    const name = pick.q.trim();
    db.customEx.push({ name, muscle: pick.muscle === 'All' ? 'Other' : pick.muscle, equip: 'Other', custom: true });
    save(); pick.sel.add(name); pick.q = ''; $('#pickQ').value = ''; return renderPicker();
  }
  if (a === 'done') {
    const names = [...pick.sel], cb = pick.cb;
    closePicker();
    if (names.length && cb) cb(names);
  }
});

// ---------- rest timer & toast ----------
let restTimer = null, restEnd = 0;
function startRest(sec) {
  if (!(sec > 0)) return;
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const nav = e.target.closest('#nav button');
  if (nav) { ui.view = nav.dataset.view; window.scrollTo(0, 0); return render(); }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const a = el.dataset.act, id = el.dataset.id, v = el.dataset.v;
  const exI = el.dataset.ex !== undefined ? Number(el.dataset.ex) : null;
  const setJ = el.dataset.set !== undefined ? Number(el.dataset.set) : null;
  if (el.tagName === 'A') e.preventDefault();

  switch (a) {
    // schedule
    case 'sel': ui.sel = el.dataset.d; return render();
    case 'monthshift': {
      const cur = parseYmd(ui.sel), to = new Date(cur.getFullYear(), cur.getMonth() + Number(el.dataset.n), 1), now = new Date();
      ui.sel = to.getFullYear() === now.getFullYear() && to.getMonth() === now.getMonth() ? today() : ymd(to);
      return render();
    }
    case 'quickplan': return quickSchedule((d) => applyPlan(d, db.plans.find((p) => p.id === id)));
    case 'quickpreset':
      return quickSchedule((d) => {
        if (v === 'pickleball') Object.assign(d, { type: 'sport', sport: 'Pickleball', name: 'Pickleball', durationMin: 90 });
        else if (v === 'cardio') Object.assign(d, { type: 'sport', sport: 'Running', name: 'Cardio', durationMin: 45, tag: 'Cardio' });
        else { d.type = 'free'; d.openEditor = true; }
      });
    case 'add': draft = newDraft(ui.sel); isNew = true; return openSheet('session');
    case 'edit': draft = structuredClone(db.sessions.find((s) => s.id === id)); isNew = false; return openSheet('session');
    case 'quickdone': {
      const s = db.sessions.find((x) => x.id === id);
      s.status = 'done'; if (!s.kcalManual) s.kcal = estKcal(s);
      s.exercises.forEach((ex) => ex.sets.forEach((x) => { x.done = true; }));
      save(); render(); return toast(`Done · ~${fmt(s.kcal)} kcal (tap session to enter watch value)`);
    }
    // plans
    case 'plan-new': draft = { id: uid(), name: '', exercises: [] }; isNew = true; return openSheet('plan');
    case 'plan-edit': draft = structuredClone(db.plans.find((p) => p.id === id)); isNew = false; return openSheet('plan');
    case 'plan-use': draft = newDraft(ui.sel, db.plans.find((p) => p.id === id)); isNew = true; return openSheet('session');
    case 'plan-save': return savePlan();
    case 'plan-delete':
      if (confirm('Delete this routine? Past sessions are kept.')) { db.plans = db.plans.filter((p) => p.id !== draft.id); save(); closeSheet(); render(); }
      return;
    // sheet (shared by session and plan editors)
    case 'close': return closeSheet();
    case 'save': return saveSession();
    case 'finish': draft.status = 'done'; return saveSession();
    case 'delete':
      if (confirm('Delete this session?')) { db.sessions = db.sessions.filter((s) => s.id !== draft.id); save(); closeSheet(); render(); }
      return;
    case 'type': draft.type = v; return renderSheet();
    case 'status': draft.status = v; return renderSheet();
    case 'kcalauto': draft.kcalManual = false; return renderSheet();
    case 'addex':
      return openPicker((names) => {
        for (const name of names) {
          if (draft.exercises.some((x) => sameName(x.name, name))) continue;
          draft.exercises.push({
            name,
            sets: sheetMode === 'plan' ? Array.from({ length: 3 }, () => ({ reps: 10, weight: '' })) : blankSets(name, draft.id),
          });
        }
        renderSheet();
      });
    case 'delex': draft.exercises.splice(exI, 1); return renderSheet();
    case 'addset': {
      const sets = draft.exercises[exI].sets, prev = sets[sets.length - 1];
      sets.push({ reps: prev ? prev.reps : '', weight: prev ? prev.weight : '', done: false });
      return renderSheet();
    }
    case 'delset': draft.exercises[exI].sets.splice(setJ, 1); return renderSheet();
    case 'useprev': {
      const ex = draft.exercises[exI], p = lastSets(ex.name, draft.id)[setJ];
      if (p) { ex.sets[setJ].weight = p.weight; ex.sets[setJ].reps = p.reps; }
      return renderSheet();
    }
    case 'toggleset': {
      const ex = draft.exercises[exI], x = ex.sets[setJ], p = lastSets(ex.name, draft.id)[setJ];
      x.done = !x.done;
      if (x.done) {
        // like Hevy: ticking an empty row copies the previous values
        if (x.weight === '' && p) x.weight = p.weight;
        if (x.reps === '' && p) x.reps = p.reps;
        startRest(db.settings.restSec);
      }
      return renderSheet();
    }
    case 'addsug': {
      const name = el.dataset.n;
      if (!draft.exercises.some((x) => sameName(x.name, name))) {
        draft.exercises.push({ name, sets: sheetMode === 'plan' ? Array.from({ length: 3 }, () => ({ reps: 10, weight: '' })) : blankSets(name, draft.id) });
      }
      return renderSheet();
    }
    case 'rest': return startRest(db.settings.restSec);
    case 'openreview': ui.view = 'dash'; ui.revPeriod = 'week'; ui.revBasis = 'plan'; render(); window.scrollTo(0, 0); return $('#review')?.scrollIntoView();
    case 'revperiod': ui.revPeriod = v; return render();
    case 'revbasis': ui.revBasis = v; return render();
    case 'revshift': {
      const cur = parseYmd(ui.sel), n = Number(el.dataset.n);
      ui.sel = ymd(ui.revPeriod === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + n, 1) : addDays(cur, 7 * n));
      return render();
    }
    case 'rest-add': restEnd += 15000; return;
    case 'rest-stop': return stopRest();
    // dashboard / progress
    case 'dashmode': ui.dashMode = v; return render();
    case 'progrange': ui.progRange = v; return render();
    case 'progmetric': ui.progMetric = v; return render();
    // settings
    case 'checkupdate': setUpdMsg('Checking…'); return checkUpdate(true);
    case 'applyupdate': return applyUpdate();
    case 'export': return exportData();
    case 'import': return $('#importFile').click();
    case 'reset':
      if (confirm('Erase ALL sessions, routines and settings from this device? Export a backup first.')) { db = defaults(); save(); render(); toast('All data erased'); }
      return;
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); }
});

// text inputs update the draft without re-rendering (keeps focus and keyboard open)
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.closest('#view') || !draft || !t.dataset.f) return;
  const f = t.dataset.f;
  if (t.dataset.ex !== undefined && t.dataset.set !== undefined) { draft.exercises[t.dataset.ex].sets[t.dataset.set][f] = t.value; return refreshAnalysis(); }
  draft[f] = t.value;
  if (f === 'date') refreshAnalysis();
  if (sheetMode !== 'session') return;
  if (f === 'kcal') draft.kcalManual = true;
  if (f === 'durationMin') syncKcal();
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'progex') { ui.progEx = t.value; return render(); }
  if (t.dataset.set !== undefined && t.closest('#view')) {
    const key = t.dataset.set;
    const text = key === 'sex' || key === 'goal';
    const v = text ? t.value : Number(t.value);
    if (!text && !(v > 0)) { toast('Enter a positive number'); return render(); }
    db.settings[key] = v; save(); render(); return toast('Saved');
  }
  if (t.id === 'importFile') return importData(t.files[0]);
  if (!draft || sheetMode !== 'session') return;
  const f = t.dataset.f;
  if (f === 'planId') {
    const plan = db.plans.find((p) => p.id === t.value);
    draft.planId = t.value;
    if (plan) {
      // only ask when real numbers would be lost; reps copied from the previous routine do not count
      const entered = draft.exercises.some((e) => e.sets.some((x) => x.done || x.weight !== ''));
      if (!entered || confirm('Switch to this routine? It replaces the exercises and numbers entered in this session.')) applyPlan(draft, plan);
      else draft.name = plan.name;
    }
    return renderSheet();
  }
  if (f === 'sport' || f === 'intensity') { draft[f] = t.value; syncKcal(); refreshAnalysis(); }
  if (f === 'date') refreshAnalysis();
});

function syncKcal() {
  if (draft.kcalManual) return;
  const k = $('#kcalInput'); if (k) k.value = estKcal(draft);
}

/** Put a session on the selected day in one tap. Past days and free style open the editor instead, to log what happened. */
function quickSchedule(make) {
  const d = newDraft(ui.sel);
  make(d);
  const edit = d.openEditor || ui.sel < today();
  delete d.openEditor;
  if (edit) { draft = d; isNew = true; return openSheet('session'); }
  d.status = 'planned'; d.kcal = estKcal(d);
  db.sessions.push(d); save(); render();
  toast(`Scheduled ${d.name} - tap it to edit`);
}

function savePlan() {
  const p = structuredClone(draft);
  p.name = (p.name || '').trim();
  if (!p.name) return toast('Give the routine a name');
  p.exercises = p.exercises
    .map((e) => ({ name: e.name, sets: e.sets.filter((x) => x.reps !== '' || x.weight !== '').map((x) => ({ reps: num(x.reps), weight: num(x.weight) })) }))
    .filter((e) => e.sets.length);
  if (!p.exercises.length) return toast('Add at least one exercise with a set');
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
    if (!confirm(`Replace current data with the backup (${r.sessions.length} sessions, ${r.plans.length} routines)?`)) return;
    db = migrate({ ...defaults(), ...r, settings: { ...defaults().settings, ...r.settings } });
    save(); render(); toast('Backup restored');
  } catch { toast('That file is not a valid Bami Fitness backup'); }
}

// ---------- updates ----------
function setUpdMsg(msg) { ui.updMsg = msg; const el = $('#updMsg'); if (el) el.textContent = msg; }
async function fetchLatestVersion() {
  try { return (await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json()).version; } catch { return null; }
}
async function checkUpdate(manual) {
  const latest = await fetchLatestVersion();
  if (!latest) return manual && setUpdMsg('Could not reach the server - are you offline?');
  if (latest !== APP_VERSION) {
    const b = $('#update'); b.textContent = `New version ${latest} available - tap to update`; b.hidden = false;
    setUpdMsg(`New version ${latest} available`);
  } else if (manual) setUpdMsg(`You're on the latest version (${APP_VERSION})`);
}
/** Fetch the new service worker, wait until it has taken over, then reload. Saved data is not touched. */
async function applyUpdate() {
  toast('Updating…');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      const w = reg.installing || reg.waiting;
      if (w && w.state !== 'activated') {
        await new Promise((res) => { w.addEventListener('statechange', () => w.state === 'activated' && res()); setTimeout(res, 8000); });
      }
    }
  } catch { /* fall through to a plain reload */ }
  location.reload();
}

// ---------- boot ----------
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
setTimeout(() => checkUpdate(false), 1500);
