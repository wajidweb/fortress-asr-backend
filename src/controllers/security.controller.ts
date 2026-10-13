import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';
import { hashPassword, verifyPassword } from '../utils/auth.utils';
import { recordAuditLog } from '../services/audit.service';
import { logger } from '../utils/logger';

/**
 * PUT /api/admin/security/change-password
 * Simple, direct admin password change:
 * Verifies old password; if correct, updates to new password.
 * Only Super Admin can perform this action.
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userReq = req as any;
    const userId = userReq.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: No active user session found.' });
      return;
    }

    const oldPassword = req.body.oldPassword || req.body.currentPassword;
    const newPassword = req.body.newPassword;
    const confirmPassword = req.body.confirmPassword;

    if (!oldPassword) {
      res.status(400).json({ error: 'Current password is required.' });
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation do not match.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    // Enforce Super Admin only
    if (user.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ error: 'Access forbidden: Only Super Administrator can change password in settings.' });
      return;
    }

    // Verify current / old password directly
    const isCurrentValid = await verifyPassword(user.passwordHash, oldPassword);
    if (!isCurrentValid) {
      res.status(400).json({ error: 'Incorrect current password.' });
      return;
    }

    if (oldPassword === newPassword) {
      res.status(400).json({ error: 'New password cannot be identical to your current password.' });
      return;
    }

    // Hash the new password and update directly
    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      },
    });

    // Record audit log
    await recordAuditLog({
      userId: user.id,
      action: 'ADMIN_PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: user.id,
      summary: 'Super Admin changed password in Settings',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    logger.error('[SECURITY_CONTROLLER] changePassword error:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
};
