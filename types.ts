
export enum Gender {
  MALE = 'male',
  FEMALE = 'female'
}

export enum ActivityLevel {
  SEDENTARY = '1.2',
  LIGHT = '1.375',
  MODERATE = '1.55',
  ACTIVE = '1.725',
  VERY_ACTIVE = '1.9'
}

export enum WeightGoal {
  LOSE_FAST = '-1000',
  LOSE = '-500',
  MAINTAIN = '0',
  GAIN = '500',
  GAIN_FAST = '1000'
}

export interface UserProfile {
  age: number;
  gender: Gender;
  weightLbs: number; 
  heightFt: number;
  heightIn: number;
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
  dailyCalorieTarget: number;
  profileCompleted?: boolean;
  spouseId?: string;
  timezone?: string;
  isAdmin?: boolean;
}

export interface FoodEntry {
  id: string;
  timestamp: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodItemEstimate {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionEstimate {
  items: FoodItemEstimate[];
  totalCalories: number;
  confidence: number;
}

export interface FoodLog {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  description: string;
  date: Date;
  createdAt: Date;
  breakdown?: FoodItemEstimate[];
}

export interface FavoritedBreakdown {
  id: string;
  name: string;
  breakdown: FoodItemEstimate[];
  totalCalories: number;
  createdAt: number;
  userId?: string;
}

export interface ItemInsight {
  verdict: 'healthy' | 'moderate' | 'indulgent';
  summary: string;
  highlights: { text: string; isPositive: boolean }[];
  tip: string;
}

export interface WeighIn {
  id: string;
  userId: string;
  weightLbs: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}
