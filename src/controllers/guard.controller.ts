import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { encryptRandomized, decryptRandomized, decryptDeterministic } from '../utils/crypto';
import { updateGuardProfileSchema } from '../validators/auth.validator';
import { z } from 'zod';

/**
 * Helper to decrypt a user profile response cleanly
 */
function decryptUser(user: any) {
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
  return decrypted;
}

export const updateGuardProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    
    // Authenticated user check via requireAuth middleware
    if (!userAuth || userAuth.role !== 'GUARD') {
      res.status(403).json({ error: 'Authorisation denied. Access restricted to compliant officers.' });
      return;
    }

    // Process multipart inputs (Casts boolean string and attaches multer file path links if uploaded)
    const rawBody = { ...req.body };
    
    if (rawBody.hasIndefiniteRtw !== undefined) {
      rawBody.hasIndefiniteRtw = rawBody.hasIndefiniteRtw === 'true' || rawBody.hasIndefiniteRtw === true;
    }
    
    // Handle both files from multer.fields and fallback multer.single
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      if (files['rtwDocument'] && files['rtwDocument'][0]) {
        rawBody.rtwDocumentUrl = `/uploads/rtw-documents/${files['rtwDocument'][0].filename}`;
      }
      if (files['photo'] && files['photo'][0]) {
        rawBody.profilePictureUrl = `/uploads/guard-photos/${files['photo'][0].filename}`;
      }
    } else if (req.file) {
      if (req.file.fieldname === 'photo') {
        rawBody.profilePictureUrl = `/uploads/guard-photos/${req.file.filename}`;
      } else {
        rawBody.rtwDocumentUrl = `/uploads/rtw-documents/${req.file.filename}`;
      }
    }

    const data = updateGuardProfileSchema.parse(rawBody);

    let finalProfilePictureUrl: string | null | undefined = undefined;
    if (data.profilePictureUrl !== undefined) {
      finalProfilePictureUrl = data.profilePictureUrl ? data.profilePictureUrl.trim() : null;
    }

    // Sync PII details (First Name, Last Name, and Phone Number) to the main User credential record if updated
    if (data.firstName || data.lastName || data.phoneNumber) {
      await prisma.user.update({
        where: { id: userAuth.userId },
        data: {
          firstName: data.firstName ? encryptRandomized(data.firstName) : undefined,
          lastName: data.lastName ? encryptRandomized(data.lastName) : undefined,
          phoneNumber: data.phoneNumber ? encryptRandomized(data.phoneNumber) : undefined,
        },
      });
    }

    // Update or create Guard Profile details in SQL, securely encrypting all PII at rest
    await prisma.guardProfile.upsert({
      where: { userId: userAuth.userId },
      create: {
        userId: userAuth.userId,
        firstName: data.firstName ? encryptRandomized(data.firstName) : '',
        lastName: data.lastName ? encryptRandomized(data.lastName) : '',
        phoneNumber: encryptRandomized(data.phoneNumber),
        siaLicenceNumber: encryptRandomized(data.siaLicenceNumber),
        siaExpiryDate: data.siaExpiryDate,
        rtwDocumentType: encryptRandomized(data.rtwDocumentType),
        rightToWorkExpiryDate: data.rtwExpiryDate,
        hasIndefiniteRTW: data.hasIndefiniteRtw,
        rtwDocumentUrl: encryptRandomized(data.rtwDocumentUrl),
        profilePictureUrl: finalProfilePictureUrl || null,
      },
      update: {
        firstName: data.firstName ? encryptRandomized(data.firstName) : undefined,
        lastName: data.lastName ? encryptRandomized(data.lastName) : undefined,
        phoneNumber: encryptRandomized(data.phoneNumber),
        siaLicenceNumber: encryptRandomized(data.siaLicenceNumber),
        siaExpiryDate: data.siaExpiryDate,
        rtwDocumentType: encryptRandomized(data.rtwDocumentType),
        rightToWorkExpiryDate: data.rtwExpiryDate,
        hasIndefiniteRTW: data.hasIndefiniteRtw,
        rtwDocumentUrl: encryptRandomized(data.rtwDocumentUrl),
        profilePictureUrl: finalProfilePictureUrl !== undefined ? finalProfilePictureUrl : undefined,
      },
    });

    // Retrieve full updated User profile and return clean decrypted results
    const freshUser = await prisma.user.findUnique({
      where: { id: userAuth.userId },
      include: { guardProfile: true },
    });

    res.json({
      message: 'Guard profile updated successfully with secure document upload',
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
