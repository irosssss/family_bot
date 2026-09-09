/**
 * Layout contracts for the isolated, asset-free V3 prototype.
 * A slot identifies a place in the UI, never a purchased item or a binary file.
 */
export type AssetSlotCategory = 'scene' | 'hero' | 'boss' | 'pet' | 'item' | 'home' | 'collection';

export interface CandidateCanvas {
  readonly width: number;
  readonly height: number;
}

export interface SlotAnchor {
  readonly name: string;
  /** Coordinates belong to the layout rectangle, not an approved sprite rig. */
  readonly space: 'normalized';
  readonly x: number;
  readonly y: number;
}

export interface AssetSlotDefinition {
  /** Stable UI identity. Independent of files, translations and family members. */
  readonly id: string;
  readonly label: string;
  readonly category: AssetSlotCategory;
  /** CSS layout ratio. It does not approve the future source dimensions. */
  readonly aspectRatio: string;
  /** Documentation only. Never pass this template to a resource loader. */
  readonly targetPath: string;
  readonly logicalCanvas: CandidateCanvas;
  readonly geometryStatus: 'candidate';
  readonly anchor: SlotAnchor;
  /** Proposed semantic roles; the final rig defines ordering and occlusion. */
  readonly layers: readonly string[];
  /** Proposed static visual variants. Resource loading is a separate state. */
  readonly states: readonly string[];
  readonly screens: readonly string[];
  readonly description: string;
  readonly status: 'planned';
}

/**
 * Future renderer vocabulary. There is no loader or "ready" branch in stage 1.
 * In particular, loading failure must preserve ownership and appearance choice.
 */
export type FutureResourceState =
  | 'not_supplied'
  | 'loading'
  | 'ready'
  | 'missing'
  | 'failed'
  | 'unsupported';

export const ASSET_FREE_POLICY = Object.freeze({
  mode: 'placeholder_only' as const,
  resourceState: 'not_supplied' as const,
  canLoadResources: false,
  preserveLayout: true,
  preserveSelection: true,
  fallback: 'labelled_placeholder' as const,
  substituteAnotherAsset: false,
  interaction: 'separate_named_button' as const,
});
