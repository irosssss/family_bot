import { ASSET_FREE_POLICY } from './contracts';
import { getAssetSlot } from './registry';

export interface AssetSlotProps {
  slotId: string;
  label?: string;
  inspect?: boolean;
  onInspect?: (slotId: string) => void;
  className?: string;
  resourceState?: 'not_supplied' | 'unsupported';
}

/**
 * Deliberately has no image, URL, source, loader, canvas or SVG interface.
 * targetPath is documentation and is never read by this renderer.
 */
export function AssetSlot({ slotId, label, inspect = false, onInspect, className, resourceState=ASSET_FREE_POLICY.resourceState }: AssetSlotProps) {
  const slot = getAssetSlot(slotId);
  const title = label || slot?.label || 'Место для графики';
  const ratio = slot?.aspectRatio || '1 / 1';
  return (
    <figure
      className={['v3-asset-slot', className].filter(Boolean).join(' ')}
      style={{ aspectRatio: ratio }}
      data-asset-slot={slotId}
      data-asset-status={slot?.status || 'unregistered'}
      data-resource-state={resourceState}
      aria-label={`${title}. ${resourceState==='unsupported'?'Этот вариант графики не поддерживается.':slot ? 'Графика ещё не добавлена.' : 'Место не зарегистрировано.'}`}
    >
      <figcaption>
        <span className="v3-asset-label">{title}</span>
        <span className="v3-asset-meta">
          {resourceState==='unsupported'?'Вариант графики не поддерживается':slot ? `Место для графики · ${ratio.replace(/\s/g, '').replace('/', ':')}` : 'Место не зарегистрировано'}
        </span>
      </figcaption>
      {inspect && onInspect && (
        <button
          type="button"
          className="v3-asset-inspect"
          aria-label={`Параметры места: ${title}`}
          onClick={() => onInspect(slotId)}
        >
          Параметры
        </button>
      )}
    </figure>
  );
}

export default AssetSlot;
