import { PrismaClient, Role } from '@prisma/client';
import { logger } from '../utils/logger';
import { encryptDeterministic, encryptRandomized } from '../utils/crypto';
import { hashPassword } from '../utils/auth.utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

async function runMigrations(): Promise<void> {
  logger.info('Checking and running database migrations...');
  try {
    // Use process.execPath to get the absolute path of the running node binary on the server
    const nodeBinaryPath = process.execPath;
    const { stdout, stderr } = await execAsync(`"${nodeBinaryPath}" node_modules/prisma/build/index.js migrate deploy`);
    if (stdout) {
      logger.info(`Prisma Migrate:\n${stdout.trim()}`);
    }
    if (stderr) {
      logger.warn(`Prisma Migrate Warning:\n${stderr.trim()}`);
    }
  } catch (error) {
    logger.error('Failed to run database migrations programmatically. Make sure you have database access and Prisma installed.', error);
    throw error;
  }
}

async function ensureSuperAdmin() {
  try {
    const adminEmail = process.env.SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      logger.warn('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD is not defined in environment variables. Super Admin seeding/migration skipped.');
      return;
    }

    const encryptedEmail = encryptDeterministic(adminEmail);

    // Check if encrypted admin exists
    const existingEncryptedAdmin = await prisma.user.findUnique({
      where: { email: encryptedEmail },
    });

    if (existingEncryptedAdmin) {
      return;
    }

    // Check if there is an old unencrypted admin to migrate
    const existingUnencryptedAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingUnencryptedAdmin) {
      logger.info('Migrating existing Super Admin to encrypted format...');
      await prisma.user.update({
        where: { id: existingUnencryptedAdmin.id },
        data: {
          email: encryptedEmail,
          firstName: encryptRandomized(existingUnencryptedAdmin.firstName),
          lastName: encryptRandomized(existingUnencryptedAdmin.lastName),
        },
      });
      logger.info('Super Admin migrated successfully.');
      return;
    }

    // Create new encrypted Super Admin
    logger.info('Creating encrypted Super Admin...');
    const hashedPassword = await hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        email: encryptedEmail,
        passwordHash: hashedPassword,
        firstName: encryptRandomized('Super'),
        lastName: encryptRandomized('Admin'),
        role: Role.SUPER_ADMIN,
      },
    });
    logger.info('Encrypted Super Admin created successfully.');
  } catch (error) {
    logger.error('Failed to ensure Super Admin exists:', error);
  }
}

export const connectDatabase = async (): Promise<void> => {
  try {
    // Run database migrations programmatically
    await runMigrations();

    await prisma.$connect();
    logger.info('MySQL Database successfully connected via Prisma ORM.');
    
    // Auto run ensureSuperAdmin on boot
    await ensureSuperAdmin();
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};
