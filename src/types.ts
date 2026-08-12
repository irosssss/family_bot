export type ClassKey = 'warrior' | 'mage' | 'rogue' | 'healer' | '';
export type GenderKey = 'male' | 'female';

export interface User {
  id: number;
  telegram_id: number;
  display_name: string;
  assignee: 'misha' | 'regina' | 'both';
  gender?: GenderKey;
  custom_avatar_url?: string;
  character_color?: string;
  color?: string;
  skin_tone?: string;
  hair_style?: string;
  hair_color?: string;
  eye_color?: string;
  hp?: number;
  max_hp?: number;
  mp?: number;
  max_mp?: number;
  gold: number;
  xp: number;
  crystals?: number;
  streak: number;
  class: ClassKey;
  skill_date: string | null;
  notify_partner: number;
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

export interface Task {
  id: number;
  code: string;
  title: string;
  points: number;
  assignee: 'misha' | 'regina' | 'both';
  task_type: 'daily' | 'weekly' | 'todo';
  day_of_week: number | null; // 0 = Monday, 6 = Sunday
  done?: boolean;
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
  sprite_sheet_url?: string;
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
  hp: number;
  maxHp: number;
  damage: number;
  defeated: number;
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
  completions: Completion[];
  rewards: Reward[];
  purchases: Purchase[];
  shopItems: ShopItem[];
  userItems: UserItem[];
  pets: Pet[];
  userPets: { user_id: number; pet_id: number }[];
  achievements: Achievement[];
  userAchievements: { user_id: number; achievement_id: number }[];
  boss: Boss;
  challenge: Challenge;
  perfectDays: { user_id: number; day: string }[];
  feed?: FeedEntry[];
  referrals?: ReferralRecord[];
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
