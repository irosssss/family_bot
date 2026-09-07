/** Feet anchors live in the room's clear floor area. Characters are never scenery. */
export interface SceneMember {
  id: string;
  role?: string;
  archived?: boolean;
}

export interface ScenePlacement<T> {
  member: T;
  /** Percentages of the scene width and height; y is the baseline at the feet. */
  x: number;
  y: number;
  scale: number;
  zIndex: number;
}

export interface SceneLayout<T> {
  members: ScenePlacement<T>[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 6;

export type SceneSeatPreset = 'fireplace' | 'library' | 'conservatory';
export interface SceneSeat {
  /** Pixel coordinates of the hip contact with the visible room furniture. */
  x: number;
  y: number;
  /** Character canvas height; the canvas hip is at 234 / 320 of this height. */
  size: number;
  canvasTop: number;
}

const seatPresets: Record<SceneSeatPreset, readonly [number, number, number][]> = {
  fireplace: [[14.5, 39, 100], [29, 39, 100]],
  library: [[42, 39.1, 100], [59, 39.1, 100]],
  conservatory: [[40, 43, 106], [60, 43, 106]],
};

/**
 * Optional authored seats, not automatically assigned by getSceneLayout.
 * Projects the 2:3 original room through centered object-fit:cover, including a
 * shorter mobile hero. Only callers that have checked canRenderSittingPose may use
 * these slots. Custom backgrounds require an independently verified matching seat.
 */
export function getSceneSeats(preset: SceneSeatPreset, width: number, height: number): SceneSeat[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const renderedHeight = Math.max(height, width * 1.5);
  const renderedWidth = renderedHeight / 1.5;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;
  return seatPresets[preset].map(([x, y, referenceSize]) => {
    const size = referenceSize * renderedWidth / 343;
    const hipY = offsetY + renderedHeight * y / 100;
    return { x: offsetX + renderedWidth * x / 100, y: hipY, size, canvasTop: hipY - size * 234 / 320 };
  }).filter(seat => seat.x - seat.size * .4 >= 0 && seat.x + seat.size * .4 <= width
    && seat.canvasTop >= 0 && seat.canvasTop + seat.size <= height);
}

const layouts: Record<number, Array<[number, number, number]>> = {
  1: [[50, 80, 1]],
  2: [[36, 80, 1], [65, 81, 1]],
  3: [[26, 80, 0.96], [51, 83, 1], [77, 81, 0.96]],
  4: [[28, 67, 0.92], [70, 67, 0.92], [40, 89, 1], [68, 90, 1]],
  5: [[25, 67, 0.89], [51, 67, 0.89], [77, 67, 0.89], [37, 90, 1], [67, 90, 1]],
  6: [[25, 67, 0.88], [50, 67, 0.88], [76, 67, 0.88], [22, 91, 0.98], [49, 91, 1], [77, 91, 0.98]],
};

/**
 * Input order is intentional and stable. The caller renders the returned page controls
 * and the complete accessible roster; changing a profile must not shuffle its family.
 * Archived members are intentionally excluded; all other members have a reachable page.
 */
export function getSceneLayout<T extends SceneMember>(
  roster: readonly T[],
  requestedPage = 0,
  themeId = 'fireplace',
): SceneLayout<T> {
  const active = roster.filter(member => !member.archived);
  const pageCount = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const finitePage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0;
  const page = Math.min(Math.max(0, finitePage), pageCount - 1);
  const visible = active.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const anchors = layouts[visible.length] ?? [];
  // Keep feet in the foreground clear rug area of each registered initial theme.
  const verticalOffset = themeId.includes('library') ? -1 : themeId.includes('conservatory') ? 1 : 0;
  const members = visible.map((member, index) => {
    const [x, y, depthScale] = anchors[index];
    return {
      member,
      x,
      y: y + verticalOffset,
      scale: depthScale * (member.role === 'child' ? 0.84 : 1),
      zIndex: Math.round(y * 10) + index,
    };
  });
  return { members, page, pageCount, pageSize: PAGE_SIZE, total: active.length };
}

export default getSceneLayout;
