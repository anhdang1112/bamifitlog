// Run: node tests/starter.test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const src = ['exercises.js', 'coach.js', 'tags.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const S = vm.runInNewContext(src + '\n({ STARTER_ROUTINES, LIBRARY_FLAT, assessPeriod, sessionTag })', { module: undefined });
const info = (n) => S.LIBRARY_FLAT.find((x) => x.name.toLowerCase() === n.toLowerCase());

// every exercise exists in the library, and each routine gets the icon of its own name
for (const r of S.STARTER_ROUTINES) {
  for (const [name] of r.ex) assert(info(name), `${r.name}: "${name}" is not in the library`);
  const sess = { type: 'plan', name: r.name, exercises: r.ex.map(([name, k]) => ({ name, sets: Array(k).fill({ reps: 8, weight: '' }) })) };
  assert.strictEqual(S.sessionTag(sess, info), r.name, `${r.name} icon`);
  const noName = S.sessionTag({ ...sess, name: '' }, info);
  assert(noName === r.name || r.name === 'Lower' || r.name === 'Upper' || r.name === 'Legs', `${r.name} derives ${noName}`);
}
// the five routines together make a week with no warnings for the general goal
const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-16', '2026-10-17'];
const sessions = S.STARTER_ROUTINES.map((r, i) => ({
  id: r.name, date: days[i], status: 'planned', type: 'plan', name: r.name, intensity: 'Moderate', durationMin: 60,
  exercises: r.ex.map(([name, k, reps]) => ({ name, sets: Array.from({ length: k }, () => ({ reps, weight: '' })) })),
}));
const r = S.assessPeriod({ sessions, goalKey: 'general', weeklyGoal: 5, age: 30, weeks: 1, frac: 1, basis: 'plan', info, suggest: () => [] });
assert(!r.findings.some((f) => f.level !== 'ok'), 'starter week should be balanced: ' + r.findings.map((f) => f.text).join(' / '));
for (const row of r.rows.filter((x) => ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps'].includes(x.muscle))) {
  assert(row.sets >= row.min && row.sets <= row.max * 1.15, `${row.muscle} ${row.sets} outside ${row.min}-${row.max}`);
}
console.log('starter tests passed');
