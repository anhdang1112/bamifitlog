// Run: node tests/coach.test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const src = ['exercises.js', 'coach.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const C = vm.runInNewContext(src + '\n({ assessPeriod, assessSession, overloadTips, LIBRARY_FLAT })', { module: undefined });

const info = (n) => C.LIBRARY_FLAT.find((x) => x.name.toLowerCase() === n.toLowerCase());
const suggest = (m, n, ex) => C.LIBRARY_FLAT.filter((x) => x.muscle === m && !ex.includes(x.name)).slice(0, n).map((x) => x.name);
const sets = (n, reps, weight) => Array.from({ length: n }, () => ({ reps, weight, done: true }));
const sess = (date, exs, extra = {}) => ({ id: date + Math.random(), date, status: 'done', type: 'plan', intensity: 'Moderate', durationMin: 60, exercises: exs, ...extra });
const week = (sessions, extra = {}) => C.assessPeriod({ sessions, goalKey: 'muscle', weeklyGoal: 4, age: 30, weeks: 1, frac: 1, basis: 'actual', info, suggest, ...extra });
const has = (res, re) => res.findings.some((f) => re.test(f.text));

// 1) chest-only week: back missing, push/pull imbalance, chest above ceiling
let r = week([sess('2026-10-12', [{ name: 'Bench Press', sets: sets(12, 8, 60) }]), sess('2026-10-14', [{ name: 'Incline Dumbbell Press', sets: sets(12, 10, 20) }])]);
assert(has(r, /Back: no sets/), 'flags missing back');
assert(has(r, /Chest: 24 sets is above/), 'flags chest ceiling');
assert(r.findings.find((f) => /Back: no sets/.test(f.text)).add.length === 2, 'suggests 2 back exercises');
assert.strictEqual(r.findings[0].level, 'warn', 'warnings sort first');

// 2) balanced week is OK
const bal = (d, name, m) => sess(d, [{ name, sets: sets(m, 10, 40) }]);
r = week([bal('2026-10-12', 'Bench Press', 10), bal('2026-10-13', 'Barbell Row', 10), bal('2026-10-14', 'Squat', 10), bal('2026-10-16', 'Overhead Press', 10), bal('2026-10-17', 'Romanian Deadlift', 10), bal('2026-10-18', 'Hip Thrust', 10), bal('2026-10-19', 'Barbell Curl', 10), bal('2026-10-20', 'Triceps Pushdown', 10)], { weeks: 1 });
assert(!has(r, /no sets/), 'no missing muscles in a balanced week');

// 3) recovery clash: chest 6+ sets on consecutive days
r = week([sess('2026-10-12', [{ name: 'Bench Press', sets: sets(6, 8, 60) }]), sess('2026-10-13', [{ name: 'Incline Dumbbell Press', sets: sets(6, 8, 20) }])]);
assert(has(r, /Chest is trained hard on Mon and Tue/), 'flags back-to-back chest');

// 4) pace: mid-week with 40% elapsed is not "none" for a muscle with 0 sets only if min*frac is 0; low status otherwise
r = week([sess('2026-10-12', [{ name: 'Bench Press', sets: sets(6, 8, 60) }])], { frac: 3 / 7 });
assert(has(r, /Chest: 6 of 10-20/) === false, 'chest 6 >= 10*3/7 so on pace');
assert(has(r, /Back: no sets logged yet/), 'back behind pace uses "yet"');

// 5) planned sessions count every set row, even blank ones
const planned = sess('2026-10-12', [{ name: 'Bench Press', sets: [{ reps: '', weight: '' }, { reps: '', weight: '' }, { reps: '', weight: '' }] }], { status: 'planned' });
r = week([planned], { basis: 'plan' });
assert.strictEqual(r.rows.find((x) => x.muscle === 'Chest').sets, 3, 'blank planned rows count');
const unticked = sess('2026-10-12', [{ name: 'Bench Press', sets: [{ reps: 8, weight: 60, done: false }, { reps: '', weight: '' }] }]);
assert.strictEqual(week([unticked]).rows.find((x) => x.muscle === 'Chest').sets, 0, 'finished sessions ignore unticked/blank sets');

// 6) session assessment: push day without triceps, with week gaps
const push = sess('2026-10-14', [{ name: 'Bench Press', sets: sets(4, 8, 60) }, { name: 'Overhead Press', sets: sets(3, 8, 30) }], { status: 'planned' });
let a = C.assessSession({ session: push, weekSessions: [], neighbors: [], goalKey: 'muscle', restSec: 90, info, suggest });
assert(a.findings.some((f) => /Push session is missing Triceps/.test(f.text) && f.add.length === 1), 'push day missing triceps');
assert(a.findings.some((f) => /This week Back has 0 of 10-20/.test(f.text)), 'week gap for back');
assert.strictEqual(a.totals.sets, 7);
assert(a.totals.estMin >= 20 && a.totals.estMin <= 30, 'estimated minutes plausible: ' + a.totals.estMin);
assert.strictEqual(a.rows[0].muscle, 'Chest');

// 7) overloaded single session
const big = sess('2026-10-14', [{ name: 'Bench Press', sets: sets(14, 8, 60) }], { status: 'planned' });
a = C.assessSession({ session: big, weekSessions: null, neighbors: [], goalKey: 'muscle', restSec: 90, info, suggest });
assert(a.findings.some((f) => /Chest: 14 sets in one session/.test(f.text)), 'too many sets for one muscle');

// 8) overload tips
const h = ['2026-09-01', '2026-09-08', '2026-09-15'].map((d) => sess(d, [{ name: 'Bench Press', sets: sets(3, 8, 60) }]));
assert(C.overloadTips(h, info).some((t) => /stuck at 60 kg/.test(t.text)), 'stagnation detected');
const ready = [sess('2026-09-01', [{ name: 'Squat', sets: sets(3, 12, 80) }])];
assert(C.overloadTips(ready, info).some((t) => /Go up to 85 kg/.test(t.text)), 'legs step 5 kg');
console.log('coach tests passed');
