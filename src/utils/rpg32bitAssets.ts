import { User, Pet } from '../types';
import { AvatarLayer } from '../components/LayeredAvatar';
import {
  BODY_BASES,
  HAIR_ASSETS,
  HEADGEAR_ASSETS,
  TORSO_ASSETS,
  LEGS_ASSETS,
  SHOES_ASSETS,
  WEAPON_ASSETS,
  SHIELD_ASSETS,
  CLOAK_ASSETS,
  Z_INDEX,
  getAssetUrl,
  EmotionType,
} from './rpg32bitCatalog';

/**
 * Сборка слоёв 32-bit аватара по LPC-стандарту.
 *
 * ВАЖНО (LPC): базовое тело (lpc_body_male.png и т.д.) УЖЕ содержит
 * голову, лицо, руки и ноги — это ОДИН спрайт. Поэтому:
 * - тело добавляется ОДИН раз (слой body)
 * - НЕ добавляем отдельные legs/head/face (дублирование!)
 * - одежда (shirt/pants/shoes) рисуется ПОВЕРХ тела
 * - волосы/шлем — поверх головы
 * - оружие/щит — поверх всего
 * - эмоции рисуются ПРОГРАММНО в LayeredAvatar (слой face с emotion)
 */
export function get32BitAvatarLayers(
  user: User,
  equippedUrls: Record<string, string>,
  activePet?: Pet | null,
  emotion: EmotionType = 'neutral'
): AvatarLayer[] {
  const layers: AvatarLayer[] = [];

  const gender: 'male' | 'female' = user.gender === 'female' ? 'female' : 'male';

  // ============================================================
  // Z 5   Задний слой: плащ/колчан (back)
  // ============================================================
  const cloakKey = equippedUrls.cloak || user.equipped?.cloak || '';
  const cloakUrl = cloakKey
    ? (getAssetUrl('cloak', cloakKey) || CLOAK_ASSETS.quiver || cloakKey)
    : null;
  if (cloakUrl) {
    layers.push({ url: cloakUrl, zIndex: Z_INDEX.back, type: 'back' });
  }

  // ============================================================
  // Z 15  БАЗОВОЕ ТЕЛО (body) — ОДИН раз! Содержит голову/руки/ноги
  // ============================================================
  const baseBodyUrl = BODY_BASES[gender];
  if (baseBodyUrl) {
    layers.push({ url: baseBodyUrl, zIndex: Z_INDEX.body, type: 'body' });
  }

  // ============================================================
  // Z 25  Одежда верх (shirt/armor) — поверх торса
  // ============================================================
  const shirtKey = equippedUrls.body || user.equipped?.body || '';
  const shirtUrl = shirtKey
    ? (getAssetUrl('torso', shirtKey) || TORSO_ASSETS[shirtKey] || null)
    : null;
  if (shirtUrl) {
    layers.push({ url: shirtUrl, zIndex: Z_INDEX.shirt, type: 'shirt' });
  }

  // ============================================================
  // Z 30  Одежда низ (pants/skirt)
  // ============================================================
  const pantsKey = user.equipped?.body && LEGS_ASSETS[user.equipped.body]
    ? user.equipped.body
    : 'pants_greenish';
  const pantsUrl = getAssetUrl('legs', pantsKey) || LEGS_ASSETS.pants_greenish;
  if (pantsUrl) {
    layers.push({ url: pantsUrl, zIndex: Z_INDEX.pants, type: 'pants' });
  }

  // ============================================================
  // Z 35  Обувь (shoes/boots)
  // ============================================================
  const shoesUrl = SHOES_ASSETS.shoes_brown;
  if (shoesUrl) {
    layers.push({ url: shoesUrl, zIndex: Z_INDEX.shoes, type: 'shoes' });
  }

  // ============================================================
  // Z 55  Волосы (hair) — ОДИН слой поверх головы
  // ============================================================
  const hairUrl = HAIR_ASSETS.blonde;
  if (hairUrl) {
    layers.push({ url: hairUrl, zIndex: Z_INDEX.back_hair, type: 'back_hair' });
  }

  // ============================================================
  // Z 50  Лицо (face) — ПРОГРАММНЫЕ эмоции поверх лица
  // ============================================================
  if (emotion !== 'neutral') {
    layers.push({
      url: '', // пустой URL — LayeredAvatar рисует эмоции программно
      zIndex: Z_INDEX.face,
      type: 'face',
      emotion,
    });
  }

  // ============================================================
  // Z 65  Головной убор (hat/helmet)
  // ============================================================
  const hatKey = equippedUrls.head || user.equipped?.head || '';
  const hatUrl = hatKey
    ? (getAssetUrl('headgear', hatKey) || HEADGEAR_ASSETS[hatKey] || null)
    : null;
  if (hatUrl) {
    layers.push({ url: hatUrl, zIndex: Z_INDEX.hat, type: 'hat' });
  }

  // ============================================================
  // Z 70  Щит (shield)
  // ============================================================
  const shieldKey = equippedUrls.shield || user.equipped?.shield || '';
  const shieldUrl = shieldKey
    ? (getAssetUrl('shield', shieldKey) || SHIELD_ASSETS[shieldKey] || null)
    : null;
  if (shieldUrl) {
    layers.push({ url: shieldUrl, zIndex: Z_INDEX.shield, type: 'shield' });
  }

  // ============================================================
  // Z 75/80  Оружие (back_weapon для лука, front_weapon для остального)
  // ============================================================
  const weaponKey = equippedUrls.weapon || user.equipped?.weapon || '';
  const weaponUrl = weaponKey
    ? (getAssetUrl('weapon', weaponKey) || WEAPON_ASSETS[weaponKey] || null)
    : null;
  if (weaponUrl) {
    const isBow = weaponKey.includes('bow') || weaponKey.includes('arrow');
    layers.push({
      url: weaponUrl,
      zIndex: isBow ? Z_INDEX.back_weapon : Z_INDEX.front_weapon,
      type: isBow ? 'back_weapon' : 'front_weapon',
      scale: isBow ? 1.3 : 1.0,
      offsetY: isBow ? -5 : 0,
    });
  }

  // ============================================================
  // Z 85  Эффекты (aura/particles)
  // ============================================================
  const accessoryKey = equippedUrls.accessory || user.equipped?.accessory || '';
  if (accessoryKey) {
    layers.push({
      url: accessoryKey,
      zIndex: Z_INDEX.effect,
      type: 'effect',
    });
  }

  // ============================================================
  // Питомец — отдельный объект сцены (по APPROVED_SPEC Z90).
  // Для обратной совместимости — опционально как слой.
  // ============================================================
  if (activePet) {
    const petUrl = activePet.sprite_sheet_url || activePet.imageUrl;
    if (petUrl) {
      layers.push({ url: petUrl, zIndex: 90, type: 'pet', scale: 0.5, offsetY: 10 });
    }
  }

  return layers;
}
