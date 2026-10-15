'use strict';
/* Session tags: the icon + colour that identify a workout (Push, Pull, Legs, ...) on the calendar. Pure functions. */

const TAGS = {
  Push: { color: '#ff6b4a', svg: '<path d="M3 12h13M12 6l6 6-6 6M21 4v16"/>' },
  Pull: { color: '#4aa3ff', svg: '<path d="M21 12H8M12 6l-6 6 6 6M3 4v16"/>' },
  Legs: { color: '#3fb950', svg: '<path d="M9 3h6l1 8-1 10M9 3L8 11l1 10M8 11h8"/>' },
  Upper: { color: '#b388ff', svg: '<circle cx="12" cy="7" r="3.2"/><path d="M4.5 20v-3a4 4 0 0 1 4-4h7a4 4 0 0 1 4 4v3"/>' },
  Lower: { color: '#2dd4bf', svg: '<path d="M5 18h10a4 4 0 0 0 4-4v-1l-4-1.5-1.5-5H8.5V14H5z"/>' },
  'Full body': { color: '#e5e7eb', svg: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>' },
  Cardio: { color: '#ff4d79', svg: '<path d="M2 12h4l2.5-6 4 12 2.5-6H22"/>' },
  Pickleball: { color: '#ffd23d', svg: '<ellipse cx="9.5" cy="9.5" rx="5.5" ry="6.5" transform="rotate(-40 9.5 9.5)"/><path d="M13.5 14.5L20 21"/><circle cx="19" cy="6" r="2.4"/>' },
  Sport: { color: '#9aa0ff', svg: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3.5 3.5 3.5 13.5 0 17"/>' },
  Workout: { color: '#8d8d9a', svg: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>' },
};
/** Tags a person can pick by hand (Sport / Workout are only ever automatic fallbacks). */
const PICK_TAGS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full body', 'Cardio', 'Pickleball'];
const CARDIO_SPORTS = ['Running', 'Cycling', 'Swimming', 'HIIT', 'Walking', 'Hiking'];
const PUSH_M = ['Chest', 'Shoulders', 'Triceps'];
const PULL_M = ['Back', 'Biceps', 'Forearms'];
const LEG_M = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];

function tagFromName(name) {
  const n = (name || '').toLowerCase();
  if (/\bpush/.test(n)) return 'Push';
  if (/\bpull/.test(n)) return 'Pull';
  if (/\blegs?\b|\bquad/.test(n)) return 'Legs';
  if (/\bupper/.test(n)) return 'Upper';
  if (/\blower/.test(n)) return 'Lower';
  if (/full[ -]?body/.test(n)) return 'Full body';
  if (/pickle/.test(n)) return 'Pickleball';
  if (/cardio|\bhiit|\brun/.test(n)) return 'Cardio';
  return '';
}

/** Which kind of day the exercises add up to. */
function tagFromExercises(exercises, info) {
  const muscles = new Set((exercises || []).filter((e) => e.sets && e.sets.length).map((e) => info(e.name)?.muscle).filter(Boolean));
  if (!muscles.size) return '';
  const has = (list) => list.some((m) => muscles.has(m));
  const push = has(PUSH_M), pull = has(PULL_M), legs = has(LEG_M);
  if (muscles.has('Full Body') || (legs && (push || pull))) return 'Full body';
  if (muscles.size === 1 && muscles.has('Cardio')) return 'Cardio';
  if (push && pull) return 'Upper';
  if (push) return 'Push';
  if (pull) return 'Pull';
  if (legs) return muscles.has('Core') ? 'Lower' : 'Legs';
  return '';
}

/** Manual tag first, then sport, then the name ("Push Day"), then what the exercises are. */
function sessionTag(s, info) {
  if (s.tag && TAGS[s.tag]) return s.tag;
  if (s.type === 'sport') return s.sport === 'Pickleball' ? 'Pickleball' : CARDIO_SPORTS.includes(s.sport) ? 'Cardio' : 'Sport';
  return tagFromName(s.name) || tagFromExercises(s.exercises, info) || 'Workout';
}

const tagSvg = (tag, cls = 'tg') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${(TAGS[tag] || TAGS.Workout).svg}</svg>`;

if (typeof module !== 'undefined') module.exports = { sessionTag, tagFromName, tagFromExercises, TAGS };
