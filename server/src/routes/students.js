import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)
const selectStudent = `SELECT id, subject_id, student_number, student_number AS student_id,
  full_name, grade_section, created_at, updated_at FROM students WHERE teacher_id = ?`

function readStudentBody(body) {
  const subjectId = body?.subject_id
  const studentNumber = typeof body?.student_number === 'string'
    ? body.student_number.trim()
    : typeof body?.student_id === 'string' ? body.student_id.trim() : ''
  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : ''
  const gradeSection = typeof body?.grade_section === 'string' ? body.grade_section.trim() : ''
  if (typeof subjectId !== 'string' || !studentNumber || studentNumber.length > 80 || !fullName || fullName.length > 160 || gradeSection.length > 100) {
    return null
  }
  return { subjectId, studentNumber, fullName, gradeSection }
}

router.get('/', (req, res) => {
  const rows = req.query.subject_id
    ? db.prepare(`${selectStudent} AND subject_id = ? ORDER BY full_name COLLATE NOCASE`).all(req.teacherId, req.query.subject_id)
    : db.prepare(`${selectStudent} ORDER BY full_name COLLATE NOCASE`).all(req.teacherId)
  return res.json(rows)
})

router.get('/:id', (req, res) => {
  const student = db.prepare(`${selectStudent} AND id = ?`).get(req.teacherId, req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found.' })
  return res.json(student)
})

router.post('/', (req, res) => {
  const values = readStudentBody(req.body)
  if (!values) return res.status(400).json({ error: 'Subject, student number, and full name are required.' })
  const id = randomUUID()
  db.prepare(`INSERT INTO students (id, teacher_id, subject_id, student_number, full_name, grade_section)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.teacherId, values.subjectId, values.studentNumber, values.fullName, values.gradeSection)
  return res.status(201).json(db.prepare(`${selectStudent} AND id = ?`).get(req.teacherId, id))
})

router.put('/:id', (req, res) => {
  const values = readStudentBody(req.body)
  if (!values) return res.status(400).json({ error: 'Subject, student number, and full name are required.' })
  const update = db.transaction(() => {
    const result = db.prepare(`UPDATE students SET subject_id = ?, student_number = ?, full_name = ?, grade_section = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND teacher_id = ?`)
      .run(values.subjectId, values.studentNumber, values.fullName, values.gradeSection, req.params.id, req.teacherId)
    if (!result.changes) return null
    db.prepare(`UPDATE attendance SET subject_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE student_id = ? AND teacher_id = ?`).run(values.subjectId, req.params.id, req.teacherId)
    return db.prepare(`${selectStudent} AND id = ?`).get(req.teacherId, req.params.id)
  })
  const student = update()
  if (!student) return res.status(404).json({ error: 'Student not found.' })
  return res.json(student)
})

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM students WHERE id = ? AND teacher_id = ?').run(req.params.id, req.teacherId)
  if (!result.changes) return res.status(404).json({ error: 'Student not found.' })
  return res.status(204).end()
})

export default router
