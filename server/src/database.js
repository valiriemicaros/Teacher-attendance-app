import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const serverDirectory = fileURLToPath(new URL('../', import.meta.url))
const databasePath = resolve(serverDirectory, process.env.DATABASE_PATH || './data/attendance.db')
mkdirSync(dirname(databasePath), { recursive: true })

export const db = new Database(databasePath)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 32),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    archived_at TEXT,
    UNIQUE (teacher_id, code),
    UNIQUE (id, teacher_id)
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    student_number TEXT NOT NULL CHECK (length(trim(student_number)) BETWEEN 1 AND 80),
    full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
    grade_section TEXT NOT NULL DEFAULT '' CHECK (length(grade_section) <= 100),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    archived_at TEXT,
    FOREIGN KEY (subject_id, teacher_id) REFERENCES subjects(id, teacher_id) ON DELETE CASCADE,
    UNIQUE (id, subject_id, teacher_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS students_subject_number_unique
    ON students (teacher_id, subject_id, lower(student_number));
  CREATE INDEX IF NOT EXISTS students_teacher_subject_idx ON students (teacher_id, subject_id, full_name);

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    class_date TEXT NOT NULL CHECK (date(class_date) = class_date),
    room TEXT NOT NULL CHECK (length(trim(room)) BETWEEN 1 AND 80),
    start_time TEXT NOT NULL CHECK (start_time GLOB '[0-1][0-9]:[0-5][0-9]' OR start_time GLOB '2[0-3]:[0-5][0-9]'),
    description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    archived_at TEXT,
    FOREIGN KEY (subject_id, teacher_id) REFERENCES subjects(id, teacher_id) ON DELETE CASCADE,
    UNIQUE (teacher_id, subject_id, class_date, start_time),
    UNIQUE (id, subject_id, teacher_id)
  );
  CREATE INDEX IF NOT EXISTS schedules_teacher_subject_date_idx ON schedules (teacher_id, subject_id, class_date);

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    schedule_id TEXT,
    attendance_date TEXT NOT NULL CHECK (date(attendance_date) = attendance_date),
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Excused')),
    remarks TEXT NOT NULL DEFAULT '' CHECK (length(remarks) <= 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    archived_at TEXT,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id, teacher_id) REFERENCES subjects(id, teacher_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id, subject_id, teacher_id) REFERENCES students(id, subject_id, teacher_id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
    UNIQUE (subject_id, student_id, attendance_date)
  );
  CREATE INDEX IF NOT EXISTS attendance_teacher_subject_date_idx ON attendance (teacher_id, subject_id, attendance_date);
  CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON attendance (student_id, attendance_date);

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    session_data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);
`)

for (const table of ['subjects', 'students', 'schedules', 'attendance']) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((column) => column.name === 'archived_at')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN archived_at TEXT`)
  }
}

export const databaseFilePath = databasePath
