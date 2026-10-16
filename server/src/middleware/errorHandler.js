export function notFound(_req, res) {
  return res.status(404).json({ error: 'API route not found.' })
}

export function errorHandler(error, _req, res, _next) {
  void _next
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' })
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' })
  }
  if (error?.code?.startsWith?.('SQLITE_CONSTRAINT')) {
    const duplicate = error.code.includes('UNIQUE') || error.code.includes('PRIMARYKEY')
    return res.status(duplicate ? 409 : 400).json({
      error: duplicate ? 'A record with those details already exists.' : 'The request conflicts with related records.',
    })
  }
  console.error('API request failed:', error)
  return res.status(500).json({ error: 'An unexpected server error occurred.' })
}
