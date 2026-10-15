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
    ['Elliptical', 'Machine'], ['Stair Climber', 'Machine'], ['Jump Rope', 'Other'],
  ],
};

const LIBRARY_FLAT = Object.entries(LIBRARY).flatMap(([muscle, list]) => list.map(([name, equip]) => ({ name, muscle, equip })));
