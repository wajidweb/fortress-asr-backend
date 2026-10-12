import { Request, Response } from 'express';
import { prisma } from '../config/db';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateSecureToken,
  hashToken,
} from '../utils/auth.utils';
import {
  encryptDeterministic,
  decryptDeterministic,
  encryptRandomized,
  decryptRandomized,
} from '../utils/crypto';
import {
  loginSchema,
  registerGuardSchema,
  registerClientSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInvitationSchema,
} from '../validators/auth.validator';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mail.service';
import { recordAuditLog } from '../services/audit.service';
import { Role } from '@prisma/client';
import { z } from 'zod';

/**
 * Decrypt a user object and its nested profiles for API response
 */
export function decryptUser(user: any) {
  if (!user) return user;
  const decrypted = {
    ...user,
    email: decryptDeterministic(user.email),
    firstName: user.firstName ? decryptRandomized(user.firstName) : '',
    lastName: user.lastName ? decryptRandomized(user.lastName) : '',
    phoneNumber: user.phoneNumber ? decryptRandomized(user.phoneNumber) : null,
  };
  
  // Universally strip sensitive password hash to guarantee absolute security
  delete decrypted.passwordHash;

  if (decrypted.guardProfile) {
    decrypted.guardProfile = {
      ...decrypted.guardProfile,
      firstName: decrypted.guardProfile.firstName ? decryptRandomized(decrypted.guardProfile.firstName) : '',
      lastName: decrypted.guardProfile.lastName ? decryptRandomized(decrypted.guardProfile.lastName) : '',
      phoneNumber: decrypted.guardProfile.phoneNumber ? decryptRandomized(decrypted.guardProfile.phoneNumber) : null,
      siaLicenceNumber: decrypted.guardProfile.siaLicenceNumber ? decryptRandomized(decrypted.guardProfile.siaLicenceNumber) : null,
      rtwDocumentType: decrypted.guardProfile.rtwDocumentType ? decryptRandomized(decrypted.guardProfile.rtwDocumentType) : null,
      rtwDocumentUrl: decrypted.guardProfile.rtwDocumentUrl ? decryptRandomized(decrypted.guardProfile.rtwDocumentUrl) : null,
      profilePictureUrl: decrypted.guardProfile.profilePictureUrl || null,
      emergencyContactName: decrypted.guardProfile.emergencyContactName ? decryptRandomized(decrypted.guardProfile.emergencyContactName) : null,
      emergencyContactPhone: decrypted.guardProfile.emergencyContactPhone ? decryptRandomized(decrypted.guardProfile.emergencyContactPhone) : null,
    };
  }
  if (decrypted.clientProfile) {
    const rawProfile = decrypted.clientProfile;
    const urlSlug = rawProfile.urlSlug || rawProfile.slug || '';
    decrypted.clientProfile = {
      ...rawProfile,
      companyName: rawProfile.companyName ? decryptRandomized(rawProfile.companyName) : '',
      billingAddress: rawProfile.billingAddress ? decryptRandomized(rawProfile.billingAddress) : '',
      logoUrl: rawProfile.logoUrl ? decryptRandomized(rawProfile.logoUrl) : null,
      contactPerson: rawProfile.contactPerson ? decryptRandomized(rawProfile.contactPerson) : null,
      contactPhone: rawProfile.contactPhone ? decryptRandomized(rawProfile.contactPhone) : null,
      urlSlug,
      slug: urlSlug,
      createdAt: rawProfile.createdAt,
    };
  }
  if (decrypted.staffProfile) {
    const rawStaff = decrypted.staffProfile;
    decrypted.staffProfile = {
      ...rawStaff,
      jobTitle: rawStaff.jobTitle || null,
      department: rawStaff.department || null,
      template: rawStaff.template || 'FULL_OPERATIONS',
      permissions: Array.isArray(rawStaff.permissions)
        ? rawStaff.permissions
        : typeof rawStaff.permissions === 'string'
          ? JSON.parse(rawStaff.permissions)
          : [],
    };
  }
  return decrypted;
}

export const registerGuard = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerGuardSchema.parse(req.body);

    const encryptedEmail = encryptDeterministic(data.email);

    const existingUser = await prisma.user.findUnique({
      where: { email: encryptedEmail },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: encryptedEmail,
        passwordHash: hashedPassword,
        firstName: '',
        lastName: '',
        role: Role.GUARD,
        guardProfile: {
          create: {
            firstName: '',
            lastName: '',
          },
        },
      },
    });

    const verificationToken = generateSecureToken();
    const hashedVerificationToken = hashToken(verificationToken);

    await prisma.emailVerificationToken.create({
      data: {
        tokenHash: hashedVerificationToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    await sendVerificationEmail(data.email, verificationToken);

    res.status(201).json({ 
      message: 'Guard registered successfully. Please check your email to verify your account.', 
      userId: user.id 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const registerClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerClientSchema.parse(req.body);

    const encryptedEmail = encryptDeterministic(data.email);

    const existingUser = await prisma.user.findUnique({
      where: { email: encryptedEmail },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: encryptedEmail,
        passwordHash: hashedPassword,
        firstName: '',
        lastName: '',
        role: Role.CLIENT,
      },
    });

    const verificationToken = generateSecureToken();
    const hashedVerificationToken = hashToken(verificationToken);

    await prisma.emailVerificationToken.create({
      data: {
        tokenHash: hashedVerificationToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    await sendVerificationEmail(data.email, verificationToken);

    res.status(201).json({ 
      message: 'Client registered successfully. Please check your email to verify your account.', 
      userId: user.id 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const encryptedEmail = encryptDeterministic(data.email);

    const user = await prisma.user.findUnique({
      where: { email: encryptedEmail },
      include: {
        guardProfile: true,
        clientProfile: true,
        staffProfile: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, data.password);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ 
        error: 'Your account has been deactivated. Please contact your System Administrator.',
        isDeactivated: true,
      });
      return;
    }

    if (!user.isEmailVerified) {
      res.status(401).json({ 
        error: 'Please verify your email address before logging in.',
        isEmailVerified: false 
      });
      return;
    }

    const permissions: string[] = (user.staffProfile?.permissions as string[]) || (user.role === Role.SUPER_ADMIN ? ['*'] : []);
    const payload = { userId: user.id, role: user.role, permissions };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const hashedRefreshToken = hashToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashedRefreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
      },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: decryptUser(user),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashedToken },
        data: { revokedAt: new Date() },
      });
    }

    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userReq = req as any;
    if (!userReq.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userReq.user.userId },
      include: {
        guardProfile: true,
        clientProfile: true,
        staffProfile: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        error: 'Unauthorized: Your account has been deactivated. Session revoked.',
        isDeactivated: true,
      });
      return;
    }

    res.json({ user: decryptUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;

    if (!token) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }

    const decoded = verifyRefreshToken(token);

    const hashedToken = hashToken(token);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashedToken },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { staffProfile: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        error: 'Unauthorized: Your account has been deactivated.',
        isDeactivated: true,
      });
      return;
    }

    const permissions: string[] = (user?.staffProfile?.permissions as string[]) || (decoded.role === Role.SUPER_ADMIN ? ['*'] : (decoded.permissions || []));
    const payload = { userId: decoded.userId, role: decoded.role, permissions };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);
    const newHashedRefreshToken = hashToken(newRefreshToken);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: newHashedRefreshToken,
          userId: decoded.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = forgotPasswordSchema.parse(req.body);

    const encryptedEmail = encryptDeterministic(data.email);

    const user = await prisma.user.findUnique({
      where: { email: encryptedEmail },
    });

    if (!user || !user.isActive) {
      res.json({ message: 'If the email exists, a password reset link has been sent.' });
      return;
    }

    const resetToken = generateSecureToken();
    const hashedResetToken = hashToken(resetToken);

    await prisma.passwordResetToken.create({
      data: {
        tokenHash: hashedResetToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), 
      },
    });

    // Send the password reset email asynchronously
    await sendPasswordResetEmail(data.email, resetToken);

    res.json({ message: 'If the email exists, a password reset link has been sent.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = resetPasswordSchema.parse(req.body);

    const hashedResetToken = hashToken(data.token);

    const storedToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashedResetToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.usedAt || storedToken.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const newHashedPassword = await hashPassword(data.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: storedToken.userId },
        data: { passwordHash: newHashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: storedToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    ]);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const hashedToken = hashToken(token);

    const storedToken = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashedToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.usedAt || storedToken.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invalid or expired verification token' });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: storedToken.userId },
        data: { isEmailVerified: true },
      }),
      prisma.emailVerificationToken.update({
        where: { id: storedToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const encryptedEmail = encryptDeterministic(email);

    const user = await prisma.user.findUnique({
      where: { email: encryptedEmail },
    });

    if (!user) {
      // Return a success message even if user doesn't exist for security reasons (prevent enumeration)
      res.json({ message: 'If the email exists and is unverified, a new verification link has been sent.' });
      return;
    }

    if (user.isEmailVerified) {
      res.status(400).json({ error: 'This email is already verified. You can log in.' });
      return;
    }

    // Generate secure token
    const verificationToken = generateSecureToken();
    const hashedVerificationToken = hashToken(verificationToken);

    // Expire any existing verification tokens for this user
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date() },
    });

    await prisma.emailVerificationToken.create({
      data: {
        tokenHash: hashedVerificationToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    await sendVerificationEmail(email, verificationToken);

    res.json({ message: 'If the email exists and is unverified, a new verification link has been sent.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify validity of a staff employee invitation token
 */
export const verifyInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Invitation token is required' });
      return;
    }

    const hashedToken = hashToken(token);

    const invitation = await prisma.invitationToken.findUnique({
      where: { tokenHash: hashedToken },
      include: {
        user: {
          include: {
            staffProfile: true,
          },
        },
      },
    });

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or unknown invitation token' });
      return;
    }

    if (invitation.usedAt) {
      res.status(400).json({ error: 'This invitation link has already been used and activated.' });
      return;
    }

    if (invitation.expiresAt < new Date()) {
      res.status(400).json({ error: 'This invitation link has expired. Please contact System Administration for a new invite.' });
      return;
    }

    const user = invitation.user;
    const decryptedFirstName = user.firstName ? decryptRandomized(user.firstName) : '';
    const decryptedLastName = user.lastName ? decryptRandomized(user.lastName) : '';
    const decryptedEmail = decryptDeterministic(user.email);

    res.json({
      valid: true,
      email: decryptedEmail,
      firstName: decryptedFirstName,
      lastName: decryptedLastName,
      jobTitle: user.staffProfile?.jobTitle || 'Operations Supervisor',
      department: user.staffProfile?.department || null,
      template: user.staffProfile?.template || 'FULL_OPERATIONS',
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while verifying invitation' });
  }
};

/**
 * Accept staff employee invitation, set initial password, and activate account
 */
export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = acceptInvitationSchema.parse(req.body);

    const hashedToken = hashToken(data.token);

    const invitation = await prisma.invitationToken.findUnique({
      where: { tokenHash: hashedToken },
      include: {
        user: {
          include: {
            staffProfile: true,
          },
        },
      },
    });

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or unknown invitation token' });
      return;
    }

    if (invitation.usedAt) {
      res.status(400).json({ error: 'This invitation link has already been used.' });
      return;
    }

    if (invitation.expiresAt < new Date()) {
      res.status(400).json({ error: 'This invitation link has expired. Please request a new invite.' });
      return;
    }

    const hashedPassword = await hashPassword(data.password);
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash: hashedPassword,
          isActive: true,
          isEmailVerified: true,
        },
      }),
      prisma.invitationToken.update({
        where: { id: invitation.id },
        data: { usedAt: now },
      }),
      prisma.staffProfile.update({
        where: { userId: invitation.userId },
        data: { acceptedAt: now },
      }),
    ]);

    // Record audit log
    const decryptedEmail = decryptDeterministic(invitation.user.email);
    await recordAuditLog({
      userId: invitation.userId,
      action: 'STAFF_INVITATION_ACCEPTED',
      entityType: 'USER',
      entityId: invitation.userId,
      entityName: `${invitation.user.firstName ? decryptRandomized(invitation.user.firstName) : ''} (${decryptedEmail})`,
      summary: `Staff invitation accepted and password set for employee ${decryptedEmail}`,
      metadata: {
        template: invitation.user.staffProfile?.template,
        jobTitle: invitation.user.staffProfile?.jobTitle,
      },
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
    });

    res.json({
      message: 'Account activated successfully. You can now log in to the Operations Command Center.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error while activating staff account' });
    }
  }
};




