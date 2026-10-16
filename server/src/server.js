import dotenv from 'dotenv'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const { app, db } = await import('./app.js')
const port = Number(process.env.PORT) || 3001
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Teacher Attendance API listening on http://localhost:${port}`)
})

function shutDown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutDown)
process.on('SIGTERM', shutDown)
