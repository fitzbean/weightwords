
import { GoogleGenAI, Type } from "@google/genai";
import { NutritionEstimate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const estimateNutrition = async (description: string): Promise<NutritionEstimate> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following meal description: "${description}". 
    Break it down into individual components (e.g., if it says 'eggs and toast', create separate entries for eggs and toast). 
    For each item, estimate calories and macros (Protein, Carbs, Fat in grams). 
    Return a structured JSON response.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Name of the specific food component' },
                calories: { type: Type.NUMBER, description: 'Estimated calories for this component' },
                protein: { type: Type.NUMBER, description: 'Protein in grams' },
                carbs: { type: Type.NUMBER, description: 'Carbs in grams' },
                fat: { type: Type.NUMBER, description: 'Fat in grams' },
              },
              required: ["name", "calories", "protein", "carbs", "fat"],
            }
          },
          totalCalories: { type: Type.NUMBER, description: 'Sum of all item calories' },
          confidence: { type: Type.NUMBER, description: 'Confidence level from 0 to 1' },
        },
        required: ["items", "totalCalories", "confidence"],
      },
    },
  });

  return JSON.parse(response.text);
};

export const getHealthAdvice = async (profile: any, recentLogs: any[]): Promise<string> => {
  const logsSummary = recentLogs.map(l => `${l.name} (${l.calories}kcal)`).join(', ');
  const prompt = `
    User Profile:
    - Age: ${profile.age}
    - Weight: ${profile.weightLbs} lbs
    - Height: ${profile.heightFt}'${profile.heightIn}"
    - Goal: ${profile.weightGoal}
    - Daily Target: ${profile.dailyCalorieTarget} kcal
    
    Recent Food: ${logsSummary}
    
    Provide a short, motivating 2-sentence piece of advice for this user's nutrition journey.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
  });

  return response.text || "Keep up the good work!";
};
