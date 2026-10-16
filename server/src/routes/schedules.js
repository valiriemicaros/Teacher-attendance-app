import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function validDate(value) {
  return datePattern.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

function validBody(body) {
  return typeof body?.subject_id === 'string' &&
    validDate(body?.class_date) &&
    typeof body?.room === 'string' && body.room.trim().length > 0 && body.room.trim().length <= 80 &&
    timePattern.test(body?.start_time || '') &&
    typeof body?.description === 'string' && body.description.trim().length > 0 && body.description.trim().length <= 500
}

const selectSchedule = `SELECT id, subject_id, class_date, room, start_time, description, created_at, updated_at
  FROM schedules WHERE teacher_id = ?`

router.get('/', (req, res) => {
  const { subject_id } = req.query
  const rows = subject_id
    ? db.prepare(`${selectSchedule} AND subject_id = ? ORDER BY class_date DESC, start_time`).all(req.teacherId, subject_id)
    : db.prepare(`${selectSchedule} ORDER BY class_date DESC, start_time`).all(req.teacherId)
  return res.json(rows)
})

router.post('/', (req, res) => {
  if (!validBody(req.body)) return res.status(400).json({ error: 'Subject, valid date, room, time, and description are required.' })
  const id = randomUUID()
  db.prepare('INSERT INTO schedules (id, teacher_id, subject_id, class_date, room, start_time, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.teacherId, req.body.subject_id, req.body.class_date, req.body.room.trim(), req.body.start_time, req.body.description.trim())
  return res.status(201).json(db.prepare(`${selectSchedule} AND id = ?`).get(req.teacherId, id))
})

router.put('/:id', (req, res) => {
  if (!validBody(req.body)) return res.status(400).json({ error: 'Subject, valid date, room, time, and description are required.' })
  const result = db.prepare(`UPDATE schedules SET subject_id = ?, class_date = ?, room = ?, start_time = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND teacher_id = ?`)
    .run(req.body.subject_id, req.body.class_date, req.body.room.trim(), req.body.start_time, req.body.description.trim(), req.params.id, req.teacherId)
  if (!result.changes) return res.status(404).json({ error: 'Schedule not found.' })
  return res.json(db.prepare(`${selectSchedule} AND id = ?`).get(req.teacherId, req.params.id))
})

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM schedules WHERE id = ? AND teacher_id = ?').run(req.params.id, req.teacherId)
  if (!result.changes) return res.status(404).json({ error: 'Schedule not found.' })
  return res.status(204).end()
})

export default router
