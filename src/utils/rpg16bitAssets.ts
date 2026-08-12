// 16-bit RPG High-Definition Asset Engine & JPEG Asset Generator
// SNES / Genesis Style Rendering Pipeline for Character Sprites, Equipment, Pets, Bosses, and Environments

interface EquipmentEquipped {
  head?: string;
  weapon?: string;
  shield?: string;
  body?: string;
  cloak?: string;
  accessory?: string;
  mount?: string;
  background?: string;
}

// Memory Cache for generated JPEG Data URLs to prevent canvas re-draws
const jpegCache: Record<string, string> = {};

/**
 * Converts a Canvas context draw function into a high-quality JPEG Data URL
 */
function createJpegAsset(width: number, height: number, drawFn: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Disable smoothing for crisp 16-bit pixel scaling
  ctx.imageSmoothingEnabled = false;

  // Execute drawing
  drawFn(ctx);

  // Return as PNG Data URL for clean transparency
  return canvas.toDataURL('image/png');
}

// ============================================================================
// 1. 16-BIT CHARACTER SPRITE JPEG GENERATOR
// ============================================================================
export function getCharacter16BitJpeg(
  classKey: string = 'warrior',
  gender: 'male' | 'female' = 'male',
  characterColor: string = '',
  skinTone: string = '',
  hairColor: string = '',
  equipped?: EquipmentEquipped
): string {
  const cacheKey = `char_16bit_${classKey}_${gender}_${characterColor}_${skinTone}_${hairColor}_${JSON.stringify(
    equipped || {}
  )}`;
  if (jpegCache[cacheKey]) return jpegCache[cacheKey];

  const w = 128;
  const h = 128;

  const jpegUrl = createJpegAsset(w, h, (ctx) => {
    // Ground Shadow under feet
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 18, 36, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Palette setup
    const isFemale = gender === 'female';
    const isWarrior = classKey === 'warrior';
    const isMage = classKey === 'mage';
    const isRogue = classKey === 'rogue';
    const isHealer = classKey === 'healer';

    const baseSkin = skinTone || (isFemale ? '#fed7aa' : '#fbcfe8');
    const shadowSkin = '#c2410c';
    const baseHair = hairColor || (isFemale ? '#f59e0b' : '#451a03');

    // --- MOUNT (16-bit) ---
    const mount = (equipped?.mount || '').toLowerCase();
    if (mount) {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(24, 76, 80, 32);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(28, 104, 16, 16);
      ctx.fillRect(84, 104, 16, 16);

      if (mount.includes('dragon') || mount.includes('🐉')) {
        ctx.fillStyle = '#10b981';
        ctx.fillRect(16, 70, 96, 36);
        // Dragon Horns
        ctx.fillStyle = '#facc15';
        ctx.fillRect(100, 60, 12, 16);
      }
    }

    // --- CLOAK & WINGS (16-bit) ---
    const cloak = (equipped?.cloak || '').toLowerCase();
    if (cloak.includes('wing') || cloak.includes('🪽') || cloak.includes('🪶')) {
      // Angelic Wings
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(32, 54, 24, 0, Math.PI * 2);
      ctx.arc(96, 54, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(24, 50, 16, 20);
      ctx.fillRect(88, 50, 16, 20);
    } else if (cloak || isRogue) {
      // Velvet Cape
      ctx.fillStyle = isRogue ? '#064e3b' : '#991b1b';
      ctx.fillRect(36, 52, 56, 54);
      ctx.fillStyle = isRogue ? '#10b981' : '#ef4444';
      ctx.fillRect(40, 56, 48, 48);
    }

    // --- LEGS & BOOTS (16-Bit Style matching uploaded assets) ---
    if (isFemale) {
      // Female Trousers (Dark Slate Gray)
      ctx.fillStyle = '#334155';
      ctx.fillRect(48, 86, 12, 26);
      ctx.fillRect(68, 86, 12, 26);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(56, 86, 4, 26);
      ctx.fillRect(76, 86, 4, 26);

      // Female Cuffed Brown Boots
      ctx.fillStyle = '#571c0c';
      ctx.fillRect(44, 108, 18, 14);
      ctx.fillRect(66, 108, 18, 14);
      ctx.fillStyle = '#381107';
      ctx.fillRect(44, 108, 18, 4); // Boot cuff
      ctx.fillRect(66, 108, 18, 4);
    } else {
      // Male Trousers (Navy Blue)
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(46, 86, 14, 26);
      ctx.fillRect(68, 86, 14, 26);
      ctx.fillStyle = '#312e81';
      ctx.fillRect(46, 86, 6, 26);
      ctx.fillRect(68, 86, 6, 26);

      // Male Cuffed Brown Leather Boots
      ctx.fillStyle = '#451a03';
      ctx.fillRect(42, 108, 20, 14);
      ctx.fillRect(66, 108, 20, 14);
      ctx.fillStyle = '#270e04';
      ctx.fillRect(42, 108, 20, 4); // Folded cuff
      ctx.fillRect(66, 108, 20, 4);
    }

    // --- BODY & OUTFIT (16-bit detail matching uploaded assets) ---
    const body = (equipped?.body || '').toLowerCase();
    if (body.includes('armor') || isWarrior) {
      // Warrior Plate Armor
      ctx.fillStyle = '#334155';
      ctx.fillRect(38, 46, 52, 42);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(42, 50, 44, 34);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(48, 54, 32, 20);
      // Gold Trim & Shoulder Guards
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(42, 82, 44, 6);
      ctx.fillRect(30, 44, 16, 16);
      ctx.fillRect(82, 44, 16, 16);
    } else if (isMage) {
      // Mage Robes
      ctx.fillStyle = '#4c1d95';
      ctx.fillRect(38, 46, 52, 42);
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(42, 50, 44, 34);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(58, 50, 12, 38);
    } else if (isHealer) {
      // Healer Vestments
      ctx.fillStyle = '#881337';
      ctx.fillRect(38, 46, 52, 42);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(42, 50, 44, 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(58, 50, 12, 38);
      ctx.fillRect(48, 62, 32, 6);
    } else if (isFemale) {
      // Female 16-Bit Tunic (Cream Short-Sleeved Tunic with Leather Belt & Pouch)
      ctx.fillStyle = '#fef3c7'; // Cream base
      ctx.fillRect(42, 46, 44, 42);
      ctx.fillStyle = '#fde68a'; // Tunic shadow/folds
      ctx.fillRect(42, 60, 10, 28);
      ctx.fillRect(76, 60, 10, 28);

      // Sleeves
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(34, 46, 10, 18);
      ctx.fillRect(84, 46, 10, 18);

      // Leather Waist Belt & Pouch
      ctx.fillStyle = '#78350f';
      ctx.fillRect(42, 74, 44, 6); // Belt
      ctx.fillRect(72, 74, 10, 12); // Leather Pouch on left hip
      ctx.fillStyle = '#facc15';
      ctx.fillRect(76, 78, 4, 4); // Pouch buckle
    } else {
      // Male 16-Bit Outfit (Brown Leather Vest over Cream Undershirt with Gold Buckle)
      // Undershirt
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(48, 46, 32, 12);
      ctx.fillRect(34, 46, 10, 16); // Left sleeve
      ctx.fillRect(84, 46, 10, 16); // Right sleeve

      // Brown Leather Vest
      ctx.fillStyle = '#451a03';
      ctx.fillRect(38, 46, 52, 42);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(48, 48, 32, 38);

      // Belt with Gold Buckle & Pouch
      ctx.fillStyle = '#270e04';
      ctx.fillRect(38, 74, 52, 8); // Belt
      ctx.fillStyle = '#facc15';
      ctx.fillRect(60, 72, 10, 12); // Gold Buckle
      ctx.fillStyle = '#78350f';
      ctx.fillRect(76, 74, 10, 12); // Belt Pouch
    }

    // --- ARMS & SKIN ---
    ctx.fillStyle = skinTone || (isFemale ? '#fed7aa' : '#fbcfe8');
    // Forearms
    ctx.fillRect(32, 62, 10, 26);
    ctx.fillRect(86, 62, 10, 26);

    // --- HEAD & FACE ---
    const faceX = 44;
    const faceY = 16;
    const faceW = 40;
    const faceH = 32;

    // Base Face Shape
    ctx.fillStyle = skinTone || (isFemale ? '#fed7aa' : '#fbcfe8');
    ctx.fillRect(faceX, faceY, faceW, faceH);

    // Chin & Neck Shadow
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(faceX, faceY + faceH - 4, faceW, 4);

    if (isFemale) {
      // Female Eyes (Warm Brown/Amber with White Highlight & Eyelashes)
      ctx.fillStyle = '#381107'; // Eye outline / eyelashes
      ctx.fillRect(48, 28, 10, 3);
      ctx.fillRect(70, 28, 10, 3);

      ctx.fillStyle = '#78350f'; // Iris
      ctx.fillRect(50, 30, 8, 8);
      ctx.fillRect(72, 30, 8, 8);

      ctx.fillStyle = '#ffffff'; // Sparkle highlight
      ctx.fillRect(50, 30, 3, 3);
      ctx.fillRect(72, 30, 3, 3);

      // Soft Cheek Blush
      ctx.fillStyle = '#f87171';
      ctx.fillRect(48, 38, 6, 3);
      ctx.fillRect(74, 38, 6, 3);

      // Soft Smile
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(60, 41, 8, 2);

      // Female Hair (Auburn/Reddish Center-Parted Hair with Side Braid)
      ctx.fillStyle = hairColor || '#b45309';
      // Crown & Bangs
      ctx.fillRect(40, 10, 48, 14);
      ctx.fillRect(38, 18, 10, 24);
      ctx.fillRect(80, 18, 10, 24);

      // Side Braid (falling over chest on right side)
      ctx.fillRect(76, 38, 12, 10);
      ctx.fillRect(78, 48, 10, 10);
      ctx.fillRect(80, 58, 8, 12);

      // Hair Highlights
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(46, 12, 20, 4);
    } else {
      // Male Eyes & Eyebrows (Strong Hero Expression)
      ctx.fillStyle = '#381107'; // Eyebrows
      ctx.fillRect(48, 26, 10, 3);
      ctx.fillRect(70, 26, 10, 3);

      ctx.fillStyle = '#1e293b'; // Iris
      ctx.fillRect(50, 29, 8, 8);
      ctx.fillRect(72, 29, 8, 8);

      ctx.fillStyle = '#ffffff'; // Eye highlight
      ctx.fillRect(50, 29, 3, 3);
      ctx.fillRect(72, 29, 3, 3);

      // Confident Smile
      ctx.fillStyle = '#451a03';
      ctx.fillRect(60, 40, 10, 2);

      // Male Hair (Tousled Brown Hero Layered Hair)
      ctx.fillStyle = hairColor || '#652b19';
      // Top Volume
      ctx.fillRect(40, 8, 48, 16);
      ctx.fillRect(36, 16, 12, 22);
      ctx.fillRect(80, 16, 12, 22);
      // Front Bangs
      ctx.fillRect(52, 16, 10, 10);
      ctx.fillRect(66, 16, 10, 10);

      // Hair Highlights
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(48, 10, 18, 4);
    }

    // --- HEADWEAR ITEM ---
    const head = (equipped?.head || '').toLowerCase();
    if (head.includes('crown') || head.includes('👑')) {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(40, 4, 48, 14);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(60, 4, 8, 6);
    } else if (head.includes('helm') || head.includes('🪖')) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(38, 8, 52, 20);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(38, 20, 52, 4);
    }

    // --- WEAPON (Right Hand 16-Bit Asset) ---
    const weapon = (equipped?.weapon || '').toLowerCase();
    ctx.fillStyle = '#e2e8f0';
    if (weapon.includes('staff') || weapon.includes('🪄')) {
      // Magic Staff
      ctx.fillStyle = '#78350f';
      ctx.fillRect(100, 16, 6, 90);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(103, 16, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (weapon.includes('axe') || weapon.includes('🪓')) {
      // Golden Axe
      ctx.fillStyle = '#78350f';
      ctx.fillRect(98, 24, 8, 80);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(86, 20, 32, 24);
    } else {
      // Steel Blade Sword
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(98, 16, 8, 70);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 16, 4, 66);
      // Crossguard
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(88, 84, 28, 8);
      ctx.fillRect(100, 92, 4, 16);
    }

    // --- SHIELD (Left Hand 16-Bit Asset) ---
    const shield = (equipped?.shield || '').toLowerCase();
    if (shield || isWarrior) {
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(14, 52, 24, 38);
      ctx.fillStyle = '#f59e0b';
      ctx.strokeRect(14, 52, 24, 38);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(22, 64, 8, 14);
    }
  });

  jpegCache[cacheKey] = jpegUrl;
  return jpegUrl;
}

// ============================================================================
// 2. 16-BIT PET SPRITE JPEG GENERATOR
// ============================================================================
export function getPet16BitJpeg(petCodeOrEmoji: string): string {
  const cacheKey = `pet_16bit_${petCodeOrEmoji}`;
  if (jpegCache[cacheKey]) return jpegCache[cacheKey];

  const w = 128;
  const h = 128;

  const jpegUrl = createJpegAsset(w, h, (ctx) => {
    const code = petCodeOrEmoji.toLowerCase();
    const isDragon = code.includes('dragon') || code.includes('🐉') || code.includes('🐲');
    const isCat = code.includes('cat') || code.includes('🐱') || code.includes('👾');
    const isDog = code.includes('dog') || code.includes('🐶') || code.includes('🐺');
    const isFox = code.includes('fox') || code.includes('🦊');
    const isPanda = code.includes('panda') || code.includes('🐼');
    const isUnicorn = code.includes('unicorn') || code.includes('🦄');

    // Aura Background
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, 55);
    bgGrad.addColorStop(
      0,
      isDragon
        ? '#064e3b'
        : isCat
        ? '#7c2d12'
        : isDog
        ? '#78350f'
        : isUnicorn
        ? '#581c87'
        : '#0f172a'
    );
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Frame
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // Ground Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 18, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body rendering
    if (isDragon) {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(32, 40, 64, 56);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(48, 56, 32, 32);
      // Wings & Horns
      ctx.fillStyle = '#facc15';
      ctx.fillRect(40, 24, 12, 20);
      ctx.fillRect(76, 24, 12, 20);
      ctx.fillStyle = '#047857';
      ctx.fillRect(16, 36, 20, 30);
      ctx.fillRect(92, 36, 20, 30);
    } else if (isFox) {
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(32, 36, 64, 60);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(48, 64, 32, 32);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(32, 20, 16, 20);
      ctx.fillRect(80, 20, 16, 20);
    } else if (isCat) {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(32, 36, 64, 60);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(44, 60, 40, 36);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(32, 20, 16, 20);
      ctx.fillRect(80, 20, 16, 20);
    } else if (isPanda) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(32, 36, 64, 60);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(32, 20, 20, 20);
      ctx.fillRect(76, 20, 20, 20);
      ctx.fillRect(40, 48, 16, 16);
      ctx.fillRect(72, 48, 16, 16);
    } else {
      // Default Chinchilla / Pet Companion
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(32, 36, 64, 60);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(48, 56, 32, 36);
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(36, 20, 16, 20);
      ctx.fillRect(76, 20, 16, 20);
    }

    // Expressive Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(44, 48, 12, 12);
    ctx.fillRect(72, 48, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(44, 48, 4, 4);
    ctx.fillRect(72, 48, 4, 4);

    // Cute Nose/Mouth
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(60, 60, 8, 6);
  });

  jpegCache[cacheKey] = jpegUrl;
  return jpegUrl;
}

// ============================================================================
// 3. 16-BIT BOSS SPRITE JPEG GENERATOR
// ============================================================================
export function getBoss16BitJpeg(bossNameOrEmoji: string): string {
  const cacheKey = `boss_16bit_${bossNameOrEmoji}`;
  if (jpegCache[cacheKey]) return jpegCache[cacheKey];

  const w = 160;
  const h = 160;

  const jpegUrl = createJpegAsset(w, h, (ctx) => {
    const name = bossNameOrEmoji.toLowerCase();
    const isDragon = name.includes('дракон') || name.includes('dragon') || name.includes('🐉');
    const isKraken = name.includes('кракен') || name.includes('kraken') || name.includes('🐙');
    const isReaper = name.includes('жнец') || name.includes('reaper') || name.includes('💀');

    // Fiery Boss Background
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 75);
    bgGrad.addColorStop(0, '#7f1d1d');
    bgGrad.addColorStop(0.6, '#450a0a');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Fiery Border
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    // Boss Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 20, 50, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isDragon) {
      // Shadow Dragon
      ctx.fillStyle = '#991b1b';
      // Bat Wings
      ctx.fillRect(10, 30, 40, 50);
      ctx.fillRect(110, 30, 40, 50);
      // Body
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(40, 40, 80, 80);
      // Fiery Eyes
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(52, 56, 20, 16);
      ctx.fillRect(88, 56, 20, 16);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(58, 60, 10, 10);
      ctx.fillRect(94, 60, 10, 10);
      // Breath Flames
      ctx.fillStyle = '#f97316';
      ctx.fillRect(60, 96, 40, 30);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(68, 102, 24, 20);
    } else if (isKraken) {
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(30, 30, 100, 70);
      // Tentacles
      ctx.fillRect(10, 80, 20, 60);
      ctx.fillRect(40, 90, 20, 50);
      ctx.fillRect(100, 90, 20, 50);
      ctx.fillRect(130, 80, 20, 60);
      // Eyes
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(48, 48, 20, 20);
      ctx.fillRect(92, 48, 20, 20);
    } else if (isReaper) {
      // Shadow Reaper
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(30, 20, 100, 110);
      // Skull
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(50, 36, 60, 50);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(60, 48, 14, 16);
      ctx.fillRect(86, 48, 14, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(64, 52, 6, 8);
      ctx.fillRect(90, 52, 6, 8);
    } else {
      // General Goblin Sock King
      ctx.fillStyle = '#166534';
      ctx.fillRect(40, 36, 80, 84);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(50, 16, 60, 24); // Crown
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(52, 50, 18, 18);
      ctx.fillRect(90, 50, 18, 18);
    }
  });

  jpegCache[cacheKey] = jpegUrl;
  return jpegUrl;
}

// ============================================================================
// 4. 32-BIT HD-2D ENVIRONMENT BACKGROUND JPEG GENERATOR (TAVERN & DUNGEON)
// ============================================================================
export function getEnvironment16BitJpeg(bgCodeOrTitle: string): string {
  const cacheKey = `env_32bit_hd2d_${bgCodeOrTitle}`;
  if (jpegCache[cacheKey]) return jpegCache[cacheKey];

  const w = 512;
  const h = 288; // 16:9 HD ratio for realistic tavern interior depth

  const jpegUrl = createJpegAsset(w, h, (ctx) => {
    const bg = (bgCodeOrTitle || '').toLowerCase();

    // Default or Tavern / House HD-2D Cozy Interior
    if (!bg || bg.includes('tavern') || bg.includes('house') || bg.includes('home') || bg.includes('room') || bg.includes('🏠')) {
      // 1. Back Wall - Warm Dark Wood Planks & Stone Trim
      const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      wallGrad.addColorStop(0, '#1c130d');
      wallGrad.addColorStop(0.5, '#2e1c12');
      wallGrad.addColorStop(1, '#1a110b');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, 0, w, h * 0.65);

      // Vertical Wood Planks
      ctx.strokeStyle = '#120b07';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h * 0.65);
        ctx.stroke();
      }

      // Wooden Beam Ceiling Trim
      ctx.fillStyle = '#170c06';
      ctx.fillRect(0, 0, w, 24);
      ctx.fillStyle = '#3d200f';
      ctx.fillRect(0, 24, w, 6);

      // 2. Stone Fireplace Hearth (Left Center)
      const fireX = 110;
      const fireY = 40;
      // Stone Structure
      ctx.fillStyle = '#334155';
      ctx.fillRect(fireX, fireY, 80, 110);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(fireX + 8, fireY + 8, 64, 94);

      // Fire Inner Chimney
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(fireX + 20, fireY + 40, 40, 60);

      // Glowing Hearth Fire
      const fireGlow = ctx.createRadialGradient(fireX + 40, fireY + 75, 5, fireX + 40, fireY + 75, 90);
      fireGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      fireGlow.addColorStop(0.3, 'rgba(249, 115, 22, 0.8)');
      fireGlow.addColorStop(0.7, 'rgba(185, 28, 28, 0.4)');
      fireGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fireGlow;
      ctx.fillRect(fireX - 60, fireY - 10, 200, 180);

      // Fire Flames
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(fireX + 28, fireY + 95);
      ctx.lineTo(fireX + 40, fireY + 55);
      ctx.lineTo(fireX + 52, fireY + 95);
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(fireX + 32, fireY + 95);
      ctx.lineTo(fireX + 40, fireY + 65);
      ctx.lineTo(fireX + 48, fireY + 95);
      ctx.fill();

      // 3. Arched Tavern Window (Right)
      const winX = 360;
      const winY = 50;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(winX - 4, winY - 4, 68, 88);
      ctx.fillStyle = '#fef3c7'; // Daylight glow
      ctx.fillRect(winX, winY, 60, 80);

      // Window Frame Bars
      ctx.fillStyle = '#451a03';
      ctx.fillRect(winX + 28, winY, 4, 80);
      ctx.fillRect(winX, winY + 40, 60, 4);

      // Outside landscape in window
      ctx.fillStyle = '#15803d';
      ctx.fillRect(winX, winY + 50, 60, 30);

      // 4. Wall Shelves & Furniture (Cainos style)
      ctx.fillStyle = '#451a03';
      ctx.fillRect(310, 90, 40, 6);
      ctx.fillRect(310, 120, 40, 6);
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(316, 76, 10, 14);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(332, 106, 10, 14);

      // 5. Wooden Plank Flooring
      const floorY = h * 0.62;
      const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
      floorGrad.addColorStop(0, '#382012');
      floorGrad.addColorStop(1, '#170c06');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, floorY, w, h - floorY);

      // Floor Planks Perspective
      ctx.strokeStyle = '#120a05';
      ctx.lineWidth = 2;
      for (let y = floorY; y < h; y += 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 6. Woven Rug (Center Floor)
      const rugX = 180;
      const rugY = floorY + 10;
      const rugW = 280;
      const rugH = 75;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(rugX, rugY, rugW, rugH);
      ctx.fillStyle = '#fef08a';
      ctx.strokeRect(rugX + 4, rugY + 4, rugW - 8, rugH - 8);

      // Ambient Lighting Vignette
      const ambientGlow = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, 260);
      ambientGlow.addColorStop(0, 'rgba(0,0,0,0)');
      ambientGlow.addColorStop(1, 'rgba(8, 5, 3, 0.75)');
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    if (bg.includes('arena') || bg.includes('dungeon') || bg.includes('boss') || bg.includes('⚔')) {
      // Dark Boss Dungeon Raid Arena
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#450a0a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Massive Stone Columns
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(30, 0, 50, h);
      ctx.fillRect(w - 80, 0, 50, h);

      // Column Highlights
      ctx.fillStyle = '#334155';
      ctx.fillRect(35, 0, 10, h);
      ctx.fillRect(w - 75, 0, 10, h);

      // Glowing Lava / Magic Pit at Floor
      const lavaY = h * 0.7;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, lavaY, w, h - lavaY);

      const lavaGrad = ctx.createLinearGradient(0, lavaY, 0, h);
      lavaGrad.addColorStop(0, '#ef4444');
      lavaGrad.addColorStop(0.5, '#b91c1c');
      lavaGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = lavaGrad;
      ctx.fillRect(0, lavaY + 20, w, h - lavaY - 20);

      // Lava Spark Particles
      ctx.fillStyle = '#fef08a';
      for (let i = 0; i < 20; i++) {
        const px = (i * 27) % w;
        const py = lavaY + (i * 7) % 50;
        ctx.fillRect(px, py, 4, 4);
      }

      // Torches on Columns
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.arc(55, 100, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w - 55, 100, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath(); ctx.arc(55, 100, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w - 55, 100, 6, 0, Math.PI * 2); ctx.fill();
      return;
    }

    if (bg.includes('forest') || bg.includes('🌲')) {
      // Enchanted Forest 32-bit HD
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#064e3b');
      grad.addColorStop(0.5, '#022c22');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#047857';
      ctx.beginPath();
      ctx.moveTo(60, 200); ctx.lineTo(120, 80); ctx.lineTo(180, 200); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(320, 210); ctx.lineTo(390, 70); ctx.lineTo(460, 210); ctx.fill();

      ctx.fillStyle = '#065f46';
      ctx.fillRect(0, 190, w, h - 190);
      return;
    }

    if (bg.includes('castle') || bg.includes('🏰')) {
      // Medieval Castle Hall 32-bit HD
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(0.7, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#334155';
      ctx.fillRect(40, 0, 80, h);
      ctx.fillRect(392, 0, 80, h);

      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.arc(80, 100, 20, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(432, 100, 20, 0, Math.PI * 2); ctx.fill();
      return;
    }

    // Default RPG Night / Dungeon
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 190, w, h - 190);
  });

  jpegCache[cacheKey] = jpegUrl;
  return jpegUrl;
}

export function getItem16BitJpeg(itemCodeOrEmoji: string): string {
  const cacheKey = `item_16bit_${itemCodeOrEmoji}`;
  if (jpegCache[cacheKey]) return jpegCache[cacheKey];

  const w = 64;
  const h = 64;

  const jpegUrl = createJpegAsset(w, h, (ctx) => {
    // Backdrop glow
    ctx.fillStyle = 'rgba(79, 70, 229, 0.15)'; // indigo-600/15
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 24, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawPixel = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * 4, y * 4, 4, 4);
    };

    const str = itemCodeOrEmoji.toLowerCase();
    
    ctx.save();
    ctx.translate(w/2 - 16, h/2 - 16); // Center the 8x8 pixel grid (8*4=32, so -16)
    
    if (str.includes('🗡') || str.includes('sword') || str.includes('axe') || str.includes('⚔')) {
      // Draw sword
      for(let i=0; i<6; i++) drawPixel(i+2, 5-i, '#94a3b8'); // blade
      drawPixel(2, 6, '#e2e8f0'); // highlight
      drawPixel(3, 5, '#e2e8f0');
      drawPixel(4, 4, '#e2e8f0');
      drawPixel(1, 6, '#cbd5e1'); // tip
      drawPixel(0, 7, '#475569'); // guard
      drawPixel(1, 8, '#475569'); 
      drawPixel(2, 7, '#475569'); 
      drawPixel(0, 8, '#b45309'); // handle
    } else if (str.includes('🛡') || str.includes('shield')) {
      // Draw shield
      for(let y=1; y<7; y++) {
        for(let x=2; x<7; x++) {
          if (y===6 && (x===2 || x===6)) continue;
          if (y===5 && (x===2 || x===6)) continue;
          drawPixel(x, y, '#cbd5e1');
        }
      }
      drawPixel(3, 2, '#3b82f6');
      drawPixel(5, 2, '#3b82f6');
      drawPixel(4, 4, '#3b82f6');
    } else if (str.includes('🧢') || str.includes('hat') || str.includes('helm') || str.includes('crown') || str.includes('👑') || str.includes('🎩') || str.includes('🪖')) {
      // Draw headgear
      for(let x=2; x<7; x++) drawPixel(x, 4, '#eab308');
      for(let x=2; x<7; x++) drawPixel(x, 5, '#ca8a04');
      drawPixel(2, 3, '#eab308'); drawPixel(4, 3, '#eab308'); drawPixel(6, 3, '#eab308');
      drawPixel(2, 2, '#ef4444'); drawPixel(4, 2, '#3b82f6'); drawPixel(6, 2, '#ef4444');
    } else if (str.includes('🥋') || str.includes('armor') || str.includes('robe')) {
      // Draw body armor
      for(let y=2; y<7; y++) {
        for(let x=2; x<7; x++) {
          drawPixel(x, y, '#64748b');
        }
      }
      drawPixel(2, 2, 'transparent'); drawPixel(6, 2, 'transparent');
      drawPixel(4, 2, '#94a3b8');
      drawPixel(3, 4, '#cbd5e1'); drawPixel(5, 4, '#cbd5e1');
    } else if (str.includes('🧥') || str.includes('cloak')) {
      // Draw cloak
      for(let y=1; y<8; y++) {
        for(let x=1; x<8; x++) {
          drawPixel(x, y, '#7c3aed');
        }
      }
      drawPixel(1,1,'transparent'); drawPixel(7,1,'transparent');
    } else if (str.includes('🪄') || str.includes('staff') || str.includes('🔮')) {
      // Draw staff
      for(let i=1; i<7; i++) drawPixel(i, 7-i, '#92400e');
      drawPixel(6, 1, '#a855f7');
      drawPixel(7, 0, '#c084fc');
      drawPixel(5, 0, '#c084fc');
      drawPixel(7, 2, '#c084fc');
    } else if (str.includes('💍') || str.includes('ring') || str.includes('⭐') || str.includes(' accessory')) {
      // Draw ring
      drawPixel(3, 3, '#eab308'); drawPixel(4, 3, '#eab308'); drawPixel(5, 3, '#eab308');
      drawPixel(3, 5, '#eab308'); drawPixel(4, 5, '#eab308'); drawPixel(5, 5, '#eab308');
      drawPixel(2, 4, '#eab308'); drawPixel(6, 4, '#eab308');
      drawPixel(4, 2, '#60a5fa');
    } else if (str.includes('🐎') || str.includes('mount')) {
       // Draw mount
       for(let x=2; x<7; x++) { drawPixel(x, 4, '#a16207'); drawPixel(x, 5, '#a16207'); }
       drawPixel(2, 6, '#a16207'); drawPixel(6, 6, '#a16207');
       drawPixel(6, 3, '#a16207'); drawPixel(7, 3, '#a16207');
    } else {
      // Default: mysterious orb
      for(let y=2; y<6; y++) {
        for(let x=2; x<6; x++) {
          drawPixel(x, y, '#10b981');
        }
      }
      drawPixel(3, 3, '#6ee7b7');
      drawPixel(2, 2, 'transparent'); drawPixel(5, 2, 'transparent');
      drawPixel(2, 5, 'transparent'); drawPixel(5, 5, 'transparent');
    }
    
    ctx.restore();

    // Pixel-art blocky overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < w; i += 4) {
      for (let j = 0; j < h; j += 4) {
        if (Math.random() > 0.5) ctx.fillRect(i, j, 4, 4);
      }
    }
  });

  jpegCache[cacheKey] = jpegUrl;
  return jpegUrl;
}
