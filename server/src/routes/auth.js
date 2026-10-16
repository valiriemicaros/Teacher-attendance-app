import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
})
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function publicTeacher(row) {
  return { id: row.id, full_name: row.full_name, email: row.email, created_at: row.created_at }
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve())
  })
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve())
  })
}

router.get('/csrf', (req, res) => {
  req.session.csrfToken ||= randomBytes(32).toString('hex')
  return res.json({ csrfToken: req.session.csrfToken })
})

router.post('/register', authLimiter, async (req, res) => {
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body?.password
  if (fullName.length < 1 || fullName.length > 160 || !emailPattern.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid full name and email address.' })
  }
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and no more than 128 characters.' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const teacherId = randomUUID()
  try {
    db.prepare('INSERT INTO teachers (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(teacherId, fullName, email, passwordHash)
  } catch (error) {
    if (error.code?.includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists.' })
    throw error
  }

  const teacher = db.prepare('SELECT id, full_name, email, created_at FROM teachers WHERE id = ?').get(teacherId)
  await regenerateSession(req)
  req.session.teacherId = teacherId
  req.session.csrfToken = randomBytes(32).toString('hex')
  await saveSession(req)
  return res.status(201).json({ teacher: publicTeacher(teacher), csrfToken: req.session.csrfToken })
})

router.post('/login', authLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body?.password
  if (!emailPattern.test(email) || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid email address and password.' })
  }

  const teacher = db.prepare('SELECT id, full_name, email, password_hash, created_at FROM teachers WHERE email = ? COLLATE NOCASE').get(email)
  if (!teacher || !(await bcrypt.compare(password, teacher.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }

  await regenerateSession(req)
  req.session.teacherId = teacher.id
  req.session.csrfToken = randomBytes(32).toString('hex')
  await saveSession(req)
  return res.json({ teacher: publicTeacher(teacher), csrfToken: req.session.csrfToken })
})

router.post('/logout', (req, res, next) => {
  const cookieName = req.app.get('sessionCookieName')
  req.session.destroy((error) => {
    if (error) return next(error)
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: req.app.get('env') === 'production', path: '/' })
    return res.status(204).end()
  })
})

router.get('/me', (req, res) => {
  if (!req.session.teacherId) return res.json({ teacher: null })
  const teacher = db.prepare('SELECT id, full_name, email, created_at FROM teachers WHERE id = ?').get(req.session.teacherId)
  if (!teacher) return res.json({ teacher: null })
  return res.json({ teacher: publicTeacher(teacher) })
})

router.use(requireAuth)

export default router
