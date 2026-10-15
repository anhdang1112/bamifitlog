'use strict';
/*
 * Training analysis. Pure functions (no DOM, no storage) so the rules can be unit-tested in node.
 * The thresholds are common strength-training guidelines (weekly sets per muscle, push:pull balance,
 * ~48 h between hard sessions for the same muscle, ~150 min activity per week). They are general
 * guidance, not medical advice or a personalised programme.
 *
 * A "session" here is { id, date:'YYYY-MM-DD', status:'done'|'planned', type, intensity, durationMin, avgHr,
 *                       exercises:[{ name, sets:[{ reps, weight, done }] }] }.
 * `info(name)` returns { muscle, equip } for an exercise or undefined; `suggest(muscle, n, exclude)` returns names.
 */

const GROUPS = { Push: ['Chest', 'Shoulders', 'Triceps'], Pull: ['Back', 'Biceps', 'Forearms'], Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'] };
const PUSH = ['Chest', 'Shoulders', 'Triceps'];
const PULL = ['Back', 'Biceps'];
const LEGS = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
const MAJOR = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps'];
const MINOR = ['Calves', 'Core', 'Forearms'];
// weekly sets per muscle: [min, max]; activeMin = weekly minutes of training
const GOALS = {
  muscle: { label: 'Build muscle', major: [10, 20], minor: [6, 12], activeMin: 120 },
  fat: { label: 'Lose fat', major: [8, 14], minor: [4, 10], activeMin: 200 },
  general: { label: 'General fitness', major: [8, 16], minor: [4, 10], activeMin: 150 },
};
const SESSION_SETS = [3, 10]; // sensible sets per muscle inside ONE session

const hrMaxFor = (age) => 208 - 0.7 * age; // Tanaka formula
const dayNum = (date) => { const [y, m, d] = date.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const dayName = (date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dayNum(date) * 86400000).getUTCDay()];
const filled = (v) => v !== '' && v != null;

/** Planned sessions count every set row; finished ones only count ticked sets that have a value. */
function countSet(x, planned) {
  return planned ? true : x.done !== false && (filled(x.reps) || filled(x.weight));
}

function muscleStats(sessions, info) {
  const sets = {}, volume = {}, dates = {};
  for (const s of sessions) {
    const planned = s.status === 'planned';
    for (const e of s.exercises || []) {
      const m = info(e.name)?.muscle;
      for (const x of e.sets) {
        if (!countSet(x, planned) || !m) continue;
        sets[m] = (sets[m] || 0) + 1;
        volume[m] = (volume[m] || 0) + (Number(x.reps) || 0) * (Number(x.weight) || 0);
        (dates[m] = dates[m] || new Set()).add(s.date);
      }
    }
  }
  return { sets, volume, dates };
}
const sum = (stats, list) => list.reduce((n, m) => n + (stats.sets[m] || 0), 0);

function rank(findings) {
  const order = { warn: 0, tip: 1, ok: 2 };
  return findings.map((f, i) => [f, i]).sort((a, b) => order[a[0].level] - order[b[0].level] || a[1] - b[1]).map(([f]) => f);
}

/** Consecutive-day clashes: the same muscle with 6+ sets in two sessions less than ~48 h apart. */
function recoveryClashes(sessions, info) {
  const per = sessions.map((s) => ({ s, st: muscleStats([s], info) })).sort((a, b) => a.s.date.localeCompare(b.s.date));
  const out = new Map();
  for (let i = 0; i < per.length; i++) for (let j = i + 1; j < per.length; j++) {
    if (dayNum(per[j].s.date) - dayNum(per[i].s.date) > 1) break;
    for (const m of Object.keys(per[i].st.sets)) {
      if (per[i].st.sets[m] >= 6 && (per[j].st.sets[m] || 0) >= 6) {
        const days = out.get(m) || new Set(); days.add(dayName(per[i].s.date)); days.add(dayName(per[j].s.date)); out.set(m, days);
      }
    }
  }
  return [...out.entries()].map(([m, d]) => ({ muscle: m, days: [...d] }));
}

function longestRun(sessions) {
  const days = [...new Set(sessions.map((s) => dayNum(s.date)))].sort((a, b) => a - b);
  let best = 0, run = 0;
  days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}

/**
 * Review of a whole period (a week or a month) of sessions.
 * o: { sessions, goalKey, weeklyGoal, age, weeks, frac, basis:'actual'|'plan', info, suggest }
 * `frac` is the part of the period already elapsed (1 for plans and past periods).
 */
function assessPeriod(o) {
  const goal = GOALS[o.goalKey] || GOALS.general;
  const { sessions, weeks, frac, info, suggest, basis } = o;
  const noun = basis === 'plan' ? 'planned' : 'logged';
  const st = muscleStats(sessions, info);
  const rows = [...MAJOR, ...MINOR].map((m) => {
    const base = MAJOR.includes(m) ? goal.major : goal.minor;
    const min = Math.round(base[0] * weeks), max = Math.round(base[1] * weeks), sets = st.sets[m] || 0;
    const status = sets < min * frac ? (sets === 0 ? 'none' : 'low') : sets > max * 1.15 ? 'high' : 'ok';
    return { muscle: m, sets, min, max, volume: st.volume[m] || 0, status, days: st.dates[m]?.size || 0 };
  }).filter((r) => MAJOR.includes(r.muscle) || r.sets > 0);

  const f = [];
  const add = (level, text, adds) => f.push({ level, text, add: adds || [] });

  // 1) muscles below / above the weekly range
  const lagging = rows.filter((r) => MAJOR.includes(r.muscle) && (r.status === 'none' || r.status === 'low'))
    .sort((a, b) => (a.sets / a.min) - (b.sets / b.min)).slice(0, 5);
  for (const r of lagging) {
    add(r.status === 'none' && frac >= 1 ? 'warn' : 'tip',
      r.status === 'none'
        ? `${r.muscle}: no sets ${noun}${frac < 1 ? ' yet' : ''} (aim for ${r.min}-${r.max}).`
        : `${r.muscle}: ${r.sets} of ${r.min}-${r.max} sets${frac < 1 ? ' - behind pace' : ''}.`,
      suggest(r.muscle, 2, []));
  }
  for (const r of rows.filter((x) => x.status === 'high')) {
    add('warn', `${r.muscle}: ${r.sets} sets is above the ${r.max}-set ceiling - risk of overuse. Trim it or move volume to a lagging muscle.`);
  }

  // 2) balance
  const push = sum(st, PUSH), pull = sum(st, PULL), legs = sum(st, LEGS), lifted = sum(st, [...MAJOR, ...MINOR]);
  if (push >= 6 && pull < 0.8 * push) add('tip', `Push ${push} vs pull ${pull} sets. Add rows, pulldowns or face pulls to keep the shoulders healthy.`, suggest('Back', 2, []));
  else if (pull >= 6 && push < 0.5 * pull) add('tip', `Pull ${pull} vs push ${push} sets. Add some pressing work for balance.`, suggest('Chest', 2, []));
  if (lifted >= 15 && legs / lifted < 0.25) add('tip', `Legs are only ${Math.round(legs / lifted * 100)}% of your lifting volume. Big leg work also drives overall strength.`, suggest('Quads', 1, []).concat(suggest('Hamstrings', 1, [])));
  if (weeks === 1) {
    for (const r of rows.filter((x) => MAJOR.includes(x.muscle) && x.sets >= 12 && x.days === 1)) {
      add('tip', `${r.muscle}: ${r.sets} sets in a single day. Splitting them over 2 days usually works better.`);
    }
  }

  // 3) recovery and rest
  for (const c of recoveryClashes(sessions, info)) {
    add('warn', `${c.muscle} is trained hard on ${c.days.join(' and ')}. Leave about 48 h between hard sessions for the same muscle.`);
  }
  if (longestRun(sessions) >= 4) add('tip', `${longestRun(sessions)} training days in a row. Plan a rest or light day to recover.`);

  // 4) volume of training and intensity
  const minutes = sessions.reduce((n, s) => n + (Number(s.durationMin) || 0), 0);
  const targetMin = goal.activeMin * weeks;
  if (sessions.length && minutes < 0.75 * targetMin * frac) add('tip', `Training time ${minutes} of ~${Math.round(targetMin)} min ${weeks > 1 ? 'this month' : 'this week'}. Add a session or lengthen the short ones.`);
  const target = Math.round(o.weeklyGoal * weeks);
  if (sessions.length < Math.floor(target * frac * 0.75)) add('tip', `${sessions.length} sessions ${noun} vs your goal of ${target}.`);
  const hard = sessions.filter((s) => s.intensity === 'Hard').length;
  if (hard / weeks >= 3) add('warn', `${hard} Hard sessions - that is a lot of high-stress training. Mix in Moderate and Light days.`);
  else if (basis === 'plan' && sessions.length >= 3 * weeks && hard === 0 && o.goalKey === 'muscle') add('tip', 'No Hard session in the plan. One or two heavy sessions per week drive progress.');
  const hrs = sessions.filter((s) => s.status === 'done' && s.avgHr).map((s) => s.avgHr / hrMaxFor(o.age));
  let hrPct = null;
  if (hrs.length) {
    hrPct = hrs.reduce((a, b) => a + b, 0) / hrs.length;
    if (hrs.length >= 3 && hrPct < 0.64 && o.goalKey !== 'muscle') add('tip', `Average heart rate is only ${Math.round(hrPct * 100)}% of max. For fat loss, add intervals or shorten rests to spend time in the moderate-to-hard zone.`);
    if (hrs.length >= 3 && hrs.filter((p) => p > 0.85).length >= hrs.length / 2) add('warn', 'Most sessions run above 85% of max heart rate. Make sure you recover, and keep some easy days.');
  }

  if (!f.length && sessions.length) add('ok', 'On track: volume, balance and recovery look fine for this period.');
  return {
    rows, findings: rank(f), hrPct,
    totals: { sessions: sessions.length, sets: lifted, minutes, targetMin: Math.round(targetMin), volume: Object.values(st.volume).reduce((a, b) => a + b, 0) },
  };
}

/** Progressive-overload hints from finished sessions: stuck at the same load, or ready to go heavier. */
function overloadTips(sessions, info, limit = 3) {
  const by = new Map();
  for (const s of [...sessions].filter((x) => x.status === 'done').sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.exercises || []) {
      const sets = e.sets.filter((x) => countSet(x, false) && Number(x.weight) > 0 && Number(x.reps) > 0);
      if (!sets.length) continue;
      const maxW = Math.max(...sets.map((x) => Number(x.weight)));
      const atMax = sets.filter((x) => Number(x.weight) === maxW);
      const key = e.name.trim().toLowerCase();
      if (!by.has(key)) by.set(key, { name: e.name.trim(), list: [] });
      by.get(key).list.push({ maxW, reps: Math.max(...atMax.map((x) => Number(x.reps))), minReps: Math.min(...sets.map((x) => Number(x.reps))) });
    }
  }
  const tips = [];
  for (const { name, list } of by.values()) {
    const last = list[list.length - 1];
    const lower = LEGS.includes(info(name)?.muscle);
    const step = lower ? 5 : 2.5;
    const three = list.slice(-3);
    if (three.length === 3 && three.every((x) => x.maxW === last.maxW) && last.reps <= three[0].reps) {
      tips.push({ level: 'tip', text: `${name}: stuck at ${last.maxW} kg for 3 sessions. Try +${step} kg, one more set, or a deload week.` });
    } else if (last.minReps >= 12) {
      tips.push({ level: 'tip', text: `${name}: every set hit ${last.minReps}+ reps at ${last.maxW} kg. Go up to ${last.maxW + step} kg next time.` });
    }
  }
  return tips.slice(0, limit);
}

/**
 * Review of ONE session while it is being planned (or logged), with its place in the week.
 * o: { session, weekSessions (others that week, or null for a plan template), neighbors (sessions within +-3 days),
 *      goalKey, restSec, info, suggest }
 */
function assessSession(o) {
  const goal = GOALS[o.goalKey] || GOALS.general;
  const { session, info, suggest } = o;
  const st = muscleStats([session], info);
  const wk = o.weekSessions ? muscleStats([...o.weekSessions, session], info) : null;
  const planned = session.status === 'planned';
  const exercises = (session.exercises || []).filter((e) => e.sets.some((x) => countSet(x, planned)));
  const sets = exercises.reduce((n, e) => n + e.sets.filter((x) => countSet(x, planned)).length, 0);
  const volume = Object.values(st.volume).reduce((a, b) => a + b, 0);
  const estMin = sets ? Math.round((sets * (0.75 + (o.restSec || 90) / 60) + 5) / 5) * 5 : 0;
  const rows = Object.keys(st.sets).map((m) => {
    const base = MAJOR.includes(m) ? goal.major : goal.minor;
    const n = st.sets[m];
    return {
      muscle: m, sets: n, volume: st.volume[m] || 0, status: n < SESSION_SETS[0] ? 'light' : n > SESSION_SETS[1] ? 'high' : 'ok',
      week: wk ? wk.sets[m] || 0 : null, min: base[0], max: base[1],
    };
  }).sort((a, b) => b.sets - a.sets);

  const f = [];
  const add = (level, text, adds) => f.push({ level, text, add: adds || [] });
  const used = exercises.map((e) => e.name);
  const covered = new Set(); // muscles already handled by a 'missing from this session' tip
  const isLifting = session.type !== 'sport';

  if (isLifting && sets > 0) {
    if (sets > 24 || estMin > 90) add('warn', `${sets} sets is about ${estMin} min. Sessions much past 75-90 min usually cost more recovery than they give back. Consider splitting it.`);
    else if (sets < 8 && session.type !== 'sport') add('tip', `Only ${sets} sets (~${estMin} min). Fine for a short day, but 12-20 sets is a more typical session.`);
    for (const r of rows.filter((x) => x.status === 'high')) add('warn', `${r.muscle}: ${r.sets} sets in one session. Beyond ~${SESSION_SETS[1]} hard sets the extra reps add little; spread them over another day.`);
    for (const [g, list] of Object.entries(GROUPS)) {
      const present = list.filter((m) => st.sets[m]);
      const missing = list.filter((m) => !st.sets[m] && m !== 'Forearms' && !(g === 'Legs' && m === 'Calves'));
      if (present.length >= 2 && missing.length) {
        add('tip', `${g} session is missing ${missing.join(' and ')}. Add a little to round it out.`,
          missing.flatMap((m) => suggest(m, 1, used)));
        missing.forEach((m) => covered.add(m));
      }
    }
  }
  // week gaps: only meaningful when planning inside a week
  if (wk && isLifting) {
    const touched = new Set(Object.keys(st.sets).flatMap((m) => Object.entries(GROUPS).filter(([, l]) => l.includes(m)).map(([g]) => g)));
    const sameGroup = (m) => Object.entries(GROUPS).some(([g, l]) => touched.has(g) && l.includes(m));
    const gaps = MAJOR.map((m) => ({ m, have: wk.sets[m] || 0, min: goal.major[0], max: goal.major[1] }))
      .filter((x) => x.have < x.min && !covered.has(x.m)).sort((a, b) => a.have / a.min - b.have / b.min);
    // gaps in the muscles this session already targets can be fixed right here; the rest need their own session
    for (const g of gaps.filter((x) => sameGroup(x.m)).slice(0, 2)) {
      add('tip', `This week ${g.m} has ${g.have} of ${g.min}-${g.max} sets (including this session). Add ${Math.min(4, g.min - g.have)} more if it fits.`, suggest(g.m, 2, used));
    }
    for (const g of gaps.filter((x) => !sameGroup(x.m)).slice(0, 2)) {
      add('tip', `This week ${g.m} has ${g.have} of ${g.min}-${g.max} sets. Schedule a session for it.`);
    }
  }
  // load across neighbouring days
  const near = o.neighbors || [];
  const hardNear = near.filter((s) => s.intensity === 'Hard').length;
  if (session.intensity === 'Hard' && hardNear >= 2) add('warn', `${hardNear} other Hard sessions within 3 days. Consider making this one Moderate.`);
  else if (isLifting && session.intensity !== 'Hard' && hardNear === 0 && sets >= 10 && o.goalKey === 'muscle') add('tip', 'No Hard session within 3 days. You could push this one harder (heavier loads, closer to failure).');
  for (const c of recoveryClashes([...near.filter((s) => Math.abs(dayNum(s.date) - dayNum(session.date)) <= 1), session], info)) {
    if (st.sets[c.muscle] >= 6) add('warn', `${c.muscle} was also trained hard on a neighbouring day (${c.days.join(', ')}). Give it ~48 h, or lighten one of the sessions.`);
  }
  if (!f.length && (sets > 0 || !isLifting)) add('ok', 'Looks balanced for the week.');
  return { rows, findings: rank(f), totals: { exercises: exercises.length, sets, volume, estMin } };
}

if (typeof module !== 'undefined') module.exports = { assessPeriod, assessSession, overloadTips, muscleStats, GOALS, hrMaxFor };
