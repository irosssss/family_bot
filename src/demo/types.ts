export type DemoClass = 'warrior' | 'mage' | 'healer' | 'rogue';
export type DemoSubtype = 'father' | 'mother' | 'son' | 'daughter';
export type DemoSkin = 'peach' | 'warm' | 'brown' | 'deep';
export type DemoHair = 'short' | 'bob' | 'long' | 'curly' | 'ponytail';
export type DemoHairColor = 'chestnut' | 'blond' | 'black' | 'ginger' | 'silver';
export type DemoBeard = 'none' | 'short' | 'full';
export interface DemoAppearance {
  skin: DemoSkin;
  hair: DemoHair;
  hairColor: DemoHairColor;
  beard: DemoBeard;
  classId: DemoClass;
  bodyId: string;
  weaponId: string;
}
export interface DemoUser {
  id: string;
  name: string;
  role: 'parent' | 'child';
  subtype: DemoSubtype;
  age: number;
  archived: boolean;
  appearance: DemoAppearance;
  xp: number;
  gold: number;
  energy: number;
  level: number;
  bonusDay: string | null;
  ownedItemIds: string[];
  eggIds: string[];
  petIds: string[];
  activePetId: string | null;
}
export interface DemoTask {
  id: string;
  title: string;
  description: string;
  category: 'care' | 'home' | 'learning' | 'together';
  requiresApproval: boolean;
  shared: boolean;
  assigneeIds: string[];
  reward: { xp: number; gold: number; energy: number; coins: number };
  enabled: boolean;
  order: number;
}
export interface DemoCompletion {
  id: string;
  taskId: string;
  userId: string;
  day: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  note?: string;
  reward: DemoTask['reward'];
}
export interface DemoCatalogEntry {
  id: string;
  name: string;
  description: string;
  art: string;
  enabled: boolean;
  order: number;
  reference?: string;
  sourceRef?: string;
  sourceIndex?: number;
}
export interface DemoBoss extends DemoCatalogEntry {
  theme: string;
  hp: number;
  ability: string;
  reward: { coins: number; xp: number };
}
export interface DemoPet extends DemoCatalogEntry {
  eggName: string;
  hatchCost: number;
  price: number;
}
export type DemoDecorSlot = 'shelf' | 'floor' | 'wall';
export interface DemoItem extends DemoCatalogEntry {
  /** Transparent 256x320 full-character overlay for custom body/weapon catalog entries. */
  layerArt?: string;
  kind: 'body' | 'weapon' | 'decor';
  classId: DemoClass | 'all';
  price: number;
  currency: 'coins' | 'decorativeCredits';
  slot?: DemoDecorSlot;
  color: string;
}
export interface DemoTheme extends DemoCatalogEntry {
  layoutPresetId: 'fireplace' | 'library' | 'conservatory';
  price: number;
  currency: 'coins' | 'decorativeCredits';
  palette: string;
}
export interface DemoActivity { id: string; text: string; at: string; }
export interface DemoState {
  version: 1;
  revision: number;
  timezone: string;
  day: string;
  dailyBonusDay: string | null;
  taskDayBudgets: Record<string, { participantIds: string[]; assigneeIds: string[]; reward: DemoTask['reward']; shared: boolean; requiresApproval: boolean }>;
  users: DemoUser[];
  tasks: DemoTask[];
  completions: DemoCompletion[];
  wallet: { coins: number; decorativeCredits: number };
  ownedThemeIds: string[];
  ownedDecorIds: string[];
  home: { themeId: string; decor: Partial<Record<DemoDecorSlot, string>> };
  catalog: { bosses: DemoBoss[]; pets: DemoPet[]; items: DemoItem[]; themes: DemoTheme[] };
  battle: { bossId: string; hp: number; round: number; rewarded: boolean; participants: string[] };
  defeatedBossIds: string[];
  activity: DemoActivity[];
  processedRequestIds: string[];
  simulatedPurchases: { id: string; at: string; credits: number; actorId: string }[];
}
/** A local-demo profile selector is not production authentication. */
export interface DemoAction {
  actorId: string;
  action: 'completeTask' | 'approveTask' | 'rejectTask' | 'claimDaily' | 'saveAppearance'
    | 'buyItem' | 'equipItem' | 'buyTheme' | 'equipTheme' | 'equipDecor' | 'buyEgg'
    | 'hatchEgg' | 'equipPet' | 'attackBoss' | 'selectBoss' | 'simulatePurchase'
    | 'saveUser' | 'archiveUser' | 'saveCatalog' | 'saveTask';
  requestId?: string;
  userId?: string;
  taskId?: string;
  completionId?: string;
  itemId?: string;
  themeId?: string;
  petId?: string | null;
  bossId?: string;
  slot?: DemoDecorSlot;
  note?: string;
  appearance?: Partial<DemoAppearance>;
  user?: Partial<Pick<DemoUser, 'id' | 'name' | 'subtype' | 'age' | 'archived'>>;
  catalog?: 'bosses' | 'pets' | 'items' | 'themes';
  entry?: Record<string, unknown>;
  task?: Partial<DemoTask>;
}
