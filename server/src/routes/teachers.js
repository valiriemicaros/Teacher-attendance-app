import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/me', (req, res) => {
  const teacher = db.prepare('SELECT id, full_name, email, created_at FROM teachers WHERE id = ?').get(req.teacherId)
  if (!teacher) return res.status(404).json({ error: 'Teacher account not found.' })
  return res.json(teacher)
})

router.put('/me', (req, res) => {
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : ''
  if (!fullName || fullName.length > 160) return res.status(400).json({ error: 'Name must be between 1 and 160 characters.' })
  db.prepare(`UPDATE teachers SET full_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
    .run(fullName, req.teacherId)
  const teacher = db.prepare('SELECT id, full_name, email, created_at FROM teachers WHERE id = ?').get(req.teacherId)
  req.session.fullName = teacher.full_name
  return res.json(teacher)
})

export default router
