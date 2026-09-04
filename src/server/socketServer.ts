import type { Server as SocketIOServer } from 'socket.io';
import { appState } from '../services/stateService';
import { getUserFamilyId, isAuthEnforced } from '../utils/apiAuth';
import { parseInitDataUser, validateTelegramWebAppData } from '../utils/telegramAuth';

/** Подключает аутентификацию и family-scoped комнаты к Socket.IO серверу. */
export function configureSocketServer(io: SocketIOServer): void {
  io.use((socket, next) => {
    if (!isAuthEnforced()) return next();

    const initData = typeof socket.handshake.auth?.tma === 'string'
      ? socket.handshake.auth.tma
      : '';
    const botToken = process.env.BOT_TOKEN as string;
    if (!initData || !validateTelegramWebAppData(initData, botToken)) {
      return next(new Error('Unauthorized: invalid Telegram session'));
    }

    const tgUser = parseInitDataUser(initData);
    const user = tgUser
      ? appState.users.find((candidate) => candidate.telegram_id === tgUser.id)
      : undefined;
    const familyId = getUserFamilyId(user);
    if (!user || familyId === null) {
      return next(new Error('Forbidden: user has no family'));
    }

    socket.data.userId = user.id;
    socket.data.familyId = familyId;
    next();
  });

  io.on('connection', (socket) => {
    const authenticatedFamilyId = Number(socket.data.familyId);
    if (Number.isInteger(authenticatedFamilyId) && authenticatedFamilyId > 0) {
      socket.join(`family:${authenticatedFamilyId}`);
    }

    socket.on('join:family', (data: { familyId?: number }) => {
      let familyId = Number(socket.data.familyId) || null;
      if (!isAuthEnforced()) {
        const requestedFamilyId = Number(data?.familyId);
        familyId = Number.isInteger(requestedFamilyId) && requestedFamilyId > 0
          ? requestedFamilyId
          : appState.family?.id ?? null;
      }

      if (!familyId) {
        socket.emit('join:family:denied', { error: 'Forbidden: invalid session' });
        return;
      }

      socket.join(`family:${familyId}`);
      socket.data.familyId = familyId;
    });
  });
}
