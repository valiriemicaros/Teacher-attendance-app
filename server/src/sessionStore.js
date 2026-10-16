import session from 'express-session'
import { db } from './database.js'

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000

export class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare('SELECT session_data FROM sessions WHERE sid = ? AND expires_at > ?').get(sid, Date.now())
      callback(null, row ? JSON.parse(row.session_data) : null)
    } catch (error) {
      callback(error)
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + (value.cookie?.maxAge || DEFAULT_TTL)
      db.prepare(`
        INSERT INTO sessions (sid, expires_at, session_data) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET expires_at = excluded.expires_at, session_data = excluded.session_data
      `).run(sid, expiresAt, JSON.stringify(value))
      callback(null)
    } catch (error) {
      callback(error)
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      const expiresAt = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + (value.cookie?.maxAge || DEFAULT_TTL)
      db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?').run(expiresAt, sid)
      callback(null)
    } catch (error) {
      callback(error)
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid)
      callback(null)
    } catch (error) {
      callback(error)
    }
  }
}

const cleanupTimer = setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  } catch (error) {
    console.error('Session cleanup failed:', error.message)
  }
}, 60 * 60 * 1000)
cleanupTimer.unref()
