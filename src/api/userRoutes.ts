/**
 * Роуты пользователей.
 * POST /class — установить класс персонажа.
 * POST /gender — установить пол.
 * POST /update-character — кастомизация (тон, причёска, глаза, ава).
 * POST /custom-background — пользовательский фон.
 * POST /custom-avatar — URL аватара.
 * POST /reset — сброс прогресса.
 * POST /register — регистрация нового героя.
 *
 * Примечание: /api/user/reset из оригинала перенесён в /api/users/reset
 * для единообразия путей (был единственным роутом с единственным числом).
 */
import { Request, Response, Router } from 'express';
import { db } from '../db';
import * as schema from '../db/schema';
import { appState } from '../services/stateService';
import { persistProfile } from '../services/userService';
import { processReferral } from '../services/referralService';
import type { ShopItem, User } from '../types';

export const userRoutes = Router();

userRoutes.post('/class', (req: Request, res: Response) => {
  const { userId, className } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.class = className;
  // Сохранить профиль в БД
  persistProfile(user);

  res.json({ success: true, user });
});

userRoutes.post('/gender', (req: Request, res: Response) => {
  const { userId, gender } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.gender = gender === 'female' ? 'female' : 'male';
  // Сохранить профиль в БД
  persistProfile(user);

  res.json({ success: true, user });
});

userRoutes.post('/update-character', (req: Request, res: Response) => {
  const { userId, gender, character_color, skin_tone, hair_style, hair_color, eye_color, custom_avatar_url } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (gender) user.gender = gender;
  if (character_color) user.character_color = character_color;
  if (skin_tone) user.skin_tone = skin_tone;
  if (hair_style) user.hair_style = hair_style;
  if (hair_color) user.hair_color = hair_color;
  if (eye_color) user.eye_color = eye_color;
  if (custom_avatar_url !== undefined) user.custom_avatar_url = custom_avatar_url;
  // Сохранить профиль в БД
  persistProfile(user);

  res.json({ success: true, user });
});

userRoutes.post('/custom-background', (req: Request, res: Response) => {
  const { userId, bgUrl } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  // Create a custom background item in shop, then own & equip it
  const newBackgroundId = appState.shopItems.length + 1000 + Math.floor(Math.random() * 9000);
  const newBgItem: ShopItem = {
    id: newBackgroundId,
    code: bgUrl,
    title: 'Пользовательский Фон',
    emoji: '🎨',
    slot: 'background',
    cost: 0,
  };

  appState.shopItems.push(newBgItem);

  // Unequip current backgrounds for user
  for (const ui of appState.userItems) {
    if (ui.user_id === user.id && ui.equipped) {
      const item = appState.shopItems.find((s) => s.id === ui.item_id);
      if (item && item.slot === 'background') {
        ui.equipped = 0;
      }
    }
  }

  // Add and equip
  appState.userItems.push({
    user_id: user.id,
    item_id: newBackgroundId,
    equipped: 1,
  });

  res.json({ success: true, message: 'Установлен новый AI фон !' });
});

userRoutes.post('/custom-avatar', (req: Request, res: Response) => {
  const { userId, avatarUrl } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  user.custom_avatar_url = avatarUrl;
  // Сохранить профиль в БД
  persistProfile(user);

  res.json({ success: true, message: 'Аватар успешно обновлён!' });
});

userRoutes.post('/reset', (req: Request, res: Response) => {
  const { userId } = req.body;
  const user = appState.users.find((u) => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.gold = 0;
  user.xp = 0;
  user.streak = 0;
  user.skill_date = null;

  res.json({ success: true, user });
});

userRoutes.post('/register', (req: Request, res: Response) => {
  const {
    name,
    classKey = 'warrior',
    gender = 'male',
    familyCode = 'FAM-7892',
    customAvatarUrl,
    character_color,
    color,
    refCode,
  } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Укажите корректное имя пользователя' });
  }

  const trimmedName = name.trim();

  // Check name uniqueness (case-insensitive)
  const nameExists = appState.users.some(
    (u) => u.display_name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  if (nameExists) {
    return res.status(400).json({
      error: `Имя «${trimmedName}» уже занято другим героем в семье! Пожалуйста, укажите уникальное имя.`,
    });
  }

  const selectedColor = character_color || color || '#f59e0b';
  const newId = appState.users.length + 1;

  const newUser: User = {
    id: newId,
    telegram_id: 100000 + newId,
    display_name: trimmedName,
    assignee: 'both',
    gold: 50,
    xp: 0,
    crystals: 10,
    streak: 1,
    class: (classKey as any) || 'warrior',
    gender: gender === 'female' ? 'female' : 'male',
    character_color: selectedColor,
    color: selectedColor,
    hp: 50,
    max_hp: 50,
    mp: 30,
    max_mp: 30,
    custom_avatar_url: customAvatarUrl,
    skill_date: null,
    notify_partner: 1,
    equipped: {},
    pets: [],
    referral_code: `ref_${newId}`,
    referrals_count: 0,
    referral_earnings_gold: 0,
    referral_earnings_crystals: 0,
  };

  appState.users.push(newUser);

  // Update DB (async)
  db.insert(schema.users).values({
    telegram_id: newUser.telegram_id,
    family_id: 1, // hardcoded for now
    display_name: newUser.display_name,
    class_type: newUser.class,
    gold: newUser.gold,
    xp: newUser.xp,
    crystals: newUser.crystals || 0,
    hp: newUser.hp || 50,
    max_hp: newUser.max_hp || 50,
    mp: newUser.mp || 30,
    max_mp: newUser.max_mp || 30,
    streak: newUser.streak || 0,
    gender: newUser.gender,
    character_color: newUser.character_color,
    assignee: newUser.assignee,
    notify_partner: newUser.notify_partner,
    referral_code: newUser.referral_code,
    referred_by: newUser.referred_by
  }).execute().catch(e => console.error('DB Insert error (user):', e));

  // Give starter item to new user
  appState.userItems.push({
    user_id: newId,
    item_id: classKey === 'mage' ? 2 : 1, // Staff or Sword
    equipped: 1,
  });

  let referralMessage = '';
  if (refCode) {
    const refResult = processReferral(newUser, refCode);
    if (refResult.success) {
      referralMessage = refResult.message;
    }
  }

  res.json({ success: true, user: newUser, referralMessage });
});
