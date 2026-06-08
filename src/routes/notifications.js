import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return res.json({ notifications });
});

router.patch('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true }
  });
  return res.json({ success: true });
});

router.patch('/:notificationId/read', async (req, res) => {
  const notification = await prisma.notification.update({
    where: { id: req.params.notificationId },
    data: { read: true }
  });

  return res.json({ notification });
});

export default router;
