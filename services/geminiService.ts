
import { NutritionEstimate } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export const estimateNutrition = async (description: string): Promise<NutritionEstimate> => {
  const response = await fetch(`${supabaseUrl}/functions/v1/nutrition-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ description, type: 'nutrition' }),
  });

  if (!response.ok) {
    throw new Error('Failed to estimate nutrition');
  }

  return await response.json();
};

export const getHealthAdvice = async (profile: any, recentLogs: any[]): Promise<string> => {
  const response = await fetch(`${supabaseUrl}/functions/v1/nutrition-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ profile, recentLogs, type: 'advice' }),
  });

  if (!response.ok) {
    throw new Error('Failed to get health advice');
  }

  const data = await response.json();
  return data.advice || "Keep up the good work!";
};
