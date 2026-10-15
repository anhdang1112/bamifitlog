// Run: node tests/tags.test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const src = ['exercises.js', 'tags.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const T = vm.runInNewContext(src + '\n({ sessionTag, LIBRARY_FLAT })', { module: undefined });
const info = (n) => T.LIBRARY_FLAT.find((x) => x.name.toLowerCase() === n.toLowerCase());
const ex = (...names) => names.map((name) => ({ name, sets: [{ reps: 8, weight: 50 }] }));
const tag = (s) => T.sessionTag({ type: 'free', name: '', exercises: [], ...s }, info);

assert.strictEqual(tag({ tag: 'Cardio', name: 'Push Day' }), 'Cardio', 'manual tag wins');
assert.strictEqual(tag({ type: 'sport', sport: 'Pickleball' }), 'Pickleball');
assert.strictEqual(tag({ type: 'sport', sport: 'Running' }), 'Cardio');
assert.strictEqual(tag({ type: 'sport', sport: 'Tennis' }), 'Sport');
assert.strictEqual(tag({ name: 'Push Day' }), 'Push');
assert.strictEqual(tag({ name: 'Leg day' }), 'Legs');
assert.strictEqual(tag({ name: 'Upper A' }), 'Upper');
assert.strictEqual(tag({ name: 'Lower body' }), 'Lower');
assert.strictEqual(tag({ name: 'Treadmill cardio' }), 'Cardio');
assert.strictEqual(tag({ name: 'Chest day', exercises: ex('Bench Press', 'Overhead Press', 'Triceps Pushdown') }), 'Push', 'from muscles');
assert.strictEqual(tag({ exercises: ex('Barbell Row', 'Barbell Curl') }), 'Pull');
assert.strictEqual(tag({ exercises: ex('Bench Press', 'Barbell Row') }), 'Upper');
assert.strictEqual(tag({ exercises: ex('Squat', 'Romanian Deadlift') }), 'Legs');
assert.strictEqual(tag({ exercises: ex('Squat', 'Plank') }), 'Lower');
assert.strictEqual(tag({ exercises: ex('Squat', 'Bench Press') }), 'Full body');
assert.strictEqual(tag({ exercises: ex('Treadmill Run') }), 'Cardio');
assert.strictEqual(tag({ name: 'Mystery' }), 'Workout');
console.log('tags tests passed');
