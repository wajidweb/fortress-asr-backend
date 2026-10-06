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

    const rawBody = { ...req.body };
    if (req.file) {
      rawBody.logoUrl = `/uploads/client-logos/${req.file.filename}`;
    }

    const data = updateClientProfileSchema.parse(rawBody);

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

    // Generate or format URL-friendly path slug (max 100 chars, lowercase, alphanumeric and hyphens)
    const baseSlug = (data.urlSlug || data.companyName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90);

    let slug = baseSlug || `client-${userAuth.userId.slice(0, 8)}`;

    // Ensure URL slug uniqueness across clients
    const existingClient = await prisma.clientProfile.findFirst({
      where: {
        urlSlug: slug,
        NOT: { userId: userAuth.userId },
      },
    });

    if (existingClient) {
      slug = `${slug.slice(0, 90)}-${userAuth.userId.slice(0, 6)}`;
    }

    const contactPerson = data.contactPerson 
      ? data.contactPerson 
      : `${data.firstName || ''} ${data.lastName || ''}`.trim();
    
    const contactPhone = data.contactPhone || data.phoneNumber || null;

    let finalLogoUrl: string | null | undefined = undefined;
    if (req.file) {
      finalLogoUrl = `/uploads/client-logos/${req.file.filename}`;
    } else if (data.logoUrl !== undefined) {
      finalLogoUrl = data.logoUrl ? data.logoUrl.trim() : null;
    }

    // Upsert ClientProfile record with official corporate specifications
    await prisma.clientProfile.upsert({
      where: { userId: userAuth.userId },
      create: {
        userId: userAuth.userId,
        companyName: data.companyName.trim(),
        billingAddress: encryptRandomized(data.billingAddress.trim()),
        urlSlug: slug,
        contactPerson: contactPerson ? encryptRandomized(contactPerson) : null,
        contactPhone: contactPhone ? encryptRandomized(contactPhone) : null,
        logoUrl: finalLogoUrl || null,
      },
      update: {
        companyName: data.companyName.trim(),
        billingAddress: encryptRandomized(data.billingAddress.trim()),
        urlSlug: slug,
        contactPerson: contactPerson ? encryptRandomized(contactPerson) : undefined,
        contactPhone: contactPhone ? encryptRandomized(contactPhone) : undefined,
        logoUrl: finalLogoUrl !== undefined ? finalLogoUrl : undefined,
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
