import process from 'node:process'
import { fileURLToPath } from 'node:url'

const serverDirectory = fileURLToPath(new URL('../', import.meta.url))

export const config = {
  port: Number(process.env.PORT) || 3001,
  databasePath: process.env.DATABASE_PATH || './data/attendance.db',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  serverDirectory,
}
