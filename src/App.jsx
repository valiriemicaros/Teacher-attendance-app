import { useEffect, useState } from 'react'
import {
  apiRequest,
  normalizeSchedule,
  normalizeStudent,
  normalizeSubject,
  queryString,
} from './api.js'
import './App.css'

const statuses = ['Present', 'Absent', 'Late', 'Excused']

function emptyData() {
  return { subjects: [], students: [], schedules: [], attendance: {} }
}

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function getGreeting(date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function App() {
  const [data, setData] = useState(emptyData)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [page, setPage] = useState('subjects')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [dataError, setDataError] = useState('')
  const [subjectFormOpen, setSubjectFormOpen] = useState(false)
  const [studentFormOpen, setStudentFormOpen] = useState(false)
  const [subjectEditingId, setSubjectEditingId] = useState(null)
  const [studentEditingId, setStudentEditingId] = useState(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '' })
  const [studentForm, setStudentForm] = useState({ name: '', studentId: '', subjectId: '', gradeSection: '' })
  const [studentError, setStudentError] = useState('')
  const [studentFilter, setStudentFilter] = useState('all')
  const [schedule, setSchedule] = useState(() => {
    return {
      subjectId: '',
      date: localDate(),
      room: '',
      time: '',
      description: '',
    }
  })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [savedSession, setSavedSession] = useState(null)

  useEffect(() => {
    let active = true
    apiRequest('/auth/me')
      .then(({ teacher }) => {
        if (!active) return
        setUser(teacher)
      })
      .catch((error) => {
        if (active) setAuthError(error.message)
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined
    let active = true
    Promise.all([
      apiRequest('/subjects'),
      apiRequest('/students'),
      apiRequest('/schedules'),
    ])
      .then(([subjects, students, schedules]) => {
        if (!active) return
        const normalizedSubjects = subjects.map(normalizeSubject)
        const normalizedStudents = students.map(normalizeStudent)
        const normalizedSchedules = schedules.map(normalizeSchedule)
        setData((current) => ({ ...current, subjects: normalizedSubjects, students: normalizedStudents, schedules: normalizedSchedules }))
        setSchedule((current) => {
          if (current.subjectId && normalizedSubjects.some((subject) => subject.id === current.subjectId)) return current
          const subjectId = normalizedSubjects[0]?.id || ''
          const saved = normalizedSchedules.find((item) => item.subjectId === subjectId && item.date === current.date)
          return {
            ...current,
            subjectId,
            room: saved?.room || '',
            time: saved?.time || '',
            description: saved?.description || '',
          }
        })
        setSelectedScheduleId((currentId) => normalizedSchedules.some((item) => item.id === currentId)
          ? currentId
          : normalizedSchedules.find((item) => item.subjectId === (normalizedSubjects[0]?.id || '') && item.date === localDate())?.id || '')
        setDataError('')
      })
      .catch((error) => {
        if (active) setDataError(error.message)
      })
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(clock)
  }, [])

  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now).toUpperCase()
  const fullDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(now).toUpperCase()

  const activeSubjectId = schedule.subjectId || data.subjects[0]?.id || ''
  const selectedSubject = data.subjects.find((subject) => subject.id === activeSubjectId)
  const subjectStudents = data.students.filter((student) => student.subjectId === activeSubjectId)
  const selectedSchedule = data.schedules.find((item) => item.id === selectedScheduleId)
  const attendanceKey = `${activeSubjectId}:${schedule.date}`
  const currentAttendance = data.attendance[attendanceKey]
  const attendanceStatuses = currentAttendance?.statuses || {}
  const filteredStudents = studentFilter === 'all'
    ? data.students
    : data.students.filter((student) => student.subjectId === studentFilter)

  useEffect(() => {
    if (!user?.id || !activeSubjectId || !schedule.date) return undefined
    let active = true
    apiRequest(`/attendance${queryString({ subject_id: activeSubjectId, date: schedule.date })}`)
      .then((records) => {
        if (!active) return
        const statusesByStudent = Object.fromEntries(records.map((record) => [record.student_id, record.status]))
        setData((current) => ({
          ...current,
          attendance: {
            ...current.attendance,
            [attendanceKey]: { statuses: statusesByStudent },
          },
        }))
      })
      .catch((error) => {
        if (active) setDataError(error.message)
      })
    return () => { active = false }
  }, [user?.id, activeSubjectId, schedule.date, attendanceKey])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    try {
      const email = authForm.email.trim().toLowerCase()
      const result = await apiRequest(authMode === 'create' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          full_name: authForm.name.trim(),
          email,
          password: authForm.password,
        }),
      })
      setData(emptyData())
      setUser(result.teacher)
      setAuthForm({ name: '', email: '', password: '' })
    } catch (error) {
      setAuthError(error.message || 'Authentication failed. Please try again.')
    }
  }

  async function logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      setUser(null)
      setData(emptyData())
      setSavedSession(null)
      setPage('subjects')
      setAuthForm({ name: '', email: '', password: '' })
    } catch (error) {
      setDataError(error.message)
    }
  }

  async function saveSubject(event) {
    event.preventDefault()
    setDataError('')
    try {
      const path = subjectEditingId ? `/subjects/${subjectEditingId}` : '/subjects'
      const saved = normalizeSubject(await apiRequest(path, {
        method: subjectEditingId ? 'PUT' : 'POST',
        body: JSON.stringify({ name: subjectForm.name, code: subjectForm.code }),
      }))
      setData((current) => ({
        ...current,
        subjects: subjectEditingId
          ? current.subjects.map((subject) => subject.id === saved.id ? saved : subject)
          : [...current.subjects, saved],
      }))
      if (!activeSubjectId) setSchedule((current) => ({ ...current, subjectId: saved.id }))
      setStudentForm((current) => ({ ...current, subjectId: current.subjectId || saved.id }))
      setSubjectForm({ name: '', code: '' })
      setSubjectEditingId(null)
      setSubjectFormOpen(false)
    } catch (error) {
      setDataError(error.message)
    }
  }

  async function deleteSubject(subjectId) {
    if (!window.confirm('Delete this subject and its schedules, students, and attendance?')) return
    try {
      await apiRequest(`/subjects/${subjectId}`, { method: 'DELETE' })
      const subjects = data.subjects.filter((subject) => subject.id !== subjectId)
      setData((current) => ({
        ...current,
        subjects,
        students: current.students.filter((student) => student.subjectId !== subjectId),
        schedules: current.schedules.filter((item) => item.subjectId !== subjectId),
        attendance: Object.fromEntries(Object.entries(current.attendance).filter(([key]) => !key.startsWith(`${subjectId}:`))),
      }))
      if (activeSubjectId === subjectId) setSchedule((current) => ({ ...current, subjectId: subjects[0]?.id || '' }))
    } catch (error) {
      setDataError(error.message)
    }
  }

  async function saveStudent(event) {
    event.preventDefault()
    setStudentError('')
    setDataError('')
    try {
      const path = studentEditingId ? `/students/${studentEditingId}` : '/students'
      const saved = normalizeStudent(await apiRequest(path, {
        method: studentEditingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          subject_id: studentForm.subjectId,
          student_number: studentForm.studentId,
          full_name: studentForm.name,
          grade_section: studentForm.gradeSection,
        }),
      }))
      setData((current) => ({
        ...current,
        students: studentEditingId
          ? current.students.map((student) => student.id === saved.id ? saved : student)
          : [...current.students, saved],
      }))
      setStudentForm({ name: '', studentId: '', subjectId: activeSubjectId || data.subjects[0]?.id || '', gradeSection: '' })
      setStudentEditingId(null)
      setStudentFormOpen(false)
    } catch (error) {
      setStudentError(error.message)
    }
  }

  async function deleteStudent(studentId) {
    if (!window.confirm('Delete this student and their attendance records?')) return
    try {
      await apiRequest(`/students/${studentId}`, { method: 'DELETE' })
      setData((current) => {
        const attendance = Object.fromEntries(Object.entries(current.attendance).map(([key, record]) => {
          const statuses = { ...record.statuses }
          delete statuses[studentId]
          return [key, { ...record, statuses }]
        }))
        return {
          ...current,
          students: current.students.filter((student) => student.id !== studentId),
          attendance,
        }
      })
    } catch (error) {
      setDataError(error.message)
    }
  }

  function updateStatus(studentId, status) {
    setData((current) => {
      const key = `${activeSubjectId}:${schedule.date}`
      const existing = current.attendance[key] || { statuses: {} }
      return {
        ...current,
        attendance: {
          ...current.attendance,
          [key]: { ...existing, statuses: { ...existing.statuses, [studentId]: status } },
        },
      }
    })
  }

  function selectSession(updates) {
    const next = { ...schedule, ...updates }
    const saved = data.schedules.find((item) => item.subjectId === next.subjectId && item.date === next.date)
    setSelectedScheduleId(saved?.id || '')
    setSchedule({
      ...next,
      room: saved?.room || '',
      time: saved?.time || '',
      description: saved?.description || '',
    })
  }

  function startNewSchedule() {
    setSelectedScheduleId('')
    setSchedule((current) => ({ ...current, room: '', time: '', description: '' }))
  }

  async function persistSchedule() {
    const scheduleId = selectedScheduleId || selectedSchedule?.id
    const saved = normalizeSchedule(await apiRequest(
      scheduleId ? `/schedules/${scheduleId}` : '/schedules',
      {
        method: scheduleId ? 'PUT' : 'POST',
        body: JSON.stringify({
          subject_id: activeSubjectId,
          class_date: schedule.date,
          room: schedule.room,
          start_time: schedule.time,
          description: schedule.description,
        }),
      },
    ))
    setData((current) => ({
      ...current,
      schedules: scheduleId
        ? current.schedules.map((item) => item.id === saved.id ? saved : item)
        : [...current.schedules, saved],
    }))
    setSelectedScheduleId(saved.id)
    return saved
  }

  async function saveSchedule(event) {
    event.preventDefault()
    setScheduleSaving(true)
    setDataError('')
    try {
      await persistSchedule()
    } catch (error) {
      setDataError(error.message)
    } finally {
      setScheduleSaving(false)
    }
  }

  async function deleteSchedule(scheduleId) {
    if (!window.confirm('Delete this schedule? Existing attendance records will be kept.')) return
    try {
      await apiRequest(`/schedules/${scheduleId}`, { method: 'DELETE' })
      setData((current) => ({ ...current, schedules: current.schedules.filter((item) => item.id !== scheduleId) }))
      if (selectedScheduleId === scheduleId) {
        setSelectedScheduleId('')
        setSchedule((current) => ({ ...current, room: '', time: '', description: '' }))
      }
    } catch (error) {
      setDataError(error.message)
    }
  }

  async function saveAttendance(event) {
    event.preventDefault()
    if (!selectedSubject) return
    setScheduleSaving(true)
    setDataError('')
    try {
      const savedSchedule = await persistSchedule()
      const records = subjectStudents.map((student) => ({
        student_id: student.id,
        status: attendanceStatuses[student.id],
      }))
      const savedRecords = await apiRequest('/attendance', {
        method: 'PUT',
        body: JSON.stringify({
          subject_id: activeSubjectId,
          attendance_date: schedule.date,
          schedule_id: savedSchedule.id,
          records,
        }),
      })
      const savedStatuses = Object.fromEntries(savedRecords.map((record) => [record.student_id, record.status]))
      setData((current) => ({
        ...current,
        attendance: { ...current.attendance, [attendanceKey]: { statuses: savedStatuses } },
      }))
      setSavedSession({ subjectName: selectedSubject.name, date: schedule.date, statuses: savedStatuses })
      setPage('saved')
    } catch (error) {
      setDataError(error.message)
    } finally {
      setScheduleSaving(false)
    }
  }

  if (!user) {
    return (
      <main className="auth-layout">
        <section className="auth-panel" aria-labelledby="auth-title">
          <a className="brand" href="#login" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark book-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M5 8.5c4.3-.7 7.9.2 11 2.8v14c-3.1-2.6-6.7-3.5-11-2.8v-14Z" />
                <path d="M27 8.5c-4.3-.7-7.9.2-11 2.8v14c3.1-2.6 6.7-3.5 11-2.8v-14Z" />
                <path d="M20.5 5.5c.1 3.5-1.4 5.8-4.5 7.1-1-3.2.5-5.5 4.5-7.1Z" />
                <path d="M16.3 12.4c.6-2.3 1.9-4.1 4-5.4" />
              </svg>
            </span>
            <span>Fieldnote <small>ATTENDANCE</small></span>
          </a>
          <div className="auth-copy">
            <p className="eyebrow">TEACHER WORKSPACE</p>
            <h1 id="auth-title">Everything organized.<br />Every student accounted for.</h1>
            <p>Simplify attendance, stay organized, and focus on what matters most—your students.</p>
          </div>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <h2>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="form-intro">{authMode === 'login' ? 'Sign in to your teacher workspace.' : 'Set up a local teacher workspace.'}</p>
            {authLoading && <p role="status">Restoring your sign-in session…</p>}
            {authMode === 'create' && (
              <label>Full name<input required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} autoComplete="name" /></label>
            )}
            <label>Email address<input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} autoComplete="email" /></label>
            <label>Password<input required minLength="10" type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            {authMessage && <p role="status">{authMessage}</p>}
            <button className="button button-primary button-wide" type="submit" disabled={authLoading}>{authMode === 'login' ? 'Sign in' : 'Create Account'}</button>
            {authMode === 'login' && <div className="auth-divider"><span>Or</span></div>}
            <button className="text-button button-wide" type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'create' : 'login'); setAuthError('') }}>
              {authMode === 'login' ? 'Create an account' : 'Already have an account? Login'}
            </button>
          </form>
          <p className="auth-footnote">A thoughtful space for every classroom.</p>
        </section>
        <aside className="auth-art" aria-label="Attendance summary illustration">
          <div className="art-header"><div className="art-date"><span>{dayName}</span><strong>{fullDate}</strong></div><span className="live-dot">{getGreeting(now)}</span></div>
          <div className="art-note"><span className="art-kicker">A BETTER CLASSROOM EXPERIENCE</span><h2>Great teaching<br />begins with<br /><em>being present.</em></h2><div className="art-rule" /><p>One simple space for attendance and everything that helps learning grow.</p></div>
          <div className="art-stamp" aria-label="Fieldnote, established 2026"><span className="seal-monogram">F<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.5 3.5c.1 4.1-1.8 6.8-5.7 8-1.1-3.7.8-6.4 5.7-8Z" /><path d="M12.9 11.3c.8-2.8 2.5-4.9 5.2-6.5" /></svg></span><small>FIELDNOTE</small><small>EST. 2026</small></div>
        </aside>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#subjects" onClick={(event) => { event.preventDefault(); setPage('subjects') }}>
          <span className="brand-mark" aria-hidden="true">TA</span>
          <span>Fieldnote <small>ATTENDANCE</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={page === 'subjects' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('subjects')}><span className="nav-glyph">▦</span>Subjects</button>
          <button className={page === 'schedule' || page === 'saved' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('schedule')}><span className="nav-glyph">◷</span>Schedule &amp; attendance</button>
          <button className={page === 'students' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('students')}><span className="nav-glyph">♧</span>Students</button>
        </nav>
        <div className="sidebar-bottom"><span className="avatar">{user.full_name.slice(0, 1).toUpperCase()}</span><span className="user-label"><strong>{user.full_name}</strong><small>Teacher account</small></span><button className="logout-button" onClick={logout} title="Logout" aria-label="Logout"><span aria-hidden="true">↗</span></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">TEACHER WORKSPACE <span>/</span> {page === 'saved' ? 'SAVED' : page === 'schedule' ? 'SCHEDULE & ATTENDANCE' : page.toUpperCase()}</div><button className="top-logout" onClick={logout}>Logout <span aria-hidden="true">↗</span></button></header>
        <div className="page-content">
          {dataError && <p className="form-error page-error" role="alert">{dataError}</p>}
          {page === 'subjects' && (
            <>
              <div className="page-heading"><div><p className="eyebrow">YOUR TEACHING LOAD</p><h1>Subjects</h1><p className="page-subtitle">A home for every class you teach.</p></div><button className="button button-primary" onClick={() => { const opening = !subjectFormOpen; setSubjectEditingId(null); setSubjectForm({ name: '', code: '' }); setSubjectFormOpen(opening) }}><span aria-hidden="true">＋</span> Add Subject</button></div>
              {subjectFormOpen && <form className="inline-form subject-form" onSubmit={saveSubject}><label>Subject name<input required autoFocus placeholder="e.g. Biology" value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} /></label><label>Class code<input required placeholder="e.g. BIO-201" value={subjectForm.code} onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value })} /></label><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => { setSubjectFormOpen(false); setSubjectEditingId(null) }}>Cancel</button><button className="button button-primary" type="submit">{subjectEditingId ? 'Update subject' : 'Save subject'}</button></div></form>}
              {data.subjects.length ? <div className="subject-grid">{data.subjects.map((subject, index) => {
                const count = data.students.filter((student) => student.subjectId === subject.id).length
                const sessions = data.schedules.filter((item) => item.subjectId === subject.id).length
                return <article className="subject-card" key={subject.id}><div className={`subject-stripe stripe-${index % 4}`} /><div className="subject-card-content"><div className="card-overline">{subject.code}</div><h2>{subject.name}</h2><div className="subject-meta"><span>{count} {count === 1 ? 'student' : 'students'}</span><span>{sessions} {sessions === 1 ? 'session' : 'sessions'}</span></div><div className="subject-actions"><button className="card-link" onClick={() => { selectSession({ subjectId: subject.id }); setPage('schedule') }}>Take attendance <span aria-hidden="true">→</span></button><button type="button" className="text-button" onClick={() => { setSubjectEditingId(subject.id); setSubjectForm({ name: subject.name, code: subject.code }); setSubjectFormOpen(true) }}>Edit</button><button type="button" className="text-button danger-button" onClick={() => deleteSubject(subject.id)}>Delete</button></div></div></article>
              })}</div> : <div className="empty-state"><span className="empty-mark">01</span><h2>Your first subject starts here</h2><p>Add a subject to organize its student list and attendance sessions.</p><button className="button button-primary" onClick={() => setSubjectFormOpen(true)}>＋ Add your first subject</button></div>}
            </>
          )}

          {page === 'students' && (
            <>
              <div className="page-heading"><div><p className="eyebrow">PEOPLE IN YOUR CLASSES</p><h1>Students</h1><p className="page-subtitle">Manage class lists and keep IDs unique per subject.</p></div><button className="button button-primary" disabled={!data.subjects.length} onClick={() => { const opening = !studentFormOpen; setStudentEditingId(null); setStudentError(''); setStudentForm({ name: '', studentId: '', subjectId: studentFilter === 'all' ? data.subjects[0]?.id || '' : studentFilter, gradeSection: '' }); setStudentFormOpen(opening) }}><span aria-hidden="true">＋</span> Add Student</button></div>
              {studentFormOpen && <form className="inline-form student-form" onSubmit={saveStudent}><label>Student name<input required autoFocus placeholder="Full name" value={studentForm.name} onChange={(event) => setStudentForm({ ...studentForm, name: event.target.value })} /></label><label>Student ID<input required placeholder="e.g. STU-1042" value={studentForm.studentId} onChange={(event) => setStudentForm({ ...studentForm, studentId: event.target.value })} /></label><label>Grade / section<input placeholder="e.g. Grade 8 · A" value={studentForm.gradeSection} onChange={(event) => setStudentForm({ ...studentForm, gradeSection: event.target.value })} /></label><label>Subject<select required value={studentForm.subjectId} onChange={(event) => setStudentForm({ ...studentForm, subjectId: event.target.value })}>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => { setStudentFormOpen(false); setStudentEditingId(null) }}>Cancel</button><button className="button button-primary" type="submit">{studentEditingId ? 'Update student' : 'Save student'}</button></div>{studentError && <p className="form-error" role="alert">{studentError}</p>}</form>}
              {!data.subjects.length ? <div className="empty-state"><span className="empty-mark">02</span><h2>Add a subject first</h2><p>Students belong to a subject, so create a class before building its list.</p><button className="button button-primary" onClick={() => setPage('subjects')}>Go to subjects <span aria-hidden="true">→</span></button></div> : <>
                <div className="list-toolbar"><span className="result-count">{filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}</span><label className="filter-label">SUBJECT<select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}><option value="all">All subjects</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div>
                <div className="data-table-wrap"><table className="data-table"><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>GRADE / SECTION</th><th>SUBJECT</th><th>ACTIONS</th></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td><span className="student-avatar">{student.name.slice(0, 1).toUpperCase()}</span><strong>{student.name}</strong></td><td className="id-cell">{student.studentId}</td><td>{student.gradeSection || '—'}</td><td>{data.subjects.find((subject) => subject.id === student.subjectId)?.name || '—'}</td><td><div className="table-actions"><button className="text-button" onClick={() => { setStudentEditingId(student.id); setStudentForm({ name: student.name, studentId: student.studentId, subjectId: student.subjectId, gradeSection: student.gradeSection || '' }); setStudentFormOpen(true) }}>Edit</button><button className="text-button danger-button" onClick={() => deleteStudent(student.id)}>Delete</button></div></td></tr>)}</tbody></table>{!filteredStudents.length && <div className="table-empty"><p>No students in this view yet.</p><button className="text-button" onClick={() => { setStudentEditingId(null); setStudentForm({ name: '', studentId: '', subjectId: data.subjects[0]?.id || '', gradeSection: '' }); setStudentFormOpen(true) }}>Add a student</button></div>}</div>
              </>}
            </>
          )}

          {page === 'schedule' && (
            <>
              <div className="page-heading"><div><p className="eyebrow">CLASS ROLL CALL</p><h1>Schedule &amp; attendance</h1><p className="page-subtitle">Set the class details, then mark each student.</p></div><button className="button button-primary" type="button" disabled={!data.subjects.length} onClick={startNewSchedule}>＋ New schedule</button></div>
              {!data.subjects.length ? <div className="empty-state"><span className="empty-mark">03</span><h2>No subjects to schedule</h2><p>Create a subject and add its students before taking attendance.</p><button className="button button-primary" onClick={() => setPage('subjects')}>Go to subjects <span aria-hidden="true">→</span></button></div> : <form onSubmit={saveAttendance}>
                {data.schedules.filter((item) => item.subjectId === activeSubjectId).length > 0 && <div className="schedule-list" aria-label="Schedules for selected subject">{data.schedules.filter((item) => item.subjectId === activeSubjectId).map((item) => <div className={item.id === selectedSchedule?.id ? 'schedule-list-item selected' : 'schedule-list-item'} key={item.id}><button type="button" onClick={() => { setSelectedScheduleId(item.id); setSchedule({ subjectId: item.subjectId, date: item.date, room: item.room, time: item.time, description: item.description }) }}><strong>{item.date}</strong><span>{item.time} · {item.room}</span><small>{item.description}</small></button><button type="button" className="text-button danger-button" onClick={() => deleteSchedule(item.id)}>Delete</button></div>)}</div>}
                <section className="session-panel"><div className="section-title"><div><span className="section-index">01</span><h2>Class details</h2></div><span className="required-note">ALL FIELDS REQUIRED</span></div><div className="schedule-fields"><label className="field-subject">Subject<select required value={activeSubjectId} onChange={(event) => selectSession({ subjectId: event.target.value })}>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} · {subject.code}</option>)}</select></label><label>Date<input required type="date" value={schedule.date} onChange={(event) => selectSession({ date: event.target.value })} /></label><label>Room<input required placeholder="e.g. B-204" value={schedule.room} onChange={(event) => setSchedule({ ...schedule, room: event.target.value })} /></label><label>Time<input required type="time" value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} /></label><label className="field-description">Description<input required placeholder="e.g. Chapter 4: Plant systems" value={schedule.description} onChange={(event) => setSchedule({ ...schedule, description: event.target.value })} /></label></div><div className="form-actions schedule-actions"><button className="button button-quiet" type="button" onClick={saveSchedule} disabled={scheduleSaving}>{scheduleSaving ? 'Saving…' : selectedSchedule ? 'Update Schedule' : 'Save Schedule'}</button>{selectedSchedule && <button className="button button-quiet danger-button" type="button" onClick={() => deleteSchedule(selectedSchedule.id)}>Delete Schedule</button>}</div></section>
                <section className="roster-section"><div className="section-title roster-title"><div><span className="section-index">02</span><h2>Student roster</h2></div><span className="roster-count">{subjectStudents.length.toString().padStart(2, '0')} ENROLLED</span></div>
                  {subjectStudents.length ? <div className="attendance-list">{subjectStudents.map((student, index) => <div className="attendance-row" key={student.id}><span className="row-number">{String(index + 1).padStart(2, '0')}</span><span className="student-avatar">{student.name.slice(0, 1).toUpperCase()}</span><span className="roster-student"><strong>{student.name}</strong><small>{student.studentId}</small></span><div className="status-options" role="group" aria-label={`Attendance status for ${student.name}`}>{statuses.map((status) => <button key={status} type="button" aria-pressed={attendanceStatuses[student.id] === status} className={`status-option ${attendanceStatuses[student.id] === status ? `selected status-${status.toLowerCase()}` : ''}`} onClick={() => updateStatus(student.id, status)}>{status}</button>)}</div></div>)}</div> : <div className="roster-empty"><p>No students are assigned to this subject yet.</p><button type="button" className="text-button" onClick={() => { setStudentForm({ name: '', studentId: '', subjectId: activeSubjectId, gradeSection: '' }); setStudentFormOpen(true); setPage('students') }}>Add students <span aria-hidden="true">→</span></button></div>}
                </section>
                <div className="attendance-summary">{statuses.map((status) => <span key={status}>{status}: <strong>{Object.values(attendanceStatuses).filter((value) => value === status).length}</strong></span>)}</div>
                <div className="save-row"><span>{subjectStudents.length && subjectStudents.every((student) => attendanceStatuses[student.id]) ? 'All students marked' : 'Mark an attendance status for each student to save.'}</span><button className="button button-primary save-button" type="submit" disabled={scheduleSaving || !subjectStudents.length || !subjectStudents.every((student) => attendanceStatuses[student.id])}>{scheduleSaving ? 'Saving…' : 'Save Attendance'} <span aria-hidden="true">→</span></button></div>
              </form>}
            </>
          )}

          {page === 'saved' && savedSession && (
            <section className="success-page"><div className="success-mark"><span aria-hidden="true">✓</span></div><p className="eyebrow">ATTENDANCE RECORDED</p><h1>Successfully saved.</h1><p className="success-copy">Your class record is filed and ready whenever you need it.</p><div className="saved-summary"><div><span>SUBJECT</span><strong>{savedSession.subjectName}</strong></div><div><span>DATE</span><strong>{new Date(`${savedSession.date}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div><div><span>STUDENTS MARKED</span><strong>{Object.keys(savedSession.statuses).length}</strong></div></div><div className="success-actions"><button className="button button-primary" onClick={() => setPage('schedule')}>Back to schedule <span aria-hidden="true">→</span></button><button className="button button-quiet" onClick={() => setPage('subjects')}>View subjects</button></div></section>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
