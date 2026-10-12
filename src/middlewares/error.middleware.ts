import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import multer from 'multer';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size limit (50MB).';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `Unexpected upload field: ${err.field || 'file'}.`;
    }
  } else if (
    err.message &&
    (err.message.includes('Invalid file') ||
      err.message.includes('Invalid image') ||
      err.message.includes('Invalid document') ||
      err.message.includes('Allowed formats'))
  ) {
    statusCode = 400;
  }

  logger.error(`Error [${statusCode}] on ${req.method} ${req.url}: ${message}`, err.details || '');

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack, details: err.details }),
  });
};
