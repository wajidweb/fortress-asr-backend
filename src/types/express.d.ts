import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: Role;
        permissions?: string[];
        email?: string;
      };
    }
  }
}

