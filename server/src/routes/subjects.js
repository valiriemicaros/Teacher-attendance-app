import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, name, code, created_at, updated_at FROM subjects WHERE teacher_id = ? AND archived_at IS NULL ORDER BY name COLLATE NOCASE')
    .all(req.teacherId)
  return res.json(rows)
})

router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (!name || name.length > 120 || !code || code.length > 32) {
    return res.status(400).json({ error: 'Subject name and code are required (maximum 120 and 32 characters).' })
  }
  const id = randomUUID()
  db.prepare('INSERT INTO subjects (id, teacher_id, name, code) VALUES (?, ?, ?, ?)')
    .run(id, req.teacherId, name, code)
  return res.status(201).json(db.prepare('SELECT id, name, code, created_at, updated_at FROM subjects WHERE id = ? AND teacher_id = ? AND archived_at IS NULL').get(id, req.teacherId))
})

router.put('/:id', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (!name || name.length > 120 || !code || code.length > 32) {
    return res.status(400).json({ error: 'Subject name and code are required (maximum 120 and 32 characters).' })
  }
  const result = db.prepare(`UPDATE subjects SET name = ?, code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND teacher_id = ? AND archived_at IS NULL`)
    .run(name, code, req.params.id, req.teacherId)
  if (!result.changes) return res.status(404).json({ error: 'Subject not found.' })
  return res.json(db.prepare('SELECT id, name, code, created_at, updated_at FROM subjects WHERE id = ? AND teacher_id = ? AND archived_at IS NULL').get(req.params.id, req.teacherId))
})

router.delete('/:id', (req, res) => {
  const result = db.prepare(`UPDATE subjects SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND teacher_id = ? AND archived_at IS NULL`).run(req.params.id, req.teacherId)
  if (!result.changes) return res.status(404).json({ error: 'Subject not found.' })
  return res.status(204).end()
})

export default router
