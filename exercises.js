'use strict';
/* Built-in exercise library: muscle group -> [name, equipment]. Custom exercises are stored in the app data. */

const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Forearms', 'Full Body', 'Cardio'];

const LIBRARY = {
  Chest: [
    ['Bench Press', 'Barbell'], ['Incline Bench Press', 'Barbell'], ['Decline Bench Press', 'Barbell'],
    ['Dumbbell Bench Press', 'Dumbbell'], ['Incline Dumbbell Press', 'Dumbbell'], ['Dumbbell Fly', 'Dumbbell'],
    ['Cable Fly', 'Cable'], ['Low Cable Fly', 'Cable'], ['Pec Deck', 'Machine'], ['Chest Press Machine', 'Machine'],
    ['Push-up', 'Bodyweight'], ['Chest Dip', 'Bodyweight'],
  ],
  Back: [
    ['Deadlift', 'Barbell'], ['Rack Pull', 'Barbell'], ['Barbell Row', 'Barbell'], ['Pendlay Row', 'Barbell'],
    ['Dumbbell Row', 'Dumbbell'], ['Pull-up', 'Bodyweight'], ['Chin-up', 'Bodyweight'], ['Lat Pulldown', 'Cable'],
    ['Seated Cable Row', 'Cable'], ['Straight Arm Pulldown', 'Cable'], ['Face Pull', 'Cable'], ['T-Bar Row', 'Machine'],
    ['Machine Row', 'Machine'], ['Back Extension', 'Bodyweight'],
  ],
  Shoulders: [
    ['Overhead Press', 'Barbell'], ['Dumbbell Shoulder Press', 'Dumbbell'], ['Arnold Press', 'Dumbbell'],
    ['Machine Shoulder Press', 'Machine'], ['Lateral Raise', 'Dumbbell'], ['Cable Lateral Raise', 'Cable'],
    ['Front Raise', 'Dumbbell'], ['Rear Delt Fly', 'Dumbbell'], ['Reverse Pec Deck', 'Machine'],
    ['Upright Row', 'Barbell'], ['Dumbbell Shrug', 'Dumbbell'], ['Barbell Shrug', 'Barbell'],
  ],
  Biceps: [
    ['Barbell Curl', 'Barbell'], ['EZ-Bar Curl', 'Barbell'], ['Dumbbell Curl', 'Dumbbell'], ['Hammer Curl', 'Dumbbell'],
    ['Incline Dumbbell Curl', 'Dumbbell'], ['Preacher Curl', 'Barbell'], ['Cable Curl', 'Cable'], ['Concentration Curl', 'Dumbbell'],
  ],
  Triceps: [
    ['Triceps Pushdown', 'Cable'], ['Rope Pushdown', 'Cable'], ['Overhead Triceps Extension', 'Dumbbell'],
    ['Skull Crusher', 'Barbell'], ['Close-Grip Bench Press', 'Barbell'], ['Triceps Dip', 'Bodyweight'],
    ['Bench Dip', 'Bodyweight'], ['Triceps Kickback', 'Dumbbell'],
  ],
  Quads: [
    ['Squat', 'Barbell'], ['Front Squat', 'Barbell'], ['Goblet Squat', 'Dumbbell'], ['Leg Press', 'Machine'],
    ['Leg Extension', 'Machine'], ['Hack Squat', 'Machine'], ['Smith Machine Squat', 'Machine'],
    ['Bulgarian Split Squat', 'Dumbbell'], ['Lunge', 'Dumbbell'], ['Walking Lunge', 'Dumbbell'], ['Step-up', 'Dumbbell'],
    ['Bodyweight Squat', 'Bodyweight'],
  ],
  Hamstrings: [
    ['Romanian Deadlift', 'Barbell'], ['Stiff-Leg Deadlift', 'Barbell'], ['Dumbbell Romanian Deadlift', 'Dumbbell'],
    ['Lying Leg Curl', 'Machine'], ['Seated Leg Curl', 'Machine'], ['Good Morning', 'Barbell'], ['Nordic Curl', 'Bodyweight'],
  ],
  Glutes: [
    ['Hip Thrust', 'Barbell'], ['Glute Bridge', 'Bodyweight'], ['Sumo Deadlift', 'Barbell'], ['Cable Kickback', 'Cable'],
    ['Hip Abduction Machine', 'Machine'], ['Banded Lateral Walk', 'Band'],
  ],
  Calves: [
    ['Standing Calf Raise', 'Machine'], ['Seated Calf Raise', 'Machine'], ['Donkey Calf Raise', 'Machine'],
    ['Bodyweight Calf Raise', 'Bodyweight'],
    ['Leg Press Calf Raise', 'Machine'],
  ],
  Core: [
    ['Plank', 'Bodyweight'], ['Side Plank', 'Bodyweight'], ['Crunch', 'Bodyweight'], ['Sit-up', 'Bodyweight'],
    ['Bicycle Crunch', 'Bodyweight'], ['Cable Crunch', 'Cable'], ['Hanging Leg Raise', 'Bodyweight'],
    ['Russian Twist', 'Bodyweight'], ['Ab Wheel Rollout', 'Other'], ['Mountain Climber', 'Bodyweight'],
    ['Dead Bug', 'Bodyweight'], ['Pallof Press', 'Cable'],
  ],
  Forearms: [
    ['Wrist Curl', 'Dumbbell'], ['Reverse Wrist Curl', 'Dumbbell'], ['Reverse Curl', 'Barbell'], ["Farmer's Walk", 'Dumbbell'],
  ],
  'Full Body': [
    ['Clean and Press', 'Barbell'], ['Power Clean', 'Barbell'], ['Snatch', 'Barbell'], ['Thruster', 'Barbell'],
    ['Kettlebell Swing', 'Kettlebell'], ['Turkish Get-up', 'Kettlebell'], ['Burpee', 'Bodyweight'], ['Battle Ropes', 'Other'],
  ],
  Cardio: [
    ['Treadmill Run', 'Machine'], ['Stationary Bike', 'Machine'], ['Assault Bike', 'Machine'], ['Rowing Machine', 'Machine'],
    ['Treadmill Walk', 'Machine'], ['Incline Treadmill Walk', 'Machine'],
    ['Elliptical', 'Machine'], ['Stair Climber', 'Machine'], ['Jump Rope', 'Other'],
  ],
};

const LIBRARY_FLAT = Object.entries(LIBRARY).flatMap(([muscle, list]) => list.map(([name, equip]) => ({ name, muscle, equip })));

/*
 * Starter routines, built for a small private gym: dumbbells, a barbell + rack, a pull-up/dip + cable station,
 * lat pulldown, leg press, a leg extension / lying leg curl machine, a back-extension bench and a treadmill.
 * Each is [exercise, sets, reps]. Together they make a balanced 5-day week (checked in tests/starter.test.js).
 */
const STARTER_ROUTINES = [
  { name: 'Push', ex: [['Dumbbell Bench Press', 4, 8], ['Overhead Press', 3, 8], ['Incline Dumbbell Press', 3, 10], ['Lateral Raise', 3, 15], ['Triceps Pushdown', 3, 12], ['Overhead Triceps Extension', 3, 12]] },
  { name: 'Pull', ex: [['Pull-up', 3, 6], ['Barbell Row', 3, 8], ['Lat Pulldown', 3, 10], ['Face Pull', 2, 15], ['Barbell Curl', 3, 10], ['Hammer Curl', 3, 12]] },
  { name: 'Legs', ex: [['Squat', 4, 8], ['Leg Press', 3, 10], ['Romanian Deadlift', 3, 8], ['Lying Leg Curl', 3, 12], ['Hip Thrust', 4, 10], ['Leg Press Calf Raise', 4, 12]] },
  { name: 'Upper', ex: [['Dumbbell Bench Press', 3, 8], ['Barbell Row', 2, 8], ['Dumbbell Shoulder Press', 3, 10], ['Lat Pulldown', 2, 10], ['Lateral Raise', 2, 15], ['Triceps Pushdown', 2, 12], ['Dumbbell Curl', 2, 12]] },
  { name: 'Lower', ex: [['Squat', 3, 8], ['Leg Extension', 3, 12], ['Romanian Deadlift', 3, 8], ['Hip Thrust', 4, 10], ['Back Extension', 2, 12], ['Hanging Leg Raise', 3, 12]] },
];
