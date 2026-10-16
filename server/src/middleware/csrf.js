import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export function requireCsrf(req, res, next) {
  if (safeMethods.has(req.method)) return next()
  const origin = req.get('origin')
  if (origin && !req.app.locals.allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'This request origin is not allowed.' })
  }

  const provided = req.get('x-csrf-token') || ''
  const expected = req.session.csrfToken || ''
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (!provided || providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: 'Your request token is missing or expired. Refresh and try again.' })
  }
  return next()
}
