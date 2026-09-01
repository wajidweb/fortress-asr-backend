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
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator';
import { Role } from '@prisma/client';
import { z } from 'zod';

/**
 * Decrypt a user object and its nested profiles for API response
 */
function decryptUser(user: any) {
  if (!user) return user;
  const decrypted = {
    ...user,
    email: decryptDeterministic(user.email),
    firstName: decryptRandomized(user.firstName),
    lastName: decryptRandomized(user.lastName),
    phoneNumber: decryptRandomized(user.phoneNumber),
  };
  
  // Universally strip sensitive password hash to guarantee absolute security
  delete decrypted.passwordHash;

  if (decrypted.guardProfile) {
    decrypted.guardProfile = {
      ...decrypted.guardProfile,
      firstName: decryptRandomized(decrypted.guardProfile.firstName),
      lastName: decryptRandomized(decrypted.guardProfile.lastName),
      phoneNumber: decryptRandomized(decrypted.guardProfile.phoneNumber),
      siaLicenceNumber: decryptRandomized(decrypted.guardProfile.siaLicenceNumber),
      rtwDocumentType: decryptRandomized(decrypted.guardProfile.rtwDocumentType),
      rtwDocumentUrl: decryptRandomized(decrypted.guardProfile.rtwDocumentUrl),
      emergencyContactName: decryptRandomized(decrypted.guardProfile.emergencyContactName),
      emergencyContactPhone: decryptRandomized(decrypted.guardProfile.emergencyContactPhone),
    };
  }
  if (decrypted.clientProfile) {
    decrypted.clientProfile = {
      ...decrypted.clientProfile,
      companyName: decryptRandomized(decrypted.clientProfile.companyName),
      billingAddress: decryptRandomized(decrypted.clientProfile.billingAddress),
      logoUrl: decryptRandomized(decrypted.clientProfile.logoUrl),
      contactPerson: decryptRandomized(decrypted.clientProfile.contactPerson),
      contactPhone: decryptRandomized(decrypted.clientProfile.contactPhone),
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
        firstName: encryptRandomized(data.firstName),
        lastName: encryptRandomized(data.lastName),
        phoneNumber: encryptRandomized(data.phoneNumber),
        role: Role.GUARD,
        guardProfile: {
          create: {
            firstName: encryptRandomized(data.firstName),
            lastName: encryptRandomized(data.lastName),
            phoneNumber: encryptRandomized(data.phoneNumber),
            siaLicenceNumber: data.siaLicenceNumber ? encryptRandomized(data.siaLicenceNumber) : null,
            siaExpiryDate: data.siaExpiryDate || null,
            rtwDocumentType: data.rtwDocumentType ? encryptRandomized(data.rtwDocumentType) : null,
            rightToWorkExpiryDate: data.rtwExpiryDate || null,
            hasIndefiniteRTW: data.hasIndefiniteRtw || false,
            rtwDocumentUrl: data.rtwDocumentUrl ? encryptRandomized(data.rtwDocumentUrl) : null,
          },
        },
      },
    });

    res.status(201).json({ message: 'Guard registered successfully', userId: user.id });
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
        firstName: encryptRandomized(data.firstName),
        lastName: encryptRandomized(data.lastName),
        role: Role.CLIENT,
        clientProfile: {
          create: {
            companyName: encryptRandomized(data.companyName),
            billingAddress: encryptRandomized(data.billingAddress),
            logoUrl: data.logoUrl ? encryptRandomized(data.logoUrl) : null,
            contactPerson: encryptRandomized(`${data.firstName} ${data.lastName}`),
            contactPhone: data.phoneNumber ? encryptRandomized(data.phoneNumber) : null,
            slug: data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          },
        },
      },
    });

    res.status(201).json({ message: 'Client registered successfully', userId: user.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      if ((error as any).code === 'P2002') {
         res.status(400).json({ error: 'Company name results in a slug that already exists. Please choose a slightly different name.' });
         return;
      }
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
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, data.password);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const payload = { userId: user.id, role: user.role };
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
      user: {
        id: user.id,
        email: decryptDeterministic(user.email),
        firstName: decryptRandomized(user.firstName),
        lastName: decryptRandomized(user.lastName),
        role: user.role,
      },
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
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
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

    const payload = { userId: decoded.userId, role: decoded.role };
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


