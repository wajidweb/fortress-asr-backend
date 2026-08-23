import dotenv from 'dotenv';
import path from 'path';

// Load environmental variables from .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  LOCKOUT_TIME_MINUTES: parseInt(process.env.LOCKOUT_TIME_MINUTES || '15', 10),
  RETENTION_PERIOD_DAYS: parseInt(process.env.RETENTION_PERIOD_DAYS || '2555', 10),
  SIA_EXPIRY_WARNING_DAYS: (process.env.SIA_EXPIRY_WARNING_DAYS || '90,60,30')
    .split(',')
    .map(Number),
  RTW_EXPIRY_WARNING_DAYS: (process.env.RTW_EXPIRY_WARNING_DAYS || '90,60,30')
    .split(',')
    .map(Number),
};
