import { createContext, memo, useContext, useState, type CSSProperties } from 'react';
import type { DemoAppearance, DemoItem, DemoSubtype } from './types';

const ROOT = '/assets/game/demo/characters';
const SKINS = ['peach', 'warm', 'brown', 'deep'] as const;
const HAIRS = ['short', 'bob', 'long', 'curly', 'ponytail'] as const;
const HAIR_COLORS = ['chestnut', 'blond', 'black', 'ginger', 'silver'] as const;

/** Per-tree catalog, isolated between independent demo roots and preview drafts. */
export const CharacterCatalogContext = createContext<readonly DemoItem[]>([]);
export type CharacterPose = 'standing' | 'sitting';

export interface CharacterProps {
  appearance: DemoAppearance;
  subtype: DemoSubtype;
  /** Full paper-doll canvas height, in CSS pixels. Width is always height * 0.8. */
  size?: number;
  className?: string;
  showWeapon?: boolean;
  title?: string;
  shadow?: boolean;
  /** Runtime catalog enables editor-created clothing/weapon layers without code changes. */
  items?: readonly DemoItem[];
  /** Optional authored pose. Custom standing layers must not be silently substituted. */
  pose?: CharacterPose;
}

function supported<T extends string>(value: string, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? value as T : fallback;
}

function itemLayer(id: string, slot: 'body' | 'weapon', skin: string, items?: readonly DemoItem[]): string | null {
  const custom = items?.find(item => item.id === id && item.kind === slot)?.layerArt;
  if (custom && /^\/assets\/game\/[^?#]+\.(png|webp)$/i.test(custom) && !custom.includes('..') && !custom.includes('\\') && !/%2e|%2f|%5c/i.test(custom)) return custom;
  const match = /^(starter|rare)-(warrior|mage|healer|rogue)-(body|weapon)$/.exec(id);
  return match && match[3] === slot ? `${ROOT}/${id}${slot === 'body' ? `-${skin}` : ''}.png` : null;
}

/** Call before assigning a seat: authored sitting variants exist only for unchanged built-in outfits. */
export function canRenderSittingPose(appearance: DemoAppearance, items?: readonly DemoItem[]): boolean {
  return /^(starter|rare)-(warrior|mage|healer|rogue)-body$/.test(appearance.bodyId)
    && !items?.find(item => item.id === appearance.bodyId && item.kind === 'body')?.layerArt;
}

export const supportsSeatedBody = canRenderSittingPose;

/** All avatar placements share exactly this layer stack, including actual equipment. */
export function getCharacterRenderState(
  appearance: DemoAppearance,
  subtype: DemoSubtype,
  showWeapon = true,
  items?: readonly DemoItem[],
  pose: CharacterPose = 'standing',
): { paths: string[]; errors: string[] } {
  const skin = supported(appearance.skin, SKINS, 'peach');
  const hair = supported(appearance.hair, HAIRS, 'short');
  const color = supported(appearance.hairColor, HAIR_COLORS, 'chestnut');
  const sittingAvailable = pose === 'standing' || canRenderSittingPose(appearance, items);
  const body = pose === 'sitting' && sittingAvailable
    ? `${ROOT}/sitting/${appearance.bodyId}-${skin}.png`
    : itemLayer(appearance.bodyId, 'body', skin, items);
  const weapon = showWeapon ? itemLayer(appearance.weaponId, 'weapon', skin, items) : null;
  const paths = [
    ...(body ? [body] : []),
    `${ROOT}/head-${skin}.png`,
    `${ROOT}/hair-${hair}-${color}.png`,
  ];
  // Defensive presentation guard complements the authoritative server validation.
  if (subtype === 'father' && (appearance.beard === 'short' || appearance.beard === 'full')) {
    paths.push(`${ROOT}/beard-${appearance.beard}-${color}.png`);
  }
  if (weapon) paths.push(weapon);
  return { paths, errors: [
    ...(!sittingAvailable ? ['Для этой одежды нет сидячей позы'] : []),
    ...(pose === 'sitting' && showWeapon ? ['Оружие доступно только в стоячей позе'] : []),
    ...(!body ? ['Нет слоя одежды'] : []),
    ...(showWeapon && !weapon ? ['Нет слоя оружия'] : []),
  ] };
}

export function getCharacterLayerPaths(
  appearance: DemoAppearance,
  subtype: DemoSubtype,
  showWeapon = true,
  items?: readonly DemoItem[],
  pose: CharacterPose = 'standing',
): string[] {
  return getCharacterRenderState(appearance, subtype, showWeapon, items, pose).paths;
}

const layerStyle: CSSProperties = {
  position: 'absolute', inset: 0, width: '100%', height: '100%',
  imageRendering: 'pixelated', objectFit: 'contain', pointerEvents: 'none',
  userSelect: 'none',
};

/** Original layered raster chibi art; no legacy Habitica/LPC face substitution. */
export const Character = memo(function Character({
  appearance, subtype, size = 112, className = '', showWeapon,
  title, shadow, items, pose = 'standing',
}: CharacterProps) {
  const catalog = useContext(CharacterCatalogContext);
  const height = Math.max(24, Number.isFinite(size) ? size : 112);
  const { paths: layers, errors } = getCharacterRenderState(appearance, subtype, showWeapon ?? pose === 'standing', items ?? catalog, pose);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const visibleErrors = failedSrc && layers.includes(failedSrc) ? [...errors, 'Слой внешности недоступен'] : errors;
  return (
    <span
      className={`demo-character ${className}`.trim()}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title || visibleErrors.length ? undefined : true}
      data-class={appearance.classId}
      data-body={appearance.bodyId}
      data-skin={appearance.skin}
      data-pose={pose}
      data-asset-error={visibleErrors.length ? visibleErrors.join('; ') : undefined}
      style={{ position: 'relative', display: 'inline-block', width: height * 0.8, height, flexShrink: 0, verticalAlign: 'bottom' }}
    >
      {visibleErrors.length ? <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6, borderRadius: 12, border: '1px solid #bd7058', background: '#fae7d5', color: '#793821', fontSize: Math.max(8, Math.min(12, height / 9)), lineHeight: 1.2 }}>{visibleErrors.join('. ')}</span> : <>
      {(shadow ?? pose === 'standing') && <span aria-hidden style={{
        position: 'absolute', width: '57%', height: '7%', left: '22%', bottom: '2%',
        borderRadius: '50%', background: 'rgba(46, 27, 15, 0.22)', filter: 'blur(1.5px)',
      }} />}
      {layers.map(src => (
        <img key={src} src={src} alt="" width={256} height={320} draggable={false} decoding="async" style={layerStyle} onError={() => setFailedSrc(src)} />
      ))}
      </>}
    </span>
  );
});

export default Character;
