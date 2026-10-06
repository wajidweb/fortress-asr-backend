import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { decryptRandomized, decryptDeterministic } from '../utils/crypto';
import { GuardStatus, ClientStatus, Role } from '@prisma/client';

/**
 * Helper to decrypt a Guard Profile completely before returning to Admins for audits
 */
function decryptGuardProfile(profile: any) {
  if (!profile) return profile;
  return {
    ...profile,
    firstName: profile.firstName ? decryptRandomized(profile.firstName) : '',
    lastName: profile.lastName ? decryptRandomized(profile.lastName) : '',
    phoneNumber: profile.phoneNumber ? decryptRandomized(profile.phoneNumber) : null,
    profilePictureUrl: profile.profilePictureUrl || null,
    siaLicenceNumber: profile.siaLicenceNumber ? decryptRandomized(profile.siaLicenceNumber) : null,
    rtwDocumentType: profile.rtwDocumentType ? decryptRandomized(profile.rtwDocumentType) : null,
    rtwDocumentUrl: profile.rtwDocumentUrl ? decryptRandomized(profile.rtwDocumentUrl) : null,
    emergencyContactName: profile.emergencyContactName ? decryptRandomized(profile.emergencyContactName) : null,
    emergencyContactPhone: profile.emergencyContactPhone ? decryptRandomized(profile.emergencyContactPhone) : null,
    user: profile.user ? {
      ...profile.user,
      email: decryptDeterministic(profile.user.email),
      firstName: profile.user.firstName ? decryptRandomized(profile.user.firstName) : '',
      lastName: profile.user.lastName ? decryptRandomized(profile.user.lastName) : '',
      phoneNumber: profile.user.phoneNumber ? decryptRandomized(profile.user.phoneNumber) : null,
    } : undefined
  };
}

/**
 * Helper to decrypt a Client Profile completely before returning to Admins for audits
 */
function decryptClientProfile(profile: any) {
  if (!profile) return profile;
  return {
    ...profile,
    companyName: profile.companyName ? decryptRandomized(profile.companyName) : '',
    billingAddress: profile.billingAddress ? decryptRandomized(profile.billingAddress) : '',
    contactPerson: profile.contactPerson ? decryptRandomized(profile.contactPerson) : null,
    contactPhone: profile.contactPhone ? decryptRandomized(profile.contactPhone) : null,
    logoUrl: profile.logoUrl ? decryptRandomized(profile.logoUrl) : null,
    user: profile.user ? {
      ...profile.user,
      email: decryptDeterministic(profile.user.email),
      firstName: decryptRandomized(profile.user.firstName),
      lastName: decryptRandomized(profile.user.lastName),
      phoneNumber: profile.user.phoneNumber ? decryptRandomized(profile.user.phoneNumber) : null,
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

/**
 * Fetch all Client accounts and profiles with optional status filtering for Admin audits
 */
export const getClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    // Fetch all client users with their profiles and sites
    const clientUsers = await prisma.user.findMany({
      where: {
        role: Role.CLIENT,
      },
      include: {
        clientProfile: {
          include: {
            sites: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const decryptedClients = clientUsers.map((user) => {
      const profile = user.clientProfile;
      const decryptedUser = {
        id: user.id,
        email: decryptDeterministic(user.email),
        firstName: decryptRandomized(user.firstName),
        lastName: decryptRandomized(user.lastName),
        phoneNumber: user.phoneNumber ? decryptRandomized(user.phoneNumber) : null,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
      };

      const clientStatus = profile?.status || (user.isActive ? ClientStatus.PENDING_APPROVAL : ClientStatus.SUSPENDED);

      return {
        id: profile?.id || user.id,
        userId: user.id,
        companyName: profile ? decryptRandomized(profile.companyName) : '',
        urlSlug: profile?.urlSlug || '',
        billingAddress: profile ? decryptRandomized(profile.billingAddress) : '',
        logoUrl: profile?.logoUrl ? decryptRandomized(profile.logoUrl) : null,
        status: clientStatus,
        billingRateHour: profile?.billingRateHour ? String(profile.billingRateHour) : '0.00',
        contactPerson: profile?.contactPerson ? decryptRandomized(profile.contactPerson) : (`${decryptedUser.firstName} ${decryptedUser.lastName}`.trim() || null),
        contactPhone: profile?.contactPhone ? decryptRandomized(profile.contactPhone) : (decryptedUser.phoneNumber || null),
        sites: profile?.sites || [],
        sitesCount: profile?.sites?.length || 0,
        createdAt: profile?.createdAt || user.createdAt,
        updatedAt: profile?.updatedAt || user.updatedAt,
        isProfileComplete: !!(profile && profile.companyName),
        user: decryptedUser,
      };
    });

    // Apply optional status filtering (?status=PENDING_APPROVAL | ACTIVE | SUSPENDED)
    const filteredClients = status && status !== 'ALL'
      ? decryptedClients.filter((c) => c.status === status)
      : decryptedClients;

    res.json({ clients: filteredClients });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while fetching client records' });
  }
};

/**
 * Approve (Pass) a Client account and profile status to ACTIVE
 */
export const approveClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    let clientProfile = await prisma.clientProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
      include: { user: true, sites: true },
    });

    if (clientProfile) {
      const updated = await prisma.clientProfile.update({
        where: { id: clientProfile.id },
        data: {
          status: ClientStatus.ACTIVE,
        },
        include: { user: true, sites: true },
      });

      await prisma.user.update({
        where: { id: updated.userId },
        data: { isActive: true },
      });

      res.json({
        message: 'Client profile successfully approved and marked as ACTIVE',
        client: decryptClientProfile(updated),
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (user && user.role === Role.CLIENT) {
      await prisma.user.update({
        where: { id },
        data: { isActive: true },
      });
      res.json({
        message: 'Client user marked as active',
        user: {
          id: user.id,
          email: decryptDeterministic(user.email),
          isActive: true,
        },
      });
      return;
    }

    res.status(404).json({ error: 'Client record not found' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during client approval' });
  }
};

/**
 * Reject / Suspend a Client account and profile status
 */
export const rejectClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    let clientProfile = await prisma.clientProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
      include: { user: true, sites: true },
    });

    if (clientProfile) {
      const updated = await prisma.clientProfile.update({
        where: { id: clientProfile.id },
        data: {
          status: ClientStatus.SUSPENDED,
        },
        include: { user: true, sites: true },
      });

      await prisma.user.update({
        where: { id: updated.userId },
        data: { isActive: false },
      });

      res.json({
        message: 'Client profile successfully suspended',
        client: decryptClientProfile(updated),
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (user && user.role === Role.CLIENT) {
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      res.json({
        message: 'Client user marked as suspended',
        user: {
          id: user.id,
          email: decryptDeterministic(user.email),
          isActive: false,
        },
      });
      return;
    }

    res.status(404).json({ error: 'Client record not found' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during client suspension' });
  }
};
