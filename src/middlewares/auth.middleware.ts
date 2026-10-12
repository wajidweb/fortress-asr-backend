import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth.utils';
import { Role } from '@prisma/client';
import { prisma } from '../config/db';

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Instant session revocation check: verify user still exists and isActive === true
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized: User account not found' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        error: 'Unauthorized: Your account has been deactivated. Session revoked.',
        isDeactivated: true,
      });
      return;
    }

    (req as any).user = {
      userId: decoded.userId,
      role: decoded.role as Role,
      permissions: decoded.permissions || [],
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireRole = (roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userReq = req as any;
    if (!userReq.user) {
      res.status(401).json({ error: 'Unauthorized: User not authenticated' });
      return;
    }

    if (!roles.includes(userReq.user.role)) {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      return;
    }

    next();
  };
};

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userReq = req as any;
    if (!userReq.user) {
      res.status(401).json({ error: 'Unauthorized: User not authenticated' });
      return;
    }

    // Super Admin has universal operational and administrative access
    if (userReq.user.role === Role.SUPER_ADMIN) {
      next();
      return;
    }

    const userPermissions: string[] = userReq.user.permissions || [];
    if (userPermissions.includes('*') || userPermissions.includes(permission)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'Forbidden: Insufficient permissions for this action',
      requiredPermission: permission,
    });
  };
};
