
import { ActivityLevel, WeightGoal } from './types';

export const ACTIVITY_LEVEL_OPTIONS = [
  { value: ActivityLevel.SEDENTARY, label: 'Sedentary (Office job, little exercise)' },
  { value: ActivityLevel.LIGHT, label: 'Light (Exercise 1-3 days/week)' },
  { value: ActivityLevel.MODERATE, label: 'Moderate (Exercise 3-5 days/week)' },
  { value: ActivityLevel.ACTIVE, label: 'Active (Exercise 6-7 days/week)' },
  { value: ActivityLevel.VERY_ACTIVE, label: 'Very Active (Hard exercise & physical job)' },
];

export const GOAL_OPTIONS = [
  { value: WeightGoal.LOSE_FAST, label: 'Lose 2 lbs/week (-1000 kcal)' },
  { value: WeightGoal.LOSE_ONE_HALF, label: 'Lose 1.5 lbs/week (-750 kcal)' },
  { value: WeightGoal.LOSE, label: 'Lose 1 lb/week (-500 kcal)' },
  { value: WeightGoal.LOSE_HALF, label: 'Lose 0.5 lb/week (-250 kcal)' },
  { value: WeightGoal.MAINTAIN, label: 'Maintain Weight' },
  { value: WeightGoal.GAIN, label: 'Gain 1 lb/week (+500 kcal)' },
  { value: WeightGoal.GAIN_FAST, label: 'Gain 2 lbs/week (+1000 kcal)' },
];

export const calculateTDEE = (
  age: number,
  gender: 'male' | 'female',
  weightLbs: number,
  heightFt: number,
  heightIn: number,
  activityLevel: string
): number => {
  // Convert Imperial to Metric for calculation
  const weightKg = weightLbs / 2.20462;
  const heightCm = ((heightFt * 12) + heightIn) * 2.54;

  // Mifflin-St Jeor Equation
  let bmr: number;
  if (gender === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }
  return Math.round(bmr * parseFloat(activityLevel));
};
