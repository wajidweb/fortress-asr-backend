import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { decryptRandomized, decryptDeterministic } from '../utils/crypto';
import { GuardStatus } from '@prisma/client';

/**
 * Helper to decrypt a Guard Profile completely before returning to Admins for audits
 */
function decryptGuardProfile(profile: any) {
  if (!profile) return profile;
  return {
    ...profile,
    firstName: decryptRandomized(profile.firstName),
    lastName: decryptRandomized(profile.lastName),
    phoneNumber: decryptRandomized(profile.phoneNumber),
    siaLicenceNumber: decryptRandomized(profile.siaLicenceNumber),
    rtwDocumentType: decryptRandomized(profile.rtwDocumentType),
    rtwDocumentUrl: decryptRandomized(profile.rtwDocumentUrl),
    emergencyContactName: decryptRandomized(profile.emergencyContactName),
    emergencyContactPhone: decryptRandomized(profile.emergencyContactPhone),
    user: profile.user ? {
      ...profile.user,
      email: decryptDeterministic(profile.user.email),
      firstName: decryptRandomized(profile.user.firstName),
      lastName: decryptRandomized(profile.user.lastName),
      phoneNumber: decryptRandomized(profile.user.phoneNumber),
    } : undefined
  };
}

/**
 * Fetch all Guard Profiles with optional status filtering for Admin audits
 */
export const getGuards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    const guards = await prisma.guardProfile.findMany({
      where: status ? { status: status as GuardStatus } : undefined,
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const decryptedGuards = guards.map(decryptGuardProfile);

    res.json({ guards: decryptedGuards });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while fetching guard profiles' });
  }
};

/**
 * Approve (Pass) a registered Guard, upgrading their status to ACTIVE
 */
export const approveGuard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const profile = await prisma.guardProfile.update({
      where: { id },
      data: {
        status: GuardStatus.ACTIVE,
      },
      include: {
        user: true,
      },
    });

    res.json({ 
      message: 'Guard successfully approved and marked as ACTIVE', 
      guard: decryptGuardProfile(profile) 
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during guard approval' });
  }
};

/**
 * Reject (Lock/Suspend) a Guard record
 */
export const rejectGuard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const profile = await prisma.guardProfile.update({
      where: { id },
      data: {
        status: GuardStatus.SUSPENDED,
      },
      include: {
        user: true,
      },
    });

    res.json({ 
      message: 'Guard profile successfully rejected and marked as SUSPENDED', 
      guard: decryptGuardProfile(profile) 
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during guard rejection' });
  }
};
