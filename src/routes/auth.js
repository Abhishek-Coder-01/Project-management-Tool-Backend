import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../utils/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeUser } from '../utils/serializers.js';

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    const existing = await prisma.user.findUnique({ 
      where: { email: data.email } 
    });

    if (existing) {
      return res.status(409).json({ 
        message: 'Email already in use' 
      });
    }

    const password = await bcrypt.hash(data.password, 10);
    const palette = ['#D4A373', '#B08968', '#E9C46A', '#8AB17D', '#A06CD5'];
    
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password,
        avatarColor: palette[Math.floor(Math.random() * palette.length)]
      }
    });

    const token = signToken(user.id);
    return res.status(201).json({ 
      token, 
      user: sanitizeUser(user) 
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: error.errors[0]?.message || 'Validation failed' 
      });
    }
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        message: 'Email already in use' 
      });
    }

    // Log unexpected errors for debugging
    console.error('Registration error:', error);
    return res.status(500).json({ 
      message: 'Unable to register' 
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const loginSchema = z.object({ 
      email: z.string().trim().email('Invalid email format'), 
      password: z.string().min(1, 'Password is required') 
    });
    
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ 
      where: { email: data.email } 
    });

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid credentials' 
      });
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      return res.status(401).json({ 
        message: 'Invalid credentials' 
      });
    }

    const token = signToken(user.id);
    return res.json({ 
      token, 
      user: sanitizeUser(user) 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: error.errors[0]?.message || 'Validation failed' 
      });
    }

    console.error('Login error:', error);
    return res.status(500).json({ 
      message: 'Unable to login' 
    });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    return res.json({ 
      user: sanitizeUser(req.user) 
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ 
      message: 'Unable to fetch user data' 
    });
  }
});

export default router;