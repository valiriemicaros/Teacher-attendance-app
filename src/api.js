const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const apiUrl = new URL(configuredApiUrl, window.location.href)
if (['localhost', '127.0.0.1'].includes(apiUrl.hostname) && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  apiUrl.hostname = window.location.hostname
}
const API_URL = apiUrl.toString().replace(/\/$/, '')
let csrfToken = ''

async function getCsrfToken() {
  const response = await fetch(`${API_URL}/auth/csrf`, { credentials: 'include' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.csrfToken) throw new Error(payload.error || 'Could not start a secure session.')
  csrfToken = payload.csrfToken
  return csrfToken
}

export const normalizeSubject = (subject) => ({
  id: subject.id,
  name: subject.name,
  code: subject.code,
})

export const normalizeStudent = (student) => ({
  id: student.id,
  subjectId: student.subject_id,
  studentId: student.student_id,
  name: student.full_name,
  gradeSection: student.grade_section || '',
})

export const normalizeSchedule = (schedule) => ({
  id: schedule.id,
  subjectId: schedule.subject_id,
  date: schedule.class_date,
  room: schedule.room,
  time: schedule.start_time,
  description: schedule.description,
})

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const requiresCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (requiresCsrf && !csrfToken) await getCsrfToken()

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(requiresCsrf ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || `Request failed with status ${response.status}.`)
  }
  if (result.csrfToken) csrfToken = result.csrfToken
  if (path === '/auth/logout') csrfToken = ''
  return result
}

export function queryString(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}
