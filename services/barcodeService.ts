// Open Food Facts API integration for barcode nutrition lookup

export interface BarcodeProduct {
  code: string;
  product_name: string;
  brands: string;
  nutriments: {
    energy_kcal_100g: number;
    proteins_100g: number;
    carbohydrates_100g: number;
    fat_100g: number;
    fiber_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
  };
  serving_size?: string;
  image_url?: string;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  try {
    // Open Food Facts API - free, no API key required
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_size,image_url`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.status === 0 || !data.product) {
      return null;
    }

    const product = data.product;

    return {
      code: barcode,
      product_name: product.product_name || 'Unknown Product',
      brands: product.brands || '',
      nutriments: {
        energy_kcal_100g: product.nutriments?.['energy-kcal_100g'] || 0,
        proteins_100g: product.nutriments?.proteins_100g || 0,
        carbohydrates_100g: product.nutriments?.carbohydrates_100g || 0,
        fat_100g: product.nutriments?.fat_100g || 0,
        fiber_100g: product.nutriments?.fiber_100g,
        sugars_100g: product.nutriments?.sugars_100g,
        sodium_100g: product.nutriments?.sodium_100g,
      },
      serving_size: product.serving_size,
      image_url: product.image_url,
    };
  } catch (error) {
    console.error('Barcode lookup error:', error);
    return null;
  }
}

// Format nutrition data for our app
export function formatBarcodeNutrition(product: BarcodeProduct): string {
  const { product_name, brands, nutriments } = product;
  
  let description = product_name;
  if (brands) {
    description += ` (${brands})`;
  }

  description += `\n\nNutrition per 100g:`;
  description += `\nCalories: ${nutriments.energy_kcal_100g}kcal`;
  description += `\nProtein: ${nutriments.proteins_100g}g`;
  description += `\nCarbs: ${nutriments.carbohydrates_100g}g`;
  description += `\nFat: ${nutriments.fat_100g}g`;

  if (nutriments.fiber_100g) {
    description += `\nFiber: ${nutriments.fiber_100g}g`;
  }

  return description;
}
