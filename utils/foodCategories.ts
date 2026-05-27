import { FoodItemEstimate, FavoritedBreakdown } from '../types';

export type FoodCategory = 'drinks' | 'snacks' | 'meals' | 'booze' | 'other';

export interface CategoryInfo {
  key: FoodCategory;
  label: string;
  emoji: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { key: 'meals', label: 'Meals', emoji: '🍽️' },
  { key: 'snacks', label: 'Snacks', emoji: '🍿' },
  { key: 'drinks', label: 'Drinks', emoji: '🥤' },
  { key: 'booze', label: 'Booze', emoji: '🍺' },
  { key: 'other', label: 'Other', emoji: '📦' },
];

const KEYWORD_MAP: Record<FoodCategory, string[]> = {
  drinks: [
    'coffee', 'latte', 'espresso', 'cappuccino', 'americano', 'mocha',
    'tea', 'chai', 'matcha', 'green tea', 'black tea', 'iced tea',
    'smoothie', 'shake', 'milkshake', 'protein shake',
    'soda', 'coke', 'pepsi', 'sprite', 'fanta', 'cola', 'pop',
    'juice', 'lemonade', 'orange juice', 'apple juice',
    'water', 'sparkling water', 'seltzer', 'tonic',
    'hot chocolate', 'cocoa',
    'milk', 'almond milk', 'oat milk', 'soy milk',
    'gatorade', 'powerade', 'electrolyte',
    'coconut water', 'kombucha',
  ],
  snacks: [
    'chips', 'crisps', 'tortilla chips', 'potato chips', 'doritos',
    'nuts', 'almonds', 'cashews', 'peanuts', 'trail mix',
    'cookie', 'cookies', 'biscuit',
    'candy', 'chocolate', 'm&ms', 'snickers', 'kitkat', 'reese',
    'crackers', 'pretzels', 'goldfish', 'cheez-it',
    'popcorn', 'popcorn',
    'granola bar', 'protein bar', 'kind bar', 'clif bar', 'luna bar',
    'fruit snack', 'gummy', 'gummies',
    'rice cake', 'rice cakes', 'stick', 'string cheese', 'hard boiled egg',
    'beef jerky', 'jerky',
    'yogurt', 'greek yogurt', 'cottage cheese',
    'ice cream', 'gelato', 'frozen yogurt', 'slice',
    'muffin', 'donut', 'doughnut', 'pastry', 'croissant',
    'toast', 'bagel', 'cereal', 'granola', 'oatmeal',
  ],
  meals: [
    'chicken', 'steak', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'sausage',
    'burger', 'hamburger', 'cheeseburger',
    'pizza', 'slice',
    'pasta', 'spaghetti', 'lasagna', 'fettuccine', 'penne', 'mac and cheese', 'macaroni',
    'rice', 'fried rice', 'risotto',
    'salad', 'caesar salad', 'greek salad', 'cobb salad',
    'taco', 'tacos', 'burrito', 'quesadilla', 'enchilada', 'nachos',
    'sandwich', 'wrap', 'panini', 'sub', 'hoagie',
    'soup', 'chili', 'stew', 'ramen', 'pho',
    'fish', 'salmon', 'tuna', 'shrimp', 'cod', 'tilapia',
    'curry', 'stir fry', 'stir-fry',
    'egg', 'eggs', 'omelette', 'scrambled eggs',
    'meatloaf', 'meatball', 'meatballs',
    'pot roast', 'roast',
    'casserole', 'shepherd\'s pie',
    'sushi', 'sashimi', 'roll',
    'noodles', 'lo mein', 'chow mein', 'pad thai',
    'bowl', 'plate', 'platter',
    'dumplings', 'gyoza', 'potsticker',
  ],
  booze: [
    'beer', 'ipa', 'lager', 'stout', 'ale', 'pilsner', 'hefeweizen',
    'wine', 'red wine', 'white wine', 'rosé', 'rose', 'champagne', 'prosecco', 'merlot', 'cabernet', 'pinot',
    'cocktail', 'margarita', 'martini', 'mojito', 'old fashioned', 'negroni', 'mule',
    'whiskey', 'whisky', 'bourbon', 'scotch', 'rye',
    'vodka', 'gin', 'rum', 'tequila', 'mezcal',
    'shot', 'shots',
    'hard seltzer', 'white claw', 'truly',
    'cider', 'hard cider',
    'liquor', 'spirit',
    'sake', 'soju',
  ],
  other: [],
};

export function categorizeFavorite(favorite: FavoritedBreakdown | { name: string; breakdown: FoodItemEstimate[] }): FoodCategory {
  const searchText = [
    favorite.name,
    ...(favorite.breakdown || []).map(item => item.name),
  ].join(' ').toLowerCase();

  // Check in order: booze first (so "beer" doesn't land in drinks), then snacks, then meals, then drinks
  for (const category of ['booze', 'snacks', 'meals', 'drinks'] as FoodCategory[]) {
    const keywords = KEYWORD_MAP[category];
    if (keywords.some(kw => searchText.includes(kw))) {
      return category;
    }
  }

  return 'other';
}

export function groupFavoritesByCategory(favorites: FavoritedBreakdown[]): Map<FoodCategory, FavoritedBreakdown[]> {
  const grouped = new Map<FoodCategory, FavoritedBreakdown[]>();

  // Initialize all categories with empty arrays
  for (const cat of CATEGORIES) {
    grouped.set(cat.key, []);
  }

  for (const fav of favorites) {
    const category = categorizeFavorite(fav);
    grouped.get(category)!.push(fav);
  }

  return grouped;
}
