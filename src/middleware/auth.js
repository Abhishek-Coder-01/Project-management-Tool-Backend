import { prisma } from '../lib/prisma.js';
import { verifyToken } from '../utils/auth.js';

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const ensureProjectMember = async (projectId, userId) => {
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId }
  });

  if (membership) return true;

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  return Boolean(project);
};
