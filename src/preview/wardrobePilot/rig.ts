/** Coordinates are in the unchanged 1024 × 1536 body canvas. */
export const WIDTH = 1024;
export const HEIGHT = 1536;
export const ASSETS = {
  base: '/assets/game/wardrobe-pilot/boy-base.png',
  wardrobe: '/assets/game/wardrobe-pilot/boy-wardrobe.png',
  reference: '/assets/game/wardrobe-pilot/boy-reference.png',
};
type Rect = readonly [number, number, number, number];
type Piece = { source: Rect; target: Rect };
export type OutfitId = 'base' | 'everyday' | 'ranger' | 'knight';
export type HairId = 'none' | 'part' | 'waves' | 'quiff';
export type Look = { outfit: OutfitId; hair: HairId };
export const OUTFITS: { id: OutfitId; name: string; detail: string; pieces: Piece[] }[] = [
  { id: 'base', name: 'Основа', detail: 'Майка и шорты', pieces: [] },
  { id: 'everyday', name: 'На каждый день', detail: 'Синий жилет', pieces: [
    { source: [20, 30, 312, 270], target: [232, 424, 560, 431] },
    { source: [20, 300, 312, 348], target: [232, 855, 560, 611] },
  ] },
  { id: 'ranger', name: 'Следопыт', detail: 'Лесная туника', pieces: [
    { source: [347, 22, 330, 322], target: [231, 419, 562, 444] },
    { source: [347, 344, 330, 304], target: [231, 863, 562, 603] },
  ] },
  { id: 'knight', name: 'Рыцарь', detail: 'Стальные доспехи', pieces: [
    { source: [684, 20, 332, 344], target: [222, 417, 580, 464] },
    { source: [684, 364, 332, 284], target: [222, 881, 580, 585] },
  ] },
];
export const HAIRS: { id: HairId; name: string; piece?: Piece }[] = [
  { id: 'none', name: 'Без волос' },
  { id: 'part', name: 'Пробор', piece: { source: [26, 688, 310, 282], target: [298, -7, 427, 365] } },
  { id: 'waves', name: 'Волны', piece: { source: [353, 684, 320, 284], target: [292, -12, 441, 370] } },
  { id: 'quiff', name: 'Вихор', piece: { source: [687, 684, 329, 284], target: [287, -12, 453, 370] } },
];
export type LoadedArt = Record<keyof typeof ASSETS, HTMLImageElement>;
export async function loadArt(): Promise<LoadedArt> {
  const entries = await Promise.all(Object.entries(ASSETS).map(async ([key, src]) => {
    const im = new Image(); im.src = src; await im.decode(); return [key, im] as const;
  }));
  return Object.fromEntries(entries) as LoadedArt;
}
function piece(ctx: CanvasRenderingContext2D, img: HTMLImageElement, p: Piece) {
  ctx.drawImage(img, ...p.source, ...p.target);
}
function polygon(ctx: CanvasRenderingContext2D, points: number[][]) {
  ctx.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
}
export function renderLook(canvas: HTMLCanvasElement, art: LoadedArt, look: Look, layer: 'all' | 'body' | 'outfit' | 'hands' | 'hair' = 'all') {
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (layer === 'all' || layer === 'body') {
    ctx.save();
    if (look.outfit !== 'base') {
      // Keep the original face/neck and exposed arms. Hide the modest underlayer
      // beneath costumes, preventing shorts/boots from protruding from trousers.
      ctx.beginPath(); ctx.rect(0, 0, WIDTH, 405); ctx.rect(414, 390, 208, 132);
      polygon(ctx, [[0,540],[365,540],[373,610],[335,742],[322,830],[322,1030],[0,1030]]);
      polygon(ctx, [[656,540],[1024,540],[1024,1030],[676,1030],[676,830],[666,741],[646,610]]);
      ctx.clip();
    }
    ctx.drawImage(art.base, 0, 0); ctx.restore();
  }
  if (layer === 'all' || layer === 'outfit') {
    OUTFITS.find(o => o.id === look.outfit)?.pieces.forEach(p => piece(ctx, art.wardrobe, p));
  }
  if ((layer === 'all' || layer === 'hands') && look.outfit !== 'base') {
    ctx.save(); ctx.beginPath();
    polygon(ctx, [[210,828],[299,828],[318,933],[297,1005],[205,1005]]);
    polygon(ctx, [[700,828],[785,828],[795,1005],[697,1005],[678,933]]);
    ctx.clip(); ctx.drawImage(art.base, 0, 0); ctx.restore();
  }
  if (layer === 'all' || layer === 'hair') {
    const hair = HAIRS.find(h => h.id === look.hair); if (hair?.piece) piece(ctx, art.wardrobe, hair.piece);
  }
}
