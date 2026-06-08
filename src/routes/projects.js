import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, ensureProjectMember } from '../middleware/auth.js';
import { serializeProject } from '../utils/serializers.js';
import { createNotifications } from '../utils/notifications.js';
import { emitProjectUpdate } from '../lib/socket.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { ownerId: req.user.id },
        { members: { some: { userId: req.user.id } } }
      ]
    },
    include: {
      owner: true,
      members: { include: { user: true } },
      tasks: { include: { assignee: true, reporter: true, comments: { include: { user: true } } } }
    },
    orderBy: { updatedAt: 'desc' }
  });

  return res.json({ projects: projects.map(serializeProject) });
});

router.post('/', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      description: z.string().min(10),
      visibility: z.string().default('team')
    });

    const data = schema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        ...data,
        ownerId: req.user.id,
        members: {
          create: {
            userId: req.user.id,
            role: 'owner'
          }
        }
      },
      include: {
        owner: true,
        members: { include: { user: true } },
        tasks: { include: { assignee: true, reporter: true, comments: { include: { user: true } } } }
      }
    });

    return res.status(201).json({ project: serializeProject(project) });
  } catch (error) {
    return res.status(400).json({ message: error?.issues?.[0]?.message || 'Unable to create project' });
  }
});

router.get('/:projectId', async (req, res) => {
  const allowed = await ensureProjectMember(req.params.projectId, req.user.id);
  if (!allowed) return res.status(403).json({ message: 'No access to this project' });

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      owner: true,
      members: { include: { user: true }, orderBy: { role: 'asc' } },
      tasks: {
        include: {
          assignee: true,
          reporter: true,
          comments: { include: { user: true }, orderBy: { createdAt: 'asc' } }
        },
        orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }]
      }
    }
  });

  return res.json({ project: serializeProject(project) });
});

router.post('/:projectId/members', async (req, res) => {
  const allowed = await ensureProjectMember(req.params.projectId, req.user.id);
  if (!allowed) return res.status(403).json({ message: 'No access to this project' });

  try {
    const schema = z.object({ email: z.string().email(), role: z.string().default('member') });
    const data = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) return res.status(404).json({ message: 'User not found. Ask them to sign up first.' });

    const member = await prisma.projectMember.upsert({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: req.params.projectId
        }
      },
      update: { role: data.role },
      create: {
        userId: user.id,
        projectId: req.params.projectId,
        role: data.role
      },
      include: { user: true }
    });

    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    await createNotifications([user.id], 'Added to a project', `You were added to ${project.name}.`, {
      projectId: project.id
    });
    emitProjectUpdate(req.params.projectId, 'member_added', member);

    return res.status(201).json({ member: { ...member, user: { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor, createdAt: user.createdAt } } });
  } catch (error) {
    return res.status(400).json({ message: error?.issues?.[0]?.message || 'Unable to add member' });
  }
});

export default router;
