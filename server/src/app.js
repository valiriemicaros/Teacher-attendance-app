import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import { config } from './config.js'
import { db } from './database.js'
import { SQLiteSessionStore } from './sessionStore.js'
import { requireCsrf } from './middleware/csrf.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'
import attendanceRoutes from './routes/attendance.js'
import scheduleRoutes from './routes/schedules.js'
import studentRoutes from './routes/students.js'
import subjectRoutes from './routes/subjects.js'
import teacherRoutes from './routes/teachers.js'

const app = express()
const serverDirectory = fileURLToPath(new URL('../', import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
const cookieName = 'fieldnote.sid'

function getSessionSecret() {
  const configured = process.env.SESSION_SECRET || ''
  if (configured.length >= 32 && !configured.includes('replace-with')) return configured
  if (isProduction) throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.')

  const secretPath = resolve(serverDirectory, 'data/.session-secret')
  if (existsSync(secretPath)) return readFileSync(secretPath, 'utf8').trim()
  const generated = randomBytes(48).toString('hex')
  writeFileSync(secretPath, generated, { mode: 0o600, flag: 'wx' })
  console.warn('SESSION_SECRET placeholder detected; generated a persistent development secret in server/data/.session-secret.')
  return generated
}

const sessionSecret = getSessionSecret()
const allowedOrigins = new Set(config.clientOrigins)
app.disable('x-powered-by')
app.set('sessionCookieName', cookieName)
app.locals.allowedOrigins = allowedOrigins
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'This origin is not allowed.' })
  return next()
})
app.use(cors({ origin: config.clientOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(session({
  name: cookieName,
  secret: sessionSecret,
  store: new SQLiteSessionStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  },
}))
app.use('/api', requireCsrf)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: 'sqlite' })
})
app.use('/api/auth', authRoutes)
app.use('/api/subjects', subjectRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/teachers', teacherRoutes)
app.use(notFound)
app.use(errorHandler)

export { app, db }
