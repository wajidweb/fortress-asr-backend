import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('MySQL Database successfully connected via Prisma ORM.');
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};
