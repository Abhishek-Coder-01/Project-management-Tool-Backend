import { prisma } from '../lib/prisma.js';
import { emitUserNotification } from '../lib/socket.js';

export const createNotifications = async (userIds, title, body, metadata = null) => {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const created = [];

  for (const userId of uniqueIds) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    });
    emitUserNotification(userId, notification);
    created.push(notification);
  }

  return created;
};
