import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/avatars.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const dataDir = path.dirname(DB_PATH);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Using better-sqlite3 for synchronous operations
  db = new Database(DB_PATH);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS avatars (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      voice_id TEXT,
      live_avatar_id TEXT NOT NULL,
      embed_token TEXT UNIQUE NOT NULL,
      is_public BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS knowledge_base_files (
      id TEXT PRIMARY KEY,
      avatar_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      content TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (avatar_id) REFERENCES avatars(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embed_origins (
      id TEXT PRIMARY KEY,
      avatar_id TEXT NOT NULL,
      origin_url TEXT NOT NULL,
      allowed BOOLEAN DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (avatar_id) REFERENCES avatars(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      avatar_id TEXT NOT NULL,
      user_id TEXT,
      livekit_token TEXT,
      gpt_live_session_id TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (avatar_id) REFERENCES avatars(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_avatars_user_id ON avatars(user_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_base_avatar_id ON knowledge_base_files(avatar_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_avatar_id ON sessions(avatar_id);
  `);

  console.log('✅ Database initialized at:', DB_PATH);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
