# Fieldnote Teacher Attendance

Fieldnote keeps the existing React/Vite interface and uses an Express API, SQLite, bcrypt password hashes, and persistent server-side sessions.

## Project layout

- `src/`: existing React app and styles.
- `server/src/`: Express app, SQLite setup, session store, middleware, and API routes.
- `server/data/attendance.db`: SQLite file created automatically on the first backend start.
- `server/.env`: local backend settings; ignored by Git.
- `.env.local`: Vite API URL; ignored by Git.

No Supabase account or credentials are used. This conversion does not import records from Supabase; the previous workspace contained placeholder Supabase settings and no local SQLite database. Export any records from an external service before switching if you have data there.

## Configure

1. Open `C:\Teacher_Attendance\teacher-attendance-app` in VS Code.
2. Install frontend packages from the project root:

```powershell
npm install
```

3. Install backend packages:

```powershell
cd server
npm install
```

4. Confirm `.env.local` contains:

```dotenv
VITE_API_URL=http://localhost:3001/api
```

5. Confirm `server/.env` contains:

```dotenv
PORT=3001
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
DATABASE_PATH=./data/attendance.db
SESSION_SECRET=replace-with-a-long-random-secret
```

In development, the placeholder session secret is replaced with a cryptographically random value saved at `server/data/.session-secret`. That file and the SQLite database are ignored by Git. For production, set `SESSION_SECRET` to a unique random value of at least 32 characters, use HTTPS, and set `NODE_ENV=production`; the server refuses to start in production with the placeholder secret.

## Start the app

Use two VS Code terminals.

Terminal 1, backend:

```powershell
cd C:\Teacher_Attendance\teacher-attendance-app\server
npm run dev
```

The API listens on `http://localhost:3001`.

Terminal 2, frontend:

```powershell
cd C:\Teacher_Attendance\teacher-attendance-app
npm run dev
```

Open `http://localhost:5173`. The backend health check is `http://localhost:3001/api/health`.

For production backend startup, use `npm start` in the `server` directory. The Vite production build and checks run from the project root:

```powershell
npm run lint
npm run build
```

## First teacher account

With both servers running, select **Create an account** and register a full name, email, and password of at least 10 characters. Registration creates the first teacher and signs that teacher in; there is no seeded account, default password, or administrator bypass. Registration is public by design, so deploy behind HTTPS and apply your organization’s signup policy before exposing the service publicly.

The server stores only a bcrypt hash. Login rotates the session ID. The `HttpOnly`, `SameSite=Lax` session cookie and a session-bound CSRF token are used for browser requests. Sessions persist in the SQLite `sessions` table and survive backend restarts while the database and session secret are retained.

## Verify workflows

1. Register a teacher, log out, log in again, and refresh the page. The dashboard should remain authenticated after refresh.
2. Add, edit, and delete a subject. A subject code is unique per teacher.
3. Add a student with student ID, name, and optional grade/section. Try the same ID with different casing in the same subject; SQLite rejects it. Edit and delete the student.
4. Create a schedule with subject, date, room, time, and description. Select a listed schedule to edit it, or choose **New schedule** for a separate time slot.
5. Mark each enrolled student Present, Absent, Late, or Excused, then save. Save again with a changed status and confirm it updates the existing subject/student/date record.
6. Check the attendance summary and Successfully Saved screen. Log out and confirm the dashboard is no longer accessible.

The database is local to this machine. Back up `server/data/attendance.db` while the server is stopped (or use SQLite’s online backup API for a live backup). Do not serve the `server/data` directory as static content or commit its files.

## API

All application routes require a teacher session except health, CSRF bootstrap, and authentication:

- `GET /api/health`
- `GET /api/auth/csrf`, `GET /api/auth/me`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/teachers/me`, `PUT /api/teachers/me`
- `GET /api/subjects`, `POST /api/subjects`, `PUT /api/subjects/:id`, `DELETE /api/subjects/:id`
- `GET /api/students`, `GET /api/students/:id`, `POST /api/students`, `PUT /api/students/:id`, `DELETE /api/students/:id`
- `GET /api/schedules`, `POST /api/schedules`, `PUT /api/schedules/:id`, `DELETE /api/schedules/:id`
- `GET /api/attendance?subject_id=...&date=YYYY-MM-DD`, `GET /api/attendance/:date`
- `GET /api/attendance/reports/summary?subject_id=...&date=YYYY-MM-DD`
- `POST /api/attendance` and `PUT /api/attendance` for attendance batches; `PUT /api/attendance/:id` and `DELETE /api/attendance/:id` for a single record

The server takes `teacher_id` from the session, never from a client body. Queries are parameterized and filter by the authenticated teacher. SQLite foreign keys, uniqueness constraints, and indexes enforce subject ownership, student IDs, and attendance uniqueness. Auth endpoints are rate limited, cookies are HTTP-only, unsafe requests require CSRF tokens, and CORS only permits the configured frontend origins.
