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

    // Process multipart inputs (Casts boolean string and attaches multer file path link if uploaded)
    const rawBody = { ...req.body };
    
    if (rawBody.hasIndefiniteRtw !== undefined) {
      rawBody.hasIndefiniteRtw = rawBody.hasIndefiniteRtw === 'true' || rawBody.hasIndefiniteRtw === true;
    }
    
    // If a document was successfully uploaded, save its local path
    if (req.file) {
      rawBody.rtwDocumentUrl = `/uploads/rtw-documents/${req.file.filename}`;
    }

    const data = updateGuardProfileSchema.parse(rawBody);

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

    // Update Guard Profile details in SQL, securely encrypting all PII at rest (including file link!)
    await prisma.guardProfile.update({
      where: { userId: userAuth.userId },
      data: {
        firstName: data.firstName ? encryptRandomized(data.firstName) : undefined,
        lastName: data.lastName ? encryptRandomized(data.lastName) : undefined,
        phoneNumber: encryptRandomized(data.phoneNumber),
        siaLicenceNumber: encryptRandomized(data.siaLicenceNumber),
        siaExpiryDate: data.siaExpiryDate,
        rtwDocumentType: encryptRandomized(data.rtwDocumentType),
        rightToWorkExpiryDate: data.rtwExpiryDate,
        hasIndefiniteRTW: data.hasIndefiniteRtw,
        rtwDocumentUrl: encryptRandomized(data.rtwDocumentUrl),
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
