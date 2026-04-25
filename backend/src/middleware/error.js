export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function notFound(_req, _res, next) {
  next(new AppError('NOT_FOUND', 'Route not found', 404));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Duplicate value' } });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
}
