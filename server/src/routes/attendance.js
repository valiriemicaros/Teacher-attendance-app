import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
const allowedStatuses = new Set(['Present', 'Absent', 'Late', 'Excused'])
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const selectAttendance = `SELECT a.id, a.subject_id, a.student_id, s.student_number, s.full_name,
  a.schedule_id, a.attendance_date, a.status, a.remarks, a.created_at, a.updated_at
  FROM attendance a JOIN students s ON s.id = a.student_id WHERE a.teacher_id = ?`

function isValidDate(date) {
  return datePattern.test(date || '') && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}

function validRecords(body) {
  const records = Array.isArray(body?.records)
    ? body.records
    : body?.student_id ? [{ student_id: body.student_id, status: body.status, remarks: body.remarks }] : null
  if (!records || records.length < 1 || records.length > 500) return null
  const seen = new Set()
  for (const record of records) {
    if (typeof record?.student_id !== 'string' || !allowedStatuses.has(record?.status) ||
      typeof (record?.remarks || '') !== 'string' || (record?.remarks || '').length > 500 || seen.has(record.student_id)) return null
    seen.add(record.student_id)
  }
  return records
}

function saveRecords(teacherId, subjectId, date, scheduleId, records) {
  const save = db.transaction(() => {
    const upsert = db.prepare(`INSERT INTO attendance
      (id, teacher_id, subject_id, student_id, schedule_id, attendance_date, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_id, student_id, attendance_date) DO UPDATE SET
        schedule_id = excluded.schedule_id,
        status = excluded.status,
        remarks = excluded.remarks,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    for (const record of records) {
      upsert.run(randomUUID(), teacherId, subjectId, record.student_id, scheduleId,
        date, record.status, record.remarks || '')
    }
    const ids = records.map((record) => record.student_id)
    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(`${selectAttendance} AND a.subject_id = ? AND a.attendance_date = ? AND a.student_id IN (${placeholders}) ORDER BY s.full_name COLLATE NOCASE`)
      .all(teacherId, subjectId, date, ...ids)
  })
  return save()
}

router.get('/reports/summary', (req, res) => {
  const subjectId = req.query.subject_id
  const date = req.query.date
  if (typeof subjectId !== 'string' || !isValidDate(date)) {
    return res.status(400).json({ error: 'A valid subject_id and date are required.' })
  }
  const rows = db.prepare(`SELECT status, COUNT(*) AS count FROM attendance
    WHERE teacher_id = ? AND subject_id = ? AND attendance_date = ? GROUP BY status`)
    .all(req.teacherId, subjectId, date)
  const counts = { Present: 0, Absent: 0, Late: 0, Excused: 0 }
  rows.forEach((row) => { counts[row.status] = row.count })
  return res.json({ total: Object.values(counts).reduce((sum, count) => sum + count, 0), counts })
})

router.get('/', (req, res) => {
  const clauses = ['a.teacher_id = ?']
  const params = [req.teacherId]
  if (req.query.subject_id) { clauses.push('a.subject_id = ?'); params.push(req.query.subject_id) }
  if (req.query.date) {
    if (!isValidDate(req.query.date)) return res.status(400).json({ error: 'Date must use YYYY-MM-DD.' })
    clauses.push('a.attendance_date = ?')
    params.push(req.query.date)
  }
  const rows = db.prepare(`${selectAttendance} AND ${clauses.slice(1).join(' AND ') || '1 = 1'} ORDER BY a.attendance_date DESC, s.full_name COLLATE NOCASE`)
    .all(...params)
  return res.json(rows)
})

router.get('/:date', (req, res) => {
  if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'Date must use YYYY-MM-DD.' })
  const rows = db.prepare(`${selectAttendance} AND a.attendance_date = ? ORDER BY s.full_name COLLATE NOCASE`)
    .all(req.teacherId, req.params.date)
  return res.json(rows)
})

function bulkUpsert(req, res) {
  const subjectId = req.body?.subject_id
  const date = req.body?.attendance_date || req.body?.date
  const scheduleId = req.body?.schedule_id || null
  const records = validRecords(req.body)
  if (typeof subjectId !== 'string' || !isValidDate(date) || (scheduleId !== null && typeof scheduleId !== 'string') || !records) {
    return res.status(400).json({ error: 'Subject, date, and valid attendance records are required.' })
  }
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND teacher_id = ?').get(subjectId, req.teacherId)
  if (!subject) return res.status(404).json({ error: 'Subject not found.' })
  if (scheduleId) {
    const schedule = db.prepare('SELECT id FROM schedules WHERE id = ? AND subject_id = ? AND teacher_id = ?')
      .get(scheduleId, subjectId, req.teacherId)
    if (!schedule) return res.status(400).json({ error: 'Schedule must belong to the selected subject.' })
  }
  const saved = saveRecords(req.teacherId, subjectId, date, scheduleId, records)
  return res.status(200).json(saved)
}

router.post('/', bulkUpsert)
router.put('/', bulkUpsert)

router.put('/:id', (req, res) => {
  const record = db.prepare(`SELECT id, subject_id, student_id, schedule_id, attendance_date, status, remarks
    FROM attendance WHERE id = ? AND teacher_id = ?`).get(req.params.id, req.teacherId)
  if (!record) return res.status(404).json({ error: 'Attendance record not found.' })
  const status = req.body?.status
  const remarks = req.body?.remarks ?? record.remarks
  if (!allowedStatuses.has(status) || typeof remarks !== 'string' || remarks.length > 500) {
    return res.status(400).json({ error: 'Choose a valid attendance status and remarks up to 500 characters.' })
  }
  db.prepare(`UPDATE attendance SET status = ?, remarks = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND teacher_id = ?`)
    .run(status, remarks, req.params.id, req.teacherId)
  return res.json(db.prepare(`${selectAttendance} AND a.id = ?`).get(req.teacherId, req.params.id))
})

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM attendance WHERE id = ? AND teacher_id = ?').run(req.params.id, req.teacherId)
  if (!result.changes) return res.status(404).json({ error: 'Attendance record not found.' })
  return res.status(204).end()
})

export default router
