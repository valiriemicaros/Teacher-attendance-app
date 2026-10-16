export function requireAuth(req, res, next) {
  if (!req.session.teacherId) {
    return res.status(401).json({ error: 'Please sign in to continue.' })
  }
  req.teacherId = req.session.teacherId
  return next()
}
