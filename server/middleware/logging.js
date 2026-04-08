/**
 * Structured JSON request logging middleware.
 */

export function loggingMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const entry = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  });

  next();
}
