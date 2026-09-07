import type { HomeFamilyStage } from './homeFamilyLayout';
import type { HomeSceneRect } from './homeSceneProjection';
import type { DemoDecorSlot, DemoTheme } from './types';

export interface AuthoredHomeScene {
  art: string;
  stage: HomeFamilyStage;
  decor: Record<DemoDecorSlot, HomeSceneRect>;
  pets: Record<string, HomeSceneRect>;
}

/** Coordinates belong to the 1672×941 evening master, not a device viewport. */
export const eveningHomeScene: AuthoredHomeScene = {
  art: '/assets/game/demo/home-evening-v5.png',
  stage: {
    sourceSize: { width: 1672, height: 941 },
    adultSlots: [
      { seatedContact: { x: 730, y: 595 }, standingContact: { x: 730, y: 745 }, childStandingContact: { x: 635, y: 725 }, zIndex: 10 },
      { seatedContact: { x: 940, y: 595 }, standingContact: { x: 940, y: 745 }, childStandingContact: { x: 1035, y: 725 }, zIndex: 11 },
    ],
    foregroundSlots: [
      { standingContact: { x: 740, y: 812 }, zIndex: 22 },
      { standingContact: { x: 940, y: 812 }, zIndex: 23 },
      { standingContact: { x: 595, y: 795 }, zIndex: 20 },
      { standingContact: { x: 1080, y: 795 }, zIndex: 21 },
    ],
    adultSeated: { size: { width: 288, height: 360 }, contact: { x: 144, y: 263.25 } },
    childSeated: { size: { width: 184, height: 230 }, contact: { x: 92, y: 168.1875 } },
    adultStanding: { size: { width: 264, height: 330 }, contact: { x: 132, y: 316.8 } },
    childStanding: { size: { width: 184, height: 230 }, contact: { x: 92, y: 220.8 } },
  },
  decor: {
    wall: { x: 1075, y: 165, width: 95, height: 120 },
    shelf: { x: 1060, y: 317, width: 110, height: 83 },
    floor: { x: 780, y: 825, width: 110, height: 90 },
  },
  pets: {
    'adult-0': { x: 525, y: 853, width: 75, height: 75 },
    'adult-1': { x: 630, y: 853, width: 75, height: 75 },
    'foreground-0': { x: 735, y: 853, width: 75, height: 75 },
    'foreground-1': { x: 840, y: 853, width: 75, height: 75 },
    'foreground-2': { x: 945, y: 853, width: 75, height: 75 },
    'foreground-3': { x: 1050, y: 853, width: 75, height: 75 },
  },
};

/** Upgrade only the exact bundled art. An editor's custom background stays intact. */
export function resolveAuthoredHomeScene(theme: Pick<DemoTheme, 'art' | 'layoutPresetId'>): AuthoredHomeScene | null {
  return theme.layoutPresetId === 'fireplace'
    && (theme.art === '/assets/game/demo/home-fireplace.webp' || theme.art === eveningHomeScene.art)
    ? eveningHomeScene : null;
}
