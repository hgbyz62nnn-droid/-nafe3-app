import type { Locale } from './translations';

/**
 * Centralized Arabic labels for assessment OPTION DATA (sport names, goals,
 * equipment, positions, etc.) — kept separate from translations.ts's UI-chrome
 * strings because these are keyed by the option's internal id, not a `t()`
 * key, and span many small domain/assessment/*.ts data files. Internal ids
 * (the keys on the left of each map) are never translated — only the label
 * shown to the athlete. English is unchanged (it already lives on each
 * option's own `name`/`label` field) — this file is consulted ONLY for
 * Arabic, via `localizedOptionLabel` below.
 */

type OptionCategory =
  | 'sport'
  | 'goal'
  | 'experience'
  | 'frequency'
  | 'duration'
  | 'priority'
  | 'location'
  | 'equipment'
  | 'health'
  | 'diet'
  | 'allergy'
  | 'budget'
  | 'competitiveLevel'
  | 'matchesPerWeek'
  | 'position_football'
  | 'position_swimming';

const AR: Record<OptionCategory, Record<string, string>> = {
  sport: {
    football: 'كرة القدم',
    basketball: 'كرة السلة',
    swimming: 'السباحة',
    boxing: 'الملاكمة',
    tennis: 'التنس',
    running: 'الجري',
    gym_fitness: 'اللياقة البدنية',
    volleyball: 'الكرة الطائرة',
    athletics: 'ألعاب القوى',
    martial_arts: 'الفنون القتالية',
  },
  goal: {
    performance: 'تحسين الأداء',
    fat_loss: 'خسارة الدهون',
    muscle_gain: 'بناء العضلات',
    general_fitness: 'لياقة عامة',
    recovery: 'التعافي',
  },
  experience: {
    new: 'مبتدئ',
    some: 'بعض الخبرة',
    experienced: 'ذو خبرة',
    veteran: 'محترف قديم',
  },
  frequency: {
    low: '1-2 / أسبوع',
    moderate: '3-4 / أسبوع',
    high: '5-6 / أسبوع',
    daily: '7 / أسبوع',
  },
  duration: {
    short: '20-30 دقيقة',
    standard: '45 دقيقة',
    long: '60 دقيقة',
    extended: '90 دقيقة',
  },
  priority: {
    speed: 'السرعة والقوة الانفجارية',
    strength: 'القوة',
    conditioning: 'التحمل البدني',
  },
  location: {
    gym: 'صالة رياضية',
    home: 'المنزل',
    sports_club: 'نادٍ رياضي',
    outdoor: 'في الهواء الطلق',
    sports_field: 'ملعب رياضي',
    pool: 'مسبح',
    multiple: 'أماكن متعددة',
  },
  equipment: {
    dumbbells: 'دمبل',
    barbell: 'بار حديد',
    bench: 'مقعد تمرين',
    squat_rack: 'قفص القرفصاء',
    pull_up_bar: 'عقلة',
    cable_machine: 'جهاز كابل',
    kettlebell: 'كيتل بيل',
    resistance_bands: 'أحزمة مقاومة',
    trx: 'تي آر إكس',
    treadmill: 'جهاز جري',
    bike: 'دراجة',
    rowing_machine: 'جهاز تجديف',
    medicine_ball: 'كرة طبية',
    plyo_box: 'صندوق قفز',
    kickboard: 'لوح سباحة',
    pull_buoy: 'عوامة سباحة',
    fins: 'زعانف سباحة',
    paddles: 'مجاديف يد',
    other: 'أخرى',
  },
  health: {
    none: 'لا إصابات أو قيود',
    knee: 'الركبة',
    shoulder: 'الكتف',
    lower_back: 'أسفل الظهر',
    ankle: 'الكاحل',
    other: 'أخرى',
  },
  diet: {
    no_restriction: 'بلا قيود',
    vegetarian: 'نباتي',
    vegan: 'نباتي صرف',
    high_protein: 'عالي البروتين',
    low_carb: 'منخفض الكربوهيدرات',
  },
  allergy: {
    none: 'لا يوجد',
    dairy: 'الألبان',
    gluten: 'الغلوتين',
    nuts: 'المكسرات',
    shellfish: 'المحار',
    eggs: 'البيض',
  },
  budget: {
    low: 'اقتصادي',
    medium: 'متوسط',
    high: 'مرن',
  },
  competitiveLevel: {
    beginner: 'مبتدئ',
    amateur: 'هاوٍ',
    competitive: 'تنافسي',
    semi_pro: 'شبه محترف',
    professional: 'محترف',
  },
  matchesPerWeek: {
    none: '0',
    one: '1',
    two: '2',
    three_plus: '3+',
  },
  position_football: {
    goalkeeper: 'حارس مرمى',
    defender: 'مدافع',
    midfielder: 'لاعب وسط',
    winger: 'جناح',
    striker: 'مهاجم',
  },
  position_swimming: {
    freestyle: 'السباحة الحرة',
    backstroke: 'سباحة الظهر',
    breaststroke: 'سباحة الصدر',
    butterfly: 'سباحة الفراشة',
    im: 'متنوعة فردية',
  },
};

/** Returns the Arabic label for `id` within `category` when `locale` is 'ar',
 * falling back to `englishFallback` (the option's own `.name`/`.label`) for
 * English or for any id this dictionary doesn't yet cover — never a raw
 * internal id shown to the athlete, never a missing/blank label. */
export function localizedOptionLabel(category: OptionCategory, id: string, englishFallback: string, locale: Locale): string {
  if (locale !== 'ar') return englishFallback;
  return AR[category]?.[id] ?? englishFallback;
}
