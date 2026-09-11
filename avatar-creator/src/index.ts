import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initializeDatabase, getDb } from './db/database.js';
import { 
  createAvatar, 
  updateAvatar, 
  getAvatar, 
  listAvatars, 
  deleteAvatar 
} from './services/avatarService.js';
import { 
  uploadKnowledgeBase, 
  listKnowledgeBases,
  deleteKnowledgeBase 
} from './services/knowledgeBaseService.js';
import { 
  generateEmbedCode, 
  validateEmbedRequest 
} from './services/embedService.js';
import { 
  authenticateToken, 
  generateAuthToken 
} from './middleware/auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'https://firstreceive.com', 'https://*.firstreceive.com'],
  credentials: true
}));

// Upload configuration
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadDir, req.body.userId || 'temp');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/plain',
      'application/pdf',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// =====================
// AUTH ENDPOINTS
// =====================

/**
 * POST /api/auth/register
 * Register a new user
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = getDb();
    const existing = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const userId = uuidv4();
    const createdAt = new Date().toISOString();
    
    // In production, hash the password with bcrypt
    db.run(
      `INSERT INTO users (id, email, password, name, created_at) VALUES (?, ?, ?, ?, ?)`,
      [userId, email, password, name, createdAt]
    );

    const token = generateAuthToken(userId, email);
    res.status(201).json({ 
      userId, 
      email, 
      name, 
      token,
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDb();
    const result = db.exec(`SELECT * FROM users WHERE email = ? AND password = ?`, [email, password]);
    
    if (result.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result[0];
    const token = generateAuthToken(user.id, user.email);
    
    res.json({ 
      userId: user.id,
      email: user.email,
      name: user.name,
      token,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// =====================
// AVATAR ENDPOINTS
// =====================

/**
 * POST /api/avatars
 * Create a new avatar with configuration
 */
app.post('/api/avatars', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, description, systemPrompt, voiceId, avatarId } = req.body;

    if (!name || !avatarId) {
      return res.status(400).json({ error: 'Name and avatarId are required' });
    }

    const avatar = await createAvatar({
      userId,
      name,
      description: description || '',
      systemPrompt: systemPrompt || 'You are a helpful assistant',
      voiceId: voiceId || 'default',
      liveAvatarId: avatarId,
      embedToken: uuidv4()
    });

    res.status(201).json(avatar);
  } catch (error) {
    console.error('Avatar creation error:', error);
    res.status(500).json({ error: 'Failed to create avatar' });
  }
});

/**
 * GET /api/avatars
 * List all avatars for the authenticated user
 */
app.get('/api/avatars', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const avatars = await listAvatars(userId);
    res.json(avatars);
  } catch (error) {
    console.error('List avatars error:', error);
    res.status(500).json({ error: 'Failed to list avatars' });
  }
});

/**
 * GET /api/avatars/:avatarId
 * Get a specific avatar
 */
app.get('/api/avatars/:avatarId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatarId } = req.params;
    
    const avatar = await getAvatar(avatarId, userId);
    if (!avatar) {
      return res.status(404).json({ error: 'Avatar not found' });
    }

    res.json(avatar);
  } catch (error) {
    console.error('Get avatar error:', error);
    res.status(500).json({ error: 'Failed to get avatar' });
  }
});

/**
 * PUT /api/avatars/:avatarId
 * Update avatar configuration
 */
app.put('/api/avatars/:avatarId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatarId } = req.params;
    const { name, description, systemPrompt, voiceId } = req.body;

    const avatar = await updateAvatar(avatarId, userId, {
      name,
      description,
      systemPrompt,
      voiceId
    });

    if (!avatar) {
      return res.status(404).json({ error: 'Avatar not found' });
    }

    res.json(avatar);
  } catch (error) {
    console.error('Avatar update error:', error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

/**
 * DELETE /api/avatars/:avatarId
 * Delete an avatar
 */
app.delete('/api/avatars/:avatarId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatarId } = req.params;

    const success = await deleteAvatar(avatarId, userId);
    if (!success) {
      return res.status(404).json({ error: 'Avatar not found' });
    }

    res.json({ message: 'Avatar deleted successfully' });
  } catch (error) {
    console.error('Avatar delete error:', error);
    res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

// =====================
// KNOWLEDGE BASE ENDPOINTS
// =====================

/**
 * POST /api/avatars/:avatarId/knowledge-base
 * Upload files to avatar's knowledge base
 */
app.post('/api/avatars/:avatarId/knowledge-base', 
  authenticateToken,
  upload.array('files', 10),
  async (req, res) => {
    try {
      const { userId } = req.user;
      const { avatarId } = req.params;

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const knowledgeBase = await uploadKnowledgeBase(
        avatarId,
        userId,
        req.files as Express.Multer.File[]
      );

      res.status(201).json({
        message: 'Knowledge base files uploaded successfully',
        files: knowledgeBase
      });
    } catch (error) {
      console.error('Knowledge base upload error:', error);
      res.status(500).json({ error: 'Failed to upload knowledge base' });
    }
  }
);

/**
 * GET /api/avatars/:avatarId/knowledge-base
 * List knowledge base files for an avatar
 */
app.get('/api/avatars/:avatarId/knowledge-base', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatarId } = req.params;

    const files = await listKnowledgeBases(avatarId, userId);
    res.json(files);
  } catch (error) {
    console.error('List knowledge base error:', error);
    res.status(500).json({ error: 'Failed to list knowledge base files' });
  }
});

/**
 * DELETE /api/avatars/:avatarId/knowledge-base/:fileId
 * Delete a file from knowledge base
 */
app.delete('/api/avatars/:avatarId/knowledge-base/:fileId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatarId, fileId } = req.params;

    const success = await deleteKnowledgeBase(avatarId, fileId, userId);
    if (!success) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete knowledge base error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// =====================
// EMBED ENDPOINTS
// =====================

/**
 * GET /api/avatars/:avatarId/embed-code
 * Generate embed code for website
 */
app.get('/api/avatars/:avatarId/embed-code', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatarId } = req.params;

    const embedCode = await generateEmbedCode(avatarId, userId);
    if (!embedCode) {
      return res.status(404).json({ error: 'Avatar not found' });
    }

    res.json({ embedCode });
  } catch (error) {
    console.error('Generate embed code error:', error);
    res.status(500).json({ error: 'Failed to generate embed code' });
  }
});

/**
 * POST /api/embed/validate
 * Validate embed token (called from embedded pages)
 */
app.post('/api/embed/validate', async (req, res) => {
  try {
    const { embedToken, origin } = req.body;

    const isValid = await validateEmbedRequest(embedToken, origin);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid embed token or origin' });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Embed validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// =====================
// HEALTH CHECK
// =====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================
// ERROR HANDLING
// =====================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// =====================
// START SERVER
// =====================

async function start() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Avatar Creator API running on http://localhost:${PORT}`);
      console.log(`📚 Database initialized`);
      console.log(`🔐 JWT_SECRET configured (change in production!)`);
      console.log('\nEndpoints ready:');
      console.log('  Auth: POST /api/auth/register, /api/auth/login');
      console.log('  Avatars: GET/POST /api/avatars, PUT/DELETE /api/avatars/:id');
      console.log('  Knowledge: POST/GET /api/avatars/:id/knowledge-base');
      console.log('  Embed: GET /api/avatars/:id/embed-code, POST /api/embed/validate');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
