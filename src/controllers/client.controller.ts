import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { encryptRandomized } from '../utils/crypto';
import { updateClientProfileSchema } from '../validators/auth.validator';
import { decryptUser } from './auth.controller';
import { z } from 'zod';

export const updateClientProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;

    // Authenticated user check via requireAuth middleware
    if (!userAuth || userAuth.role !== 'CLIENT') {
      res.status(403).json({ error: 'Authorisation denied. Access restricted to corporate clients.' });
      return;
    }

    const data = updateClientProfileSchema.parse(req.body);

    // Sync user names and phone number on the User record
    if (data.firstName !== undefined || data.lastName !== undefined || data.phoneNumber !== undefined) {
      await prisma.user.update({
        where: { id: userAuth.userId },
        data: {
          firstName: data.firstName ? encryptRandomized(data.firstName) : undefined,
          lastName: data.lastName ? encryptRandomized(data.lastName) : undefined,
          phoneNumber: data.phoneNumber ? encryptRandomized(data.phoneNumber) : undefined,
        },
      });
    }

    // Generate clean URL-safe slug from company name
    let slug = data.companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    if (!slug) {
      slug = `client-${userAuth.userId.slice(0, 8)}`;
    }

    // Check if slug belongs to another client
    const existingClient = await prisma.clientProfile.findFirst({
      where: {
        slug,
        NOT: { userId: userAuth.userId },
      },
    });

    if (existingClient) {
      slug = `${slug}-${userAuth.userId.slice(0, 6)}`;
    }

    const contactPerson = data.contactPerson 
      ? data.contactPerson 
      : `${data.firstName || ''} ${data.lastName || ''}`.trim();
    
    const contactPhone = data.contactPhone || data.phoneNumber || null;

    // Upsert ClientProfile record
    await prisma.clientProfile.upsert({
      where: { userId: userAuth.userId },
      create: {
        userId: userAuth.userId,
        companyName: encryptRandomized(data.companyName),
        billingAddress: encryptRandomized(data.billingAddress),
        slug,
        contactPerson: contactPerson ? encryptRandomized(contactPerson) : null,
        contactPhone: contactPhone ? encryptRandomized(contactPhone) : null,
        logoUrl: data.logoUrl ? encryptRandomized(data.logoUrl) : null,
      },
      update: {
        companyName: encryptRandomized(data.companyName),
        billingAddress: encryptRandomized(data.billingAddress),
        slug,
        contactPerson: contactPerson ? encryptRandomized(contactPerson) : undefined,
        contactPhone: contactPhone ? encryptRandomized(contactPhone) : undefined,
        logoUrl: data.logoUrl ? encryptRandomized(data.logoUrl) : undefined,
      },
    });

    // Retrieve fresh User record with clientProfile
    const freshUser = await prisma.user.findUnique({
      where: { id: userAuth.userId },
      include: { clientProfile: true },
    });

    res.json({
      message: 'Client profile updated successfully',
      user: decryptUser(freshUser),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
