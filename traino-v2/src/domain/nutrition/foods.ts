import type { FoodDefinition } from './types';

/**
 * Curated Food Library — real, commonly-eaten whole foods and simple
 * standard preparations, prioritizing staples widely available in
 * Egypt/MENA (spec §9) alongside globally common foods, so the Meal
 * Builder has enough real components to compose a practical plan without
 * ever generating or guessing a food.
 *
 * PROVENANCE (spec §27): every macro figure here is a standard, widely-
 * published per-100g (or per stated common serving) macronutrient value
 * for that food/preparation — the same figures consistently reported
 * across public nutrition references (USDA FoodData Central-style
 * whole-food composition tables). These are NOT lab-measured for a
 * specific product, and are NOT presented as clinically exact — they are
 * conservative, standard reference figures for the named food in its
 * stated preparation and serving size. No composite/recipe dish with
 * highly variable home-cooking composition (e.g. koshari, molokhia) is
 * included as a single food entry, specifically to avoid fabricating a
 * precise number for something that varies too much recipe-to-recipe —
 * those are represented by their individual ingredients instead (rice,
 * lentils, pasta, tomato, etc.), which the Meal Builder composes.
 *
 * source: 'curated-reference-v1' / sourceVersion: '1.0' throughout.
 */

const SOURCE = 'curated-reference-v1';
const SOURCE_VERSION = '1.0';

export const FOOD_LIBRARY: FoodDefinition[] = [
  // -- Grains / carbohydrate staples --
  {
    id: 'white-rice-cooked', canonicalName: 'White Rice (cooked)', displayName: 'White Rice', aliases: ['Rice', 'Steamed Rice'],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'g', servingSize: 100,
    calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, fiberG: 0.4,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'pasta-cooked', canonicalName: 'Pasta (cooked)', displayName: 'Pasta', aliases: ['Macaroni', 'Spaghetti'],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'g', servingSize: 100,
    calories: 131, proteinG: 5, carbsG: 25, fatG: 1.1, fiberG: 1.8,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: ['gluten'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'potato-boiled', canonicalName: 'Potato (boiled)', displayName: 'Boiled Potato', aliases: ['Potatoes'],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'g', servingSize: 100,
    calories: 87, proteinG: 2, carbsG: 20, fatG: 0.1, fiberG: 1.8,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'sweet-potato-baked', canonicalName: 'Sweet Potato (baked)', displayName: 'Sweet Potato', aliases: [],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'g', servingSize: 100,
    calories: 90, proteinG: 2, carbsG: 21, fatG: 0.1, fiberG: 3.3,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'white-bread-slice', canonicalName: 'White Bread', displayName: 'White Bread (slice)', aliases: ['Toast'],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'slice', servingSize: 1,
    calories: 75, proteinG: 2.5, carbsG: 14, fatG: 1, fiberG: 0.8,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: ['gluten'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'baladi-bread', canonicalName: 'Baladi Bread', displayName: 'Baladi Bread (whole wheat pita)', aliases: ['Aish Baladi', 'Egyptian Bread'],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'piece', servingSize: 1,
    calories: 240, proteinG: 8, carbsG: 48, fatG: 1.5, fiberG: 5.5,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: ['gluten'], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'oats-dry', canonicalName: 'Oats', displayName: 'Rolled Oats', aliases: ['Oatmeal'],
    category: 'grain', mealRoles: ['carb'], servingUnit: 'g', servingSize: 40,
    calories: 156, proteinG: 6.8, carbsG: 26, fatG: 2.8, fiberG: 4,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },

  // -- Protein sources --
  {
    id: 'chicken-breast-cooked', canonicalName: 'Chicken Breast (cooked)', displayName: 'Chicken Breast', aliases: ['Grilled Chicken', 'Chicken'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'g', servingSize: 100,
    calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
    dietaryTags: ['no_restriction'], allergens: [], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'beef-lean-cooked', canonicalName: 'Lean Beef (cooked)', displayName: 'Lean Beef', aliases: ['Beef', 'Ground Beef'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'g', servingSize: 100,
    calories: 217, proteinG: 26, carbsG: 0, fatG: 12,
    dietaryTags: ['no_restriction'], allergens: [], region: 'general', budgetTier: 'high',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'tilapia-cooked', canonicalName: 'Tilapia (cooked)', displayName: 'Tilapia', aliases: ['White Fish'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'g', servingSize: 100,
    calories: 128, proteinG: 26, carbsG: 0, fatG: 2.7,
    dietaryTags: ['no_restriction'], allergens: [], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'tuna-canned', canonicalName: 'Tuna (canned in water)', displayName: 'Canned Tuna', aliases: ['Tuna'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'g', servingSize: 100,
    calories: 116, proteinG: 26, carbsG: 0, fatG: 1,
    dietaryTags: ['no_restriction'], allergens: [], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'salmon-cooked', canonicalName: 'Salmon (cooked)', displayName: 'Salmon', aliases: [],
    category: 'protein', mealRoles: ['protein', 'fat'], servingUnit: 'g', servingSize: 100,
    calories: 208, proteinG: 22, carbsG: 0, fatG: 13,
    dietaryTags: ['no_restriction'], allergens: [], region: 'general', budgetTier: 'high',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'shrimp-cooked', canonicalName: 'Shrimp (cooked)', displayName: 'Shrimp', aliases: ['Prawns'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'g', servingSize: 100,
    calories: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3,
    dietaryTags: ['no_restriction'], allergens: ['shellfish'], region: 'general', budgetTier: 'high',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'eggs-whole', canonicalName: 'Eggs (whole)', displayName: 'Eggs', aliases: ['Whole Eggs'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'piece', servingSize: 1,
    calories: 78, proteinG: 6.3, carbsG: 0.6, fatG: 5.3,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['eggs'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'egg-whites', canonicalName: 'Egg Whites', displayName: 'Egg Whites', aliases: [],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'piece', servingSize: 1,
    calories: 17, proteinG: 3.6, carbsG: 0.2, fatG: 0.1,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['eggs'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'whey-protein', canonicalName: 'Whey Protein Powder', displayName: 'Whey Protein', aliases: ['Protein Powder', 'Protein Shake'],
    category: 'protein', mealRoles: ['protein'], servingUnit: 'g', servingSize: 30,
    calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },

  // -- Legumes (also protein/carb sources, and a strong Egyptian/MENA staple category) --
  {
    id: 'lentils-cooked', canonicalName: 'Lentils (cooked)', displayName: 'Lentils', aliases: ['Adas'],
    category: 'legume', mealRoles: ['legume', 'protein', 'carb'], servingUnit: 'g', servingSize: 100,
    calories: 116, proteinG: 9, carbsG: 20, fatG: 0.4, fiberG: 7.9,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'ful-medames', canonicalName: 'Ful Medames (cooked fava beans)', displayName: 'Ful Medames', aliases: ['Ful', 'Fava Beans'],
    category: 'legume', mealRoles: ['legume', 'protein', 'carb'], servingUnit: 'g', servingSize: 100,
    calories: 110, proteinG: 7.6, carbsG: 18.3, fatG: 0.7, fiberG: 5.4,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'chickpeas-cooked', canonicalName: 'Chickpeas (cooked)', displayName: 'Chickpeas', aliases: ['Hummus Beans', 'Garbanzo Beans'],
    category: 'legume', mealRoles: ['legume', 'protein', 'carb'], servingUnit: 'g', servingSize: 100,
    calories: 164, proteinG: 8.9, carbsG: 27, fatG: 2.6, fiberG: 7.6,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'black-beans-cooked', canonicalName: 'Black Beans (cooked)', displayName: 'Black Beans', aliases: ['Kidney Beans'],
    category: 'legume', mealRoles: ['legume', 'protein', 'carb'], servingUnit: 'g', servingSize: 100,
    calories: 127, proteinG: 8.7, carbsG: 22.8, fatG: 0.5, fiberG: 8.7,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'hummus', canonicalName: 'Hummus', displayName: 'Hummus', aliases: [],
    category: 'legume', mealRoles: ['legume', 'fat'], servingUnit: 'g', servingSize: 100,
    calories: 166, proteinG: 7.9, carbsG: 14.3, fatG: 9.6, fiberG: 6,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'falafel', canonicalName: 'Falafel', displayName: 'Falafel', aliases: [],
    category: 'legume', mealRoles: ['legume', 'protein'], servingUnit: 'g', servingSize: 100,
    calories: 333, proteinG: 13, carbsG: 32, fatG: 18, fiberG: 4.9,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },

  // -- Dairy --
  {
    id: 'yogurt-plain', canonicalName: 'Plain Yogurt', displayName: 'Plain Yogurt', aliases: ['Yogurt', 'Laban Zabadi'],
    category: 'dairy', mealRoles: ['dairy', 'protein'], servingUnit: 'g', servingSize: 100,
    calories: 63, proteinG: 5.3, carbsG: 7, fatG: 1.5,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'greek-yogurt', canonicalName: 'Greek Yogurt', displayName: 'Greek Yogurt', aliases: [],
    category: 'dairy', mealRoles: ['dairy', 'protein'], servingUnit: 'g', servingSize: 100,
    calories: 97, proteinG: 9, carbsG: 3.9, fatG: 5,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'milk-whole', canonicalName: 'Whole Milk', displayName: 'Milk', aliases: [],
    category: 'dairy', mealRoles: ['dairy'], servingUnit: 'ml', servingSize: 100,
    calories: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'cheese-feta', canonicalName: 'Feta Cheese', displayName: 'Feta Cheese', aliases: ['Gebna Beida'],
    category: 'dairy', mealRoles: ['dairy', 'protein'], servingUnit: 'g', servingSize: 100,
    calories: 264, proteinG: 14, carbsG: 4, fatG: 21,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'egyptian_mena', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'cheese-cottage', canonicalName: 'Cottage Cheese', displayName: 'Cottage Cheese', aliases: [],
    category: 'dairy', mealRoles: ['dairy', 'protein'], servingUnit: 'g', servingSize: 100,
    calories: 98, proteinG: 11, carbsG: 3.4, fatG: 4.3,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'cheese-cheddar', canonicalName: 'Cheddar Cheese', displayName: 'Cheddar Cheese', aliases: [],
    category: 'dairy', mealRoles: ['dairy', 'fat'], servingUnit: 'g', servingSize: 30,
    calories: 121, proteinG: 7.5, carbsG: 0.4, fatG: 10,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'high',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },

  // -- Vegetables --
  {
    id: 'tomato', canonicalName: 'Tomato', displayName: 'Tomato', aliases: [],
    category: 'vegetable', mealRoles: ['vegetable'], servingUnit: 'g', servingSize: 100,
    calories: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, fiberG: 1.2,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'cucumber', canonicalName: 'Cucumber', displayName: 'Cucumber', aliases: [],
    category: 'vegetable', mealRoles: ['vegetable'], servingUnit: 'g', servingSize: 100,
    calories: 15, proteinG: 0.65, carbsG: 3.6, fatG: 0.1, fiberG: 0.5,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'spinach-raw', canonicalName: 'Spinach', displayName: 'Spinach', aliases: [],
    category: 'vegetable', mealRoles: ['vegetable'], servingUnit: 'g', servingSize: 100,
    calories: 29, proteinG: 2.9, carbsG: 3.6, fatG: 0.4, fiberG: 2.2,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'zucchini', canonicalName: 'Zucchini', displayName: 'Zucchini (Koussa)', aliases: ['Koussa', 'Courgette'],
    category: 'vegetable', mealRoles: ['vegetable'], servingUnit: 'g', servingSize: 100,
    calories: 17, proteinG: 1.2, carbsG: 3.1, fatG: 0.3, fiberG: 1,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'eggplant', canonicalName: 'Eggplant', displayName: 'Eggplant (Baba Ghanoug base)', aliases: ['Aubergine'],
    category: 'vegetable', mealRoles: ['vegetable'], servingUnit: 'g', servingSize: 100,
    calories: 25, proteinG: 1, carbsG: 6, fatG: 0.2, fiberG: 3,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'mixed-salad-greens', canonicalName: 'Mixed Salad Greens', displayName: 'Mixed Salad', aliases: ['Salad', 'Lettuce'],
    category: 'vegetable', mealRoles: ['vegetable'], servingUnit: 'g', servingSize: 100,
    calories: 17, proteinG: 1.4, carbsG: 3, fatG: 0.2, fiberG: 1.5,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },

  // -- Fruit --
  {
    id: 'apple', canonicalName: 'Apple', displayName: 'Apple', aliases: [],
    category: 'fruit', mealRoles: ['fruit'], servingUnit: 'piece', servingSize: 1,
    calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'banana', canonicalName: 'Banana', displayName: 'Banana', aliases: [],
    category: 'fruit', mealRoles: ['fruit'], servingUnit: 'piece', servingSize: 1,
    calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, fiberG: 3.1,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'orange', canonicalName: 'Orange', displayName: 'Orange', aliases: [],
    category: 'fruit', mealRoles: ['fruit'], servingUnit: 'piece', servingSize: 1,
    calories: 62, proteinG: 1.2, carbsG: 15.4, fatG: 0.2, fiberG: 3.1,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'dates', canonicalName: 'Dates', displayName: 'Dates', aliases: ['Balah'],
    category: 'fruit', mealRoles: ['fruit', 'carb'], servingUnit: 'g', servingSize: 40,
    calories: 111, proteinG: 0.7, carbsG: 30, fatG: 0.1, fiberG: 3.2,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'mango', canonicalName: 'Mango', displayName: 'Mango', aliases: [],
    category: 'fruit', mealRoles: ['fruit'], servingUnit: 'g', servingSize: 100,
    calories: 60, proteinG: 0.8, carbsG: 15, fatG: 0.4, fiberG: 1.6,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'watermelon', canonicalName: 'Watermelon', displayName: 'Watermelon', aliases: [],
    category: 'fruit', mealRoles: ['fruit'], servingUnit: 'g', servingSize: 100,
    calories: 30, proteinG: 0.6, carbsG: 7.6, fatG: 0.2, fiberG: 0.4,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },

  // -- Fats/oils, nuts/seeds --
  {
    id: 'olive-oil', canonicalName: 'Olive Oil', displayName: 'Olive Oil', aliases: [],
    category: 'fat_oil', mealRoles: ['fat'], servingUnit: 'tbsp', servingSize: 1,
    calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'butter', canonicalName: 'Butter', displayName: 'Butter', aliases: [],
    category: 'fat_oil', mealRoles: ['fat'], servingUnit: 'tbsp', servingSize: 1,
    calories: 102, proteinG: 0.1, carbsG: 0, fatG: 11.5,
    dietaryTags: ['no_restriction', 'vegetarian'], allergens: ['dairy'], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'tahini', canonicalName: 'Tahini', displayName: 'Tahini', aliases: ['Sesame Paste'],
    category: 'fat_oil', mealRoles: ['fat'], servingUnit: 'tbsp', servingSize: 1,
    calories: 89, proteinG: 2.6, carbsG: 3.2, fatG: 8,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: [], region: 'egyptian_mena', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'almonds', canonicalName: 'Almonds', displayName: 'Almonds', aliases: [],
    category: 'nut_seed', mealRoles: ['fat'], servingUnit: 'g', servingSize: 28,
    calories: 164, proteinG: 6, carbsG: 6, fatG: 14, fiberG: 3.5,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: ['nuts'], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'walnuts', canonicalName: 'Walnuts', displayName: 'Walnuts', aliases: [],
    category: 'nut_seed', mealRoles: ['fat'], servingUnit: 'g', servingSize: 28,
    calories: 185, proteinG: 4.3, carbsG: 3.9, fatG: 18.5, fiberG: 1.9,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: ['nuts'], region: 'general', budgetTier: 'medium',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
  {
    id: 'peanuts', canonicalName: 'Peanuts', displayName: 'Peanuts', aliases: ['Groundnuts'],
    category: 'nut_seed', mealRoles: ['fat', 'legume'], servingUnit: 'g', servingSize: 28,
    calories: 161, proteinG: 7.3, carbsG: 4.6, fatG: 14, fiberG: 2.4,
    dietaryTags: ['no_restriction', 'vegetarian', 'vegan'], allergens: ['nuts'], region: 'general', budgetTier: 'low',
    source: SOURCE, sourceVersion: SOURCE_VERSION,
  },
];
