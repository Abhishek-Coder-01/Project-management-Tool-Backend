import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, ensureProjectMember } from '../middleware/auth.js';
import { emitProjectUpdate } from '../lib/socket.js';
import { createNotifications } from '../utils/notifications.js';
import { sanitizeUser } from '../utils/serializers.js';

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const schema = z.object({
      title: z.string().min(2),
      description: z.string().optional().default(''),
      projectId: z.string(),
      status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).default('TODO'),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
      assigneeId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional()
    });

    const data = schema.parse(req.body);
    const allowed = await ensureProjectMember(data.projectId, req.user.id);
    if (!allowed) return res.status(403).json({ message: 'No access to this project' });

    const order = await prisma.task.count({ where: { projectId: data.projectId, status: data.status } });
    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        projectId: data.projectId,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        reporterId: req.user.id,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        order
      },
      include: {
        assignee: true,
        reporter: true,
        comments: { include: { user: true } }
      }
    });

    if (task.assigneeId && task.assigneeId !== req.user.id) {
      await createNotifications([task.assigneeId], 'New task assigned', `You were assigned "${task.title}".`, {
        taskId: task.id,
        projectId: task.projectId
      });
    }

    emitProjectUpdate(task.projectId, 'task_created', task);
    return res.status(201).json({ task: { ...task, assignee: task.assignee ? sanitizeUser(task.assignee) : null, reporter: sanitizeUser(task.reporter) } });
  } catch (error) {
    return res.status(400).json({ message: error?.issues?.[0]?.message || 'Unable to create task' });
  }
});

router.patch('/:taskId', async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const allowed = await ensureProjectMember(task.projectId, req.user.id);
  if (!allowed) return res.status(403).json({ message: 'No access to this task' });

  try {
    const schema = z.object({
      title: z.string().min(2).optional(),
      description: z.string().optional(),
      status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      assigneeId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      order: z.number().int().optional()
    });
    const data = schema.parse(req.body);

    const updated = await prisma.task.update({
      where: { id: req.params.taskId },
      data: {
        ...data,
        dueDate: data.dueDate === undefined ? undefined : data.dueDate ? new Date(data.dueDate) : null,
        assigneeId: data.assigneeId === undefined ? undefined : data.assigneeId
      },
      include: {
        assignee: true,
        reporter: true,
        comments: { include: { user: true }, orderBy: { createdAt: 'asc' } }
      }
    });

    if (data.assigneeId && data.assigneeId !== req.user.id) {
      await createNotifications([data.assigneeId], 'Task updated for you', `"${updated.title}" is now ${updated.status.replace('_', ' ')}.`, {
        taskId: updated.id,
        projectId: updated.projectId
      });
    }

    emitProjectUpdate(updated.projectId, 'task_updated', updated);
    return res.json({ task: { ...updated, assignee: updated.assignee ? sanitizeUser(updated.assignee) : null, reporter: sanitizeUser(updated.reporter) } });
  } catch (error) {
    return res.status(400).json({ message: error?.issues?.[0]?.message || 'Unable to update task' });
  }
});

router.post('/:taskId/comments', async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.taskId } });
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const allowed = await ensureProjectMember(task.projectId, req.user.id);
  if (!allowed) return res.status(403).json({ message: 'No access to this task' });

  try {
    const schema = z.object({ body: z.string().min(1) });
    const data = schema.parse(req.body);

    const comment = await prisma.comment.create({
      data: {
        taskId: task.id,
        userId: req.user.id,
        body: data.body
      },
      include: { user: true }
    });

    await createNotifications(
      [task.assigneeId, task.reporterId].filter((id) => id && id !== req.user.id),
      'New task comment',
      `${req.user.name} commented on "${task.title}".`,
      { taskId: task.id, projectId: task.projectId }
    );

    emitProjectUpdate(task.projectId, 'comment_created', comment);
    return res.status(201).json({ comment: { ...comment, user: sanitizeUser(comment.user) } });
  } catch (error) {
    return res.status(400).json({ message: error?.issues?.[0]?.message || 'Unable to add comment' });
  }
});

export default router;
