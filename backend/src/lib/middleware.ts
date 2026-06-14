import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with structured errors on failure.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        issues: (result.error as ZodError).issues,
      });
      return;
    }
    req.body = result.data; // replace with parsed + coerced data
    next();
  };
}

/**
 * Generic async error handler wrapper – avoids try/catch boilerplate in routes.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Centralised Express error handler – register as the last middleware in app.ts.
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
}
