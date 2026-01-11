import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const { description, type, item, image, productImage, nutritionImage } = body;
    
    const ai = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') });
    
    if (type === 'nutrition') {
      // Check if this contains nutrition info already
      const hasNutritionNumbers = /\b\d+\s?(calories?|kcal|g|grams?|oz|lbs?|mg|mcg)\b/i.test(description);
      const hasNutritionTerms = /\b(calories|kcal|protein|carbs|fat|grams?)\b/i.test(description);
      
      // Use AI to detect if this is a branded product
      let isBrandedProduct = false;
      if (!hasNutritionNumbers && !hasNutritionTerms) {
        const brandCheck = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `Does this text contain a specific brand, restaurant, or store name? Answer only "yes" or "no".
          
Text: "${description}"

Examples:
- "burger" -> no (generic food)
- "Burger King fries" -> yes (restaurant name)
- "eggs and toast" -> no (generic food)
- "Starbucks latte" -> yes (brand name)
- "Trader Joe's cookies" -> yes (store name)
- "chicken salad" -> no (generic food)
- "99s Restaurant potato skins" -> yes (restaurant name)
- "Gatorade Zero" -> yes (brand name)`,
        });
        
        const brandAnswer = (brandCheck.text || '').toLowerCase().trim();
        isBrandedProduct = brandAnswer.includes('yes');
        console.log('Brand detection:', { description, brandAnswer, isBrandedProduct });
      }
      
      if (isBrandedProduct) {
        console.log('Triggering web search for product nutrition');
        // Use web search for product nutrition
        try {
          const webResponse = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: `Search for nutrition facts for: "${description}". 
            IMPORTANT: 
            - Find the official nutrition information from the manufacturer's website or reliable sources
            - Look for the specific product mentioned (e.g., "Gatorade Zero" has 0-10 calories depending on flavor)
            - If multiple variations exist, choose the most common/original version
            - Always verify the information matches the exact product name
            
            Return ONLY a valid JSON object (no markdown, no code blocks) with these fields:
            {
              "name": "Full product name",
              "calories": number,
              "protein": number,
              "carbs": number,
              "fat": number,
              "servingSize": "serving size description",
              "sourceUrl": "URL where you found this",
              "confidence": number between 0 and 1
            }`,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
          
          console.log('Web search raw response:', webResponse.text);
          // Extract JSON from response (may have markdown code blocks)
          let jsonText = webResponse.text || '';
          // Remove markdown code blocks if present
          jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const webResult = JSON.parse(jsonText);
          console.log('Web search parsed result:', webResult);
          
          // Convert to expected format
          const responseData = {
            items: [{
              name: webResult.name,
              calories: webResult.calories,
              protein: webResult.protein,
              carbs: webResult.carbs,
              fat: webResult.fat,
              source: 'web',
            }],
            totalCalories: webResult.calories,
            confidence: webResult.confidence,
            source: 'web',
            sourceUrl: webResult.sourceUrl,
            servingSize: webResult.servingSize,
          };
          console.log('Returning web search response:', responseData);
          return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        } catch (error) {
          console.error('Web search failed, falling back to estimation:', error);
          // Fall back to estimation if web search fails
        }
      } else {
        console.log('Not a branded product, skipping web search:', { hasNutritionNumbers, hasNutritionTerms, isBrandedProduct });
      }
      
      // Regular estimation for meals or when web search fails
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze the following meal description: "${description}". 
        Break it down into individual components (e.g., if it says 'eggs and toast', create separate entries for eggs and toast). 
        For each item, estimate calories and macros (Protein, Carbs, Fat in grams).
        
        IMPORTANT: Keep food names concise and clean:
        - Use title case (first letter capitalized)
        - Remove articles (a, an, the)
        - Remove unnecessary words (about, approximately, some, just, really)
        - Keep essential descriptors (e.g., "whole wheat", "grilled", "fried")
        - Include quantities if specified (e.g., "2 slices", "1 cup")
        - Maximum 4 words per item name
        - Examples: "2 Slices Bread" not "Two slices of bread", "Grilled Chicken" not "A piece of grilled chicken"
        
        Return a structured JSON response.`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Concise name of the food component (max 4 words, title case)' },
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

      const result = JSON.parse(response.text);
      result.source = 'estimated';
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    
    if (type === 'item-insight') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide a quick nutritional insight for: "${item.name}" (${item.calories} kcal, P: ${item.protein}g, C: ${item.carbs}g, F: ${item.fat}g).
        
        Give a brief, engaging summary that includes:
        1. A one-line verdict (is this generally healthy, moderate, or indulgent?)
        2. 2-3 key nutritional highlights (good or bad)
        3. A quick tip for making it healthier or pairing it well
        
        Keep it concise and friendly - max 3-4 sentences total.`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, description: 'One word: healthy, moderate, or indulgent' },
              summary: { type: Type.STRING, description: 'Brief 2-3 sentence nutritional insight' },
              highlights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: 'The highlight text' },
                    isPositive: { type: Type.BOOLEAN, description: 'True if this is a positive/good thing' },
                  },
                  required: ["text", "isPositive"],
                }
              },
              tip: { type: Type.STRING, description: 'Quick tip for improvement or pairing' },
            },
            required: ["verdict", "summary", "highlights", "tip"],
          },
        },
      });

      return new Response(JSON.stringify(JSON.parse(response.text)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'product-image') {
      // First, identify the brand/product from the image
      const brandResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image,
                },
              },
              {
                text: `Look at this product image and identify the brand and product name.
                
                Return ONLY the brand and product name, nothing else.
                Examples:
                - "Gatorade Zero Lemon Lime"
                - "Coca-Cola Classic"
                - "Starbucks Frappuccino Mocha"
                - "Doritos Nacho Cheese"
                
                If you cannot identify a specific branded product, return "unknown".`,
              },
            ],
          },
        ],
      });

      const productName = brandResponse.text?.trim() || 'unknown';
      console.log('Product identified from image:', productName);

      if (productName.toLowerCase() === 'unknown') {
        return new Response(JSON.stringify({ 
          error: 'Could not identify product from image',
          nutritionText: null 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // Now use web search to find nutrition info for this product
      try {
        const webResponse = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: `Search for nutrition facts for: "${productName}". 
          IMPORTANT: 
          - Find the official nutrition information from the manufacturer's website or reliable sources
          - Look for the specific product mentioned
          - If multiple variations exist, choose the most common/original version
          
          Return ONLY a valid JSON object (no markdown, no code blocks) with these fields:
          {
            "name": "Full product name",
            "calories": number,
            "protein": number,
            "carbs": number,
            "fat": number,
            "servingSize": "serving size description",
            "sourceUrl": "URL where you found this",
            "confidence": number between 0 and 1
          }`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        console.log('Web search raw response for image:', webResponse.text);
        let jsonText = webResponse.text || '';
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const webResult = JSON.parse(jsonText);

        const responseData = {
          items: [{
            name: webResult.name,
            calories: webResult.calories,
            protein: webResult.protein,
            carbs: webResult.carbs,
            fat: webResult.fat,
            source: 'web',
          }],
          totalCalories: webResult.calories,
          confidence: webResult.confidence,
          source: 'web',
          sourceUrl: webResult.sourceUrl,
          servingSize: webResult.servingSize,
        };

        return new Response(JSON.stringify(responseData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      } catch (error) {
        console.error('Web search failed for product image:', error);
        return new Response(JSON.stringify({ 
          error: 'Could not find nutrition info for this product',
          nutritionText: null 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
    }

    if (type === 'nutrition-label') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image,
                },
              },
              {
                text: `Look at this nutrition facts label image and extract the key nutrition information.

                IMPORTANT: Try to identify what product this is from any visible text, branding, or context in the image.
                
                Return a simple text description in this format:
                "[Product Name], [serving size], [calories] calories, [protein]g protein, [carbs]g carbs, [fat]g fat"
                
                Examples:
                - "Cheerios cereal, 1 cup (28g), 100 calories, 3g protein, 20g carbs, 2g fat"
                - "Coca-Cola, 12 fl oz can, 140 calories, 0g protein, 39g carbs, 0g fat"
                - "Greek yogurt, 1 container (150g), 120 calories, 15g protein, 8g carbs, 0g fat"
                
                If you cannot identify the product name, use a generic description based on what you can infer (e.g., "Granola bar", "Chips", "Soda").
                
                If you cannot read the label clearly at all, return null.`,
              },
            ],
          },
        ],
      });

      const nutritionText = response.text?.trim() || null;
      
      return new Response(JSON.stringify({ nutritionText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'nutrition-label-dual') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: productImage,
                },
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: nutritionImage,
                },
              },
              {
                text: `I'm showing you two images of a food product:
                1. The first image shows the FRONT of the product (brand name, product name, packaging)
                2. The second image shows the NUTRITION FACTS label
                
                Please identify the product and extract the nutrition information.
                
                Return a simple text description in this format:
                "[Product Name by Brand], [serving size], [calories] calories, [protein]g protein, [carbs]g carbs, [fat]g fat"
                
                Examples:
                - "Cheerios by General Mills, 1 cup (28g), 100 calories, 3g protein, 20g carbs, 2g fat"
                - "Coca-Cola Classic, 12 fl oz can, 140 calories, 0g protein, 39g carbs, 0g fat"
                - "Chobani Greek Yogurt Vanilla, 1 container (150g), 120 calories, 15g protein, 8g carbs, 0g fat"
                
                Be specific with the product name - include flavor, variety, or type if visible.
                
                If you cannot read either image clearly, return null.`,
              },
            ],
          },
        ],
      });

      const nutritionText = response.text?.trim() || null;
      
      return new Response(JSON.stringify({ nutritionText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'food-image') {
      // Estimate nutrition directly from food image
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image,
                },
              },
              {
                text: `Analyze this food image and estimate the nutrition information.

                IMPORTANT:
                - Identify all visible food items in the image
                - Estimate reasonable portion sizes based on what you see
                - Provide accurate calorie and macronutrient estimates
                - If multiple items are visible, break them down separately
                
                Return ONLY a valid JSON object (no markdown, no code blocks) with this structure:
                {
                  "items": [
                    {
                      "name": "Food item name with estimated portion",
                      "calories": number,
                      "protein": number (grams),
                      "carbs": number (grams),
                      "fat": number (grams)
                    }
                  ],
                  "totalCalories": number,
                  "confidence": number between 0 and 1
                }
                
                Example for a plate with chicken breast, rice, and broccoli:
                {
                  "items": [
                    {"name": "Grilled chicken breast, 6 oz", "calories": 280, "protein": 53, "carbs": 0, "fat": 6},
                    {"name": "White rice, 1 cup", "calories": 205, "protein": 4, "carbs": 45, "fat": 0},
                    {"name": "Steamed broccoli, 1 cup", "calories": 55, "protein": 4, "carbs": 11, "fat": 1}
                  ],
                  "totalCalories": 540,
                  "confidence": 0.8
                }`,
              },
            ],
          },
        ],
      });

      console.log('Food image analysis raw response:', response.text);
      let jsonText = response.text || '';
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const result = JSON.parse(jsonText);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'protein-suggestions') {
      const { currentProtein, targetProtein } = body;
      const proteinGap = targetProtein - currentProtein;
      
      // Get current hour in user's timezone
      const userHour = parseInt(new Intl.DateTimeFormat('en-US', { 
        timeZone: body.timezone || 'America/Los_Angeles',
        hour: 'numeric',
        hour12: false 
      }).format(new Date()));
      const hoursLeft = 24 - userHour;
      
      const prompt = `The user has consumed ${currentProtein}g of protein today and needs ${targetProtein}g total (${proteinGap}g more). 
        
        There are approximately ${hoursLeft} hours left in the day.
        
        Make time-of-day-appropriate suggestions. 

        Before 9am, suggest breakfast or snack options.
        After 9am, suggest lunch or snack options.
        After 12pm, suggest dinner or snack options.
        After 6pm, suggest late-night or snack options.

        Don't preface suggestions with "Breakfast:", "Lunch:", "Dinner:", or "Snack:".

        Generate 1 SHORT, actionable one-liner suggestions (max 10 words each).
        
        50% of the time, suggest a meal option.
        50% of the time, suggest a snack option.
        Return ONLY a valid JSON array of strings (no markdown, no code blocks):
        ["suggestion 1"]

        Examples:
        ["Add Greek yogurt (20g protein)"]`;
        
      console.log('Protein suggestions prompt:', prompt);
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      let jsonText = response.text || '';
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const suggestions = JSON.parse(jsonText);

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'protein-suggestion-detail') {
      const { suggestion } = body;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide detailed information about this protein suggestion: "${suggestion}"
        
        Give an engaging, informative breakdown that includes:
        1. A brief summary of why this is a good protein choice
        2. 2-4 key highlights (nutritional benefits, preparation ease, taste, etc.)
        3. A practical tip for incorporating it into their day
        
        Keep it concise and actionable.`,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: 'Brief 2-3 sentence explanation of why this is a good protein choice' },
              highlights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: 'The highlight text' },
                    isPositive: { type: Type.BOOLEAN, description: 'True if this is a positive/good thing (should almost always be true for protein suggestions)' },
                  },
                  required: ["text", "isPositive"],
                }
              },
              tip: { type: Type.STRING, description: 'Quick practical tip for incorporating this protein into their day' },
            },
            required: ["summary", "highlights", "tip"],
          },
        },
      });

      const result = JSON.parse(response.text);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (type === 'advice') {
      const { profile, recentLogs } = body;
      const logsSummary = recentLogs.map((l: any) => `${l.name} (${l.calories}kcal)`).join(', ');
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

      return new Response(JSON.stringify({ advice: response.text || "Keep up the good work!" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    throw new Error('Invalid request type');
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
