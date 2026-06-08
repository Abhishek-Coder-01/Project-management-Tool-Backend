import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';
import { setIO } from './lib/socket.js';
import { verifyToken } from './utils/auth.js';
import { prisma } from './lib/prisma.js';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  return res.json({
    message: 'Server is running',
    health: '/api/health'
  });
});

app.get('/api/health', async (_req, res) => {
  const users = await prisma.user.count();
  return res.json({ ok: true, users });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST']
  }
});
setIO(io);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    const decoded = verifyToken(token);
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);

  socket.on('join-project', (projectId) => {
    socket.join(`project:${projectId}`);
  });

  socket.on('leave-project', (projectId) => {
    socket.leave(`project:${projectId}`);
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
