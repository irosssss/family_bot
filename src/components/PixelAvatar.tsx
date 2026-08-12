import React from 'react';
import { GenderKey } from '../types';
import {
  getPet16BitJpeg,
  getBoss16BitJpeg,
  getItem16BitJpeg,
  getEnvironment16BitJpeg,
} from '../utils/rpg16bitAssets';
import { LayeredAvatar } from './LayeredAvatar';
import { get32BitAvatarLayers } from '../utils/rpg32bitAssets';

export interface PixelAvatarProps {
  type?: 'character' | 'boss' | 'pet' | 'item';
  classKey?: 'warrior' | 'mage' | 'rogue' | 'healer' | string;
  gender?: GenderKey;
  characterColor?: string;
  color?: string;
  skinTone?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  customAvatarUrl?: string;
  headItem?: string;
  weaponItem?: string;
  shieldItem?: string;
  bodyItem?: string;
  cloakItem?: string;
  accessoryItem?: string;
  mountItem?: string;
  backgroundItem?: string;
  petEmoji?: string;
  bossEmoji?: string;
  bossName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  className?: string;
  imageUrl?: string;
  fallbackEmoji?: string;
}

export const RenderEnvironmentBg: React.FC<{ bgItem?: string; className?: string }> = ({ bgItem, className }) => {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [bgItem]);

  if (!bgItem) return null;

  const extraClass = className || '';
  const isDirectImage =
    !imgError &&
    (bgItem.startsWith('http') ||
      bgItem.startsWith('data:') ||
      bgItem.startsWith('blob:') ||
      bgItem.startsWith('/') ||
      bgItem.includes('.png') ||
      bgItem.includes('.jpg') ||
      bgItem.includes('.jpeg'));

  const bgJpegUrl = isDirectImage ? bgItem : getEnvironment16BitJpeg(bgItem);

  return (
    <div className={`absolute inset-0 rounded-2xl overflow-hidden shadow-inner ${extraClass}`}>
      <img
        src={bgJpegUrl}
        alt="16-Bit Environment Background (JPEG Asset)"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-cover pixel-art [image-rendering:pixelated]"
      />
      {/* 16-bit Atmosphere Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />
    </div>
  );
};

export const PixelAvatar: React.FC<PixelAvatarProps> = ({
  type = 'character',
  classKey = 'warrior',
  gender = 'male',
  characterColor = '',
  color = '',
  skinTone = '',
  hairStyle = '',
  hairColor = '',
  eyeColor = '',
  customAvatarUrl = '',
  headItem = '',
  weaponItem = '',
  shieldItem = '',
  bodyItem = '',
  cloakItem = '',
  accessoryItem = '',
  mountItem = '',
  backgroundItem = '',
  petEmoji = '',
  bossEmoji = '',
  bossName = '',
  size = 'md',
  animated = true,
  className = '',
  imageUrl = '',
  fallbackEmoji = '',
}) => {
  const sizePx = size === 'sm' ? 48 : size === 'md' ? 80 : size === 'lg' ? 120 : 160;
  const animClass = animated ? 'animate-pixel-idle' : '';
  const [customImgError, setCustomImgError] = React.useState(false);

  React.useEffect(() => {
    setCustomImgError(false);
  }, [customAvatarUrl, imageUrl]);

  const targetImgUrl = customAvatarUrl || imageUrl;

  // Custom PixelLab or Uploaded Avatar Rendering
  if (targetImgUrl && !customImgError) {
    return (
      <div className={`relative inline-flex items-center justify-center select-none ${animClass} ${className}`}>
        <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl blur-sm" />
        <div
          className="relative rounded-xl overflow-hidden bg-transparent flex items-center justify-center"
          style={{ width: sizePx, height: sizePx }}
        >
          <img
            src={targetImgUrl}
            alt="Avatar Asset"
            referrerPolicy="no-referrer"
            onError={() => setCustomImgError(true)}
            className="w-full h-full object-contain pixel-art"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>
    );
  }

  // ==========================================
  // 1. PET 16-BIT JPEG ASSET RENDERER
  // ==========================================
  if (type === 'pet') {
    const petJpegUrl = getPet16BitJpeg(petEmoji || fallbackEmoji || 'chinchilla');
    return (
      <div className={`relative inline-flex items-center justify-center select-none ${animClass} ${className}`}>
        <div
          className="relative overflow-hidden bg-transparent flex items-center justify-center"
          style={{ width: sizePx, height: sizePx }}
        >
          <img
            src={petJpegUrl}
            alt="16-Bit Pet Companion Asset (JPEG)"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain pixel-art [image-rendering:pixelated]"
          />
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. BOSS 16-BIT JPEG ASSET RENDERER
  // ==========================================
  if (type === 'boss') {
    const bossJpegUrl = getBoss16BitJpeg(bossName || bossEmoji || fallbackEmoji || 'boss');
    return (
      <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
        <div className="absolute inset-0 bg-red-600/30 rounded-full blur-2xl animate-pulse" />
        <div
          className="relative rounded-2xl overflow-hidden border-2 border-red-500/80 bg-slate-950 shadow-2xl animate-pixel-idle"
          style={{ width: sizePx, height: sizePx }}
        >
          <img
            src={bossJpegUrl}
            alt="16-Bit World Boss Asset (JPEG)"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover pixel-art [image-rendering:pixelated]"
          />
        </div>
      </div>
    );
  }
  
  if (type === 'item') {
    const itemJpegUrl = getItem16BitJpeg(fallbackEmoji || '❓');
    return (
      <div className={`relative inline-flex items-center justify-center select-none ${animClass} ${className}`}>
        <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl blur-sm" />
        <div
          className="relative rounded-xl overflow-hidden bg-transparent shadow-md border border-indigo-500/20 flex items-center justify-center"
          style={{ width: sizePx, height: sizePx }}
        >
          <img
            src={itemJpegUrl}
            alt="16-Bit Item Asset (JPEG)"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover pixel-art [image-rendering:pixelated]"
          />
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. CHARACTER & EQUIPMENT 32-BIT ASSET RENDERER
  // ==========================================
  
  const dummyUser = {
    id: 1,
    telegram_id: 1,
    display_name: 'Hero',
    assignee: 'both',
    gender: gender || 'male',
    class: classKey || 'warrior',
    skin_tone: skinTone || 'light',
  } as any;

  const equippedUrls: Record<string, string> = {};
  if (headItem) equippedUrls.head = headItem;
  if (weaponItem) equippedUrls.weapon = weaponItem;
  if (shieldItem) equippedUrls.shield = shieldItem;
  if (bodyItem) equippedUrls.body = bodyItem;
  
  const avatarLayers = get32BitAvatarLayers(dummyUser, equippedUrls, null);

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${animClass} ${className}`}>
      {/* Environment Background Layer */}
      {backgroundItem && <RenderEnvironmentBg bgItem={backgroundItem} />}

      {/* 32-Bit Character Sprite Container */}
      <div
        className="relative z-10 transition-transform hover:scale-105 flex items-center justify-center"
        style={{ width: sizePx, height: sizePx }}
      >
        <LayeredAvatar layers={avatarLayers} size={sizePx} animated={false} />
      </div>
    </div>
  );
};
