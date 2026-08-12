import { User, Pet } from '../types';
import { AvatarLayer } from '../components/LayeredAvatar';
import { getCharacter16BitJpeg } from './rpg16bitAssets';

export function get32BitAvatarLayers(
  user: User, 
  equippedUrls: Record<string, string>, 
  activePet?: Pet | null
): AvatarLayer[] {
  const layers: AvatarLayer[] = [];

  // Base 32-Bit Character Asset (custom avatar PNG or gender-based static PNG or procedural fallback)
  const defaultAvatar = user.gender === 'female' ? '/avatars/hero_female.png' : '/avatars/hero_male.png';
  const baseUrl = user.custom_avatar_url || defaultAvatar || getCharacter16BitJpeg(
    user.class || 'warrior',
    user.gender || 'male',
    user.color || '',
    user.skin_tone || '',
    user.hair_style || '',
    user.equipped
  );

  layers.push({
    url: baseUrl,
    zIndex: 10,
    type: 'body'
  });

  // Pet Layer (Behind or beside character)
  if (activePet) {
    const petUrl = activePet.sprite_sheet_url || activePet.imageUrl;
    if (petUrl) {
      layers.push({
        url: petUrl,
        zIndex: 5,
        type: 'pet'
      });
    }
  }

  // Clothing / Armor overlay
  if (equippedUrls.body) {
    layers.push({
      url: equippedUrls.body,
      zIndex: 20,
      type: 'armor'
    });
  }

  // Helmet / Head overlay
  if (equippedUrls.head) {
    layers.push({
      url: equippedUrls.head,
      zIndex: 30,
      type: 'helmet'
    });
  }

  // Weapon overlay
  if (equippedUrls.weapon) {
    layers.push({
      url: equippedUrls.weapon,
      zIndex: 40,
      type: 'weapon'
    });
  }

  return layers;
}

