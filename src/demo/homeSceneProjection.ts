/** Geometry only: no theme, family, pose, ownership or artistic placement decisions. */
export interface HomeSceneSize {
  readonly width: number;
  readonly height: number;
}

/** Authored coordinates are pixels in the source scene, never viewport percentages. */
export interface HomeScenePoint {
  readonly x: number;
  readonly y: number;
}

export interface HomeSceneRect extends HomeScenePoint, HomeSceneSize {}

export type HomeSceneFit = 'contain' | 'cover';

export interface HomeSceneProjectionInput {
  readonly source: HomeSceneSize;
  /** The actual scene container; page headers and safe areas are excluded by the caller. */
  readonly viewport: HomeSceneSize;
  readonly fit: HomeSceneFit;
  readonly anchors?: Readonly<Record<string, HomeScenePoint>>;
  readonly rectangles?: Readonly<Record<string, HomeSceneRect>>;
}

export interface HomeSceneProjection {
  readonly source: HomeSceneSize;
  readonly viewport: HomeSceneSize;
  readonly fit: HomeSceneFit;
  readonly scale: number;
  readonly offset: HomeScenePoint;
  /** Bounds for the background and any full-source-sized overlay/mask. */
  readonly sceneBounds: HomeSceneRect;
  readonly anchors: Readonly<Record<string, HomeScenePoint>>;
  readonly rectangles: Readonly<Record<string, HomeSceneRect>>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSize(value: HomeSceneSize | undefined | null): value is HomeSceneSize {
  return !!value && isFiniteNumber(value.width) && isFiniteNumber(value.height)
    && value.width > 0 && value.height > 0;
}

function isPoint(value: HomeScenePoint | undefined | null): value is HomeScenePoint {
  return !!value && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isRect(value: HomeSceneRect | undefined | null): value is HomeSceneRect {
  return isPoint(value) && isFiniteNumber(value.width) && isFiniteNumber(value.height)
    && value.width >= 0 && value.height >= 0
    && Number.isFinite(value.x + value.width) && Number.isFinite(value.y + value.height);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One centered, uniform projection for the whole authored scene. Equivalent to
 * object-fit contain/cover with object-position 50% 50%; layers must use these
 * same bounds rather than each running their own object-fit or responsive scale.
 *
 * Returns null for invalid sizes, malformed authored geometry or numeric overflow.
 * It never drops/clamps an individual layer, rounds pixels, or rearranges a family.
 * Out-of-viewport coordinates under cover are intentional; clipping belongs to the
 * common scene container. The caller also owns text sizing and >=44px hit targets.
 */
export function getHomeSceneProjection(input: HomeSceneProjectionInput): HomeSceneProjection | null {
  if (!input || !isSize(input.source) || !isSize(input.viewport)
    || (input.fit !== 'contain' && input.fit !== 'cover')) return null;
  const { source, viewport, fit } = input;
  const scaleX = viewport.width / source.width;
  const scaleY = viewport.height / source.height;
  const scale = fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
  if (!isFiniteNumber(scale) || scale <= 0) return null;

  const width = source.width * scale;
  const height = source.height * scale;
  const offset = { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2 };
  const sceneBounds = { ...offset, width, height };
  if (!isRect(sceneBounds) || width <= 0 || height <= 0) return null;

  const authoredAnchors = input.anchors === undefined ? {} : input.anchors;
  const authoredRects = input.rectangles === undefined ? {} : input.rectangles;
  if (!isRecord(authoredAnchors) || !isRecord(authoredRects)) return null;

  const anchors: Array<[string, HomeScenePoint]> = [];
  for (const [name, point] of Object.entries(authoredAnchors)) {
    if (!isPoint(point)) return null;
    const projected = { x: offset.x + point.x * scale, y: offset.y + point.y * scale };
    if (!isPoint(projected)) return null;
    anchors.push([name, projected]);
  }

  const rectangles: Array<[string, HomeSceneRect]> = [];
  for (const [name, rect] of Object.entries(authoredRects)) {
    if (!isRect(rect)) return null;
    const projected = {
      x: offset.x + rect.x * scale, y: offset.y + rect.y * scale,
      width: rect.width * scale, height: rect.height * scale,
    };
    if (!isRect(projected)) return null;
    rectangles.push([name, projected]);
  }

  return {
    source: { width: source.width, height: source.height },
    viewport: { width: viewport.width, height: viewport.height },
    fit, scale, offset, sceneBounds,
    anchors: Object.fromEntries(anchors), rectangles: Object.fromEntries(rectangles),
  };
}
