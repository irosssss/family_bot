export type ClassKey = 'warrior' | 'mage' | 'rogue' | 'healer' | '';
export type GenderKey = 'male' | 'female';
export type FamilyRole = 'parent' | 'child';

export interface User {
  id: number;
  telegram_id: number;
  display_name: string;
  family_role?: FamilyRole;          // НОВОЕ: роль в семье (parent | child)
  is_admin?: boolean;                // НОВОЕ: true для родителей
  // @deprecated: assignee — старая демо-модель (misha/regina/both). Не удалять (совместимость).
  assignee: 'misha' | 'regina' | 'both';
  gender?: GenderKey;
  custom_avatar_url?: string;
  character_color?: string;
  color?: string;
  skin_tone?: string;
  hair_style?: string;
  hair_color?: string;
  ulpc_hair?: string;       // ULPC причёска (стиль из ulpcHairCatalog)
  ulpc_hair_color?: string; // ULPC цвет волос (blonde/red/brown/dark/black/gray)
  eye_color?: string;
  hp?: number;
  max_hp?: number;
  mp?: number;
  max_mp?: number;
  gold: number;
  xp: number;
  crystals?: number;
  current_streak: number;
  best_streak?: number;
  streak_status?: 'active' | 'paused' | 'broken' | 'frozen';
  streak_freeze_available?: boolean;
  streak_freeze_last_used?: string;
  last_streak_update?: string;
  class: ClassKey;
  skill_date: string | null;
  notify_partner: number;
  timezone?: string;
  age?: number;
  equipped: {
    head?: string;
    weapon?: string;
    shield?: string;
    body?: string;
    cloak?: string;
    accessory?: string;
    mount?: string;
    background?: string;
  };
  pets: { id: number; emoji?: string; imageUrl?: string }[];
  referral_code?: string;
  referred_by?: number;
  referrals_count?: number;
  referral_earnings_gold?: number;
  referral_earnings_crystals?: number;
}

export type TaskType = 'daily' | 'weekly' | 'todo' | 'core' | 'personal' | 'quest';
export type TaskCategory =
  | 'clean' | 'kitchen' | 'laundry' | 'trash' | 'bedroom'
  | 'hygiene' | 'study' | 'pet' | 'hobby' | 'health' | 'family' | 'parent';
export type AssigneeType = 'any' | 'individual' | 'parent' | 'both';
export type ScheduleType = 'daily' | 'weekly' | 'weekdays' | 'weekend' | 'once' | 'flexible';

export interface Task {
  id: number;
  code: string;
  title: string;
  description?: string;
  points: number;
  // --- Совместимость со старой системой (не удалять!) ---
  assignee: 'misha' | 'regina' | 'both';
  task_type: TaskType;
  day_of_week: number | number[] | null; // 0 = Monday, 6 = Sunday (может быть массивом для weekly/quest)
  done?: boolean;
  // --- Новая система задач (Этап 6) ---
  category?: TaskCategory;              // Категория: уборка, кухня, гигиена и т.д.
  assignee_type?: AssigneeType;         // Кому доступна: любой | индивидуальная | родитель | общая
  assignee_list?: string[];             // Конкретные люди (для assignee_type='individual')
  age_min?: number;                     // Мин. возраст (4, 6, 8, 10, 13)
  age_max?: number;                     // Макс. возраст
  schedule_type?: ScheduleType;         // Расписание: daily/weekly/weekdays/weekend/once/flexible
  is_required?: boolean;                // Обязательная?
  is_repeatable?: boolean;              // Можно выполнять несколько раз?
  max_daily?: number;                   // Лимит выполнений в день
  icon?: string;                        // Путь к спрайту
  recommendedClass?: string;            // Рекомендуемый класс (для атмосферы)
}

export interface Completion {
  id: number;
  user_id: number;
  task_id: number;
  completed_at: string;
  completed_at_ts: string;
  userName?: string;
  taskTitle?: string;
  points?: number;
}

export interface Reward {
  id: number;
  title: string;
  cost: number;
  reward_type: 'personal' | 'joint';
  active: number;
}

export interface Purchase {
  id: number;
  user_id: number;
  reward_id: number;
  reward_title: string;
  created_at: string;
  user_name?: string;
}

export interface ShopItem {
  id: number;
  code: string;
  title: string;
  emoji?: string;
  imageUrl?: string;
  icon?: string; // путь к 32-bit спрайту (этап 10)
  slot: 'head' | 'weapon' | 'shield' | 'body' | 'cloak' | 'accessory' | 'mount' | 'background';
  cost: number;
  recommendedClass?: ClassKey;
}

export interface UserItem {
  user_id: number;
  item_id: number;
  equipped: number;
}

export interface Pet {
  id: number;
  code: string;
  title: string;
  emoji?: string;
  imageUrl?: string;
  icon?: string; // путь к спрайту (этап 10)
  sprite_sheet_url?: string;
  spriteSheetUrl?: string; // полный спрайтшит с анимацией (этап V2)
  spriteFrames?: number;   // кадров в строке
  spriteRows?: number;     // направлений (строк)
}

export interface Achievement {
  id: number;
  code: string;
  title: string;
  description: string;
  bonus: number;
  unlocked?: boolean;
}

export interface Boss {
  id: number;
  week_key: string;
  name: string;
  emoji?: string;
  imageUrl?: string;
  icon?: string; // путь к спрайту босса (этап 10)
  spriteSheetUrl?: string; // Habitica-босс (статичный PNG) или ULPC-лист
  hp: number;
  maxHp: number;
  damage: number;
  defeated: number;
}

/** Habitica Habit: привычка [+/-] с динамической ценностью */
export interface Habit {
  id: number;
  user_id: number;
  title: string;
  icon?: string | null;
  value: number;          // -10..+10 (Task Value Decay)
  up_points: number;
  down_damage: number;
  counter_up: number;
  counter_down: number;
}

export interface Challenge {
  code: string;
  title: string;
  description: string;
  target: number;
  bonus: number;
  progress?: number;
  completed?: boolean;
}

export interface FeedEntry {
  id: number;
  userName: string;
  userId: number;
  taskTitle: string;
  points: number;
  date: string;
  timestamp: string;
}

export interface DayStats {
  day: string;
  dayShort: string;
  mishaPoints: number;
  reginaPoints: number;
  total: number;
}

export interface ReferralRecord {
  id: number;
  referrer_id: number;
  referee_id: number;
  referee_name: string;
  created_at: string;
  bonus_gold: number;
  bonus_crystals: number;
}

export interface AppState {
  users: User[];
  tasks: Task[];
  habits: Habit[];
  completions: Completion[];
  rewards: Reward[];
  purchases: Purchase[];
  shopItems: ShopItem[];
  userItems: UserItem[];
  pets: Pet[];
  userPets: { user_id: number; pet_id: number; is_active?: boolean; feed_points?: number }[];
  achievements: Achievement[];
  userAchievements: { user_id: number; achievement_id: number }[];
  boss: Boss;
  challenge: Challenge;
  perfectDays: { user_id: number; day: string }[];
  feed?: FeedEntry[];
  referrals?: ReferralRecord[];
  // Этап 9: Family HP (общая полоска семьи + статус «Истощение»)
  family?: {
    id: number;
    family_code: string;
    name: string;
    family_hp: number;
    max_family_hp: number;
    exhausted_until: string | null;
  } | null;
}

export interface CompleteTaskResult {
  points: number;
  title: string;
  gold_gain: number;
  xp_gain: number;
  level_up: boolean;
  new_level: number;
  perfect: boolean;
  pet: Pet | null;
  bossDefeated: Boss | null;
  achievements: Achievement[];
  challengeCompleted: { title: string; bonus: number } | null;
  state: AppState;
}
