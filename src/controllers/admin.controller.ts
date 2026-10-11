import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { decryptRandomized, decryptDeterministic } from '../utils/crypto';
import { GuardStatus, ClientStatus, Role, ServiceRequestStatus, ServiceRequestUrgency, ServiceRequestType, ShiftStatus } from '@prisma/client';
import { 
  approveSiteServiceRequestSchema,
  assessSiteServiceRequestSchema,
  rejectSiteServiceRequestSchema,
  updateSiteSchema 
} from '../validators/site-request.validator';
import { z } from 'zod';
import { recordAuditLog, getAuditLogs, getAuditLogById } from '../services/audit.service';

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
 * Fetch Guard Profiles with status filtering, search & pagination for Admin audits
 */
export const getGuards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query;
    const isExport = req.query.export === 'true';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = isExport ? 1000 : Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    // Fetch all guard profiles to perform accurate decrypted search, status counts & pagination
    const allGuards = await prisma.guardProfile.findMany({
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const decryptedAll = allGuards.map(decryptGuardProfile);

    // Compute status stats across all roster guards
    const stats = {
      total: decryptedAll.length,
      pendingApproval: decryptedAll.filter((g) => g.status === GuardStatus.PENDING_APPROVAL).length,
      active: decryptedAll.filter((g) => g.status === GuardStatus.ACTIVE).length,
      suspended: decryptedAll.filter((g) => g.status === GuardStatus.SUSPENDED).length,
    };

    // Apply status filter
    let filtered = status && status !== 'ALL'
      ? decryptedAll.filter((g) => g.status === (status as GuardStatus))
      : decryptedAll;

    // Apply search filter on decrypted attributes (names, email, phone, SIA license number)
    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((g) => {
        const name = `${g.firstName || g.user?.firstName || ''} ${g.lastName || g.user?.lastName || ''}`.toLowerCase();
        const email = (g.user?.email || '').toLowerCase();
        const phone = (g.phoneNumber || g.user?.phoneNumber || '').toLowerCase();
        const sia = (g.siaLicenceNumber || '').toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q) || sia.includes(q);
      });
    }

    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const paginatedGuards = isExport
      ? filtered
      : filtered.slice((page - 1) * limit, page * limit);

    res.json({
      guards: paginatedGuards,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while fetching guard profiles' });
  }
};

/**
 * Approve (Pass) a registered Guard, upgrading their status to ACTIVE
 */
export const approveGuard = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const existingGuard = await prisma.guardProfile.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existingGuard) {
      res.status(404).json({ error: 'Guard profile not found' });
      return;
    }

    const profile = await prisma.guardProfile.update({
      where: { id },
      data: {
        status: GuardStatus.ACTIVE,
      },
      include: {
        user: true,
      },
    });

    const guardName = `${decryptRandomized(profile.firstName)} ${decryptRandomized(profile.lastName)}`.trim() || 'Officer';
    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'GUARD_APPROVED',
      entityType: 'GUARD',
      entityId: profile.id,
      entityName: guardName,
      summary: `Approved guard application for ${guardName} (Status set to ACTIVE)`,
      previousValues: { status: existingGuard.status },
      newValues: { status: GuardStatus.ACTIVE },
      reason: 'Application approved by Super Admin',
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
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
    const userAuth = (req as any).user;
    const { id } = req.params;

    const existingGuard = await prisma.guardProfile.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existingGuard) {
      res.status(404).json({ error: 'Guard profile not found' });
      return;
    }

    const profile = await prisma.guardProfile.update({
      where: { id },
      data: {
        status: GuardStatus.SUSPENDED,
      },
      include: {
        user: true,
      },
    });

    const guardName = `${decryptRandomized(profile.firstName)} ${decryptRandomized(profile.lastName)}`.trim() || 'Officer';
    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'GUARD_SUSPENDED',
      entityType: 'GUARD',
      entityId: profile.id,
      entityName: guardName,
      summary: `Suspended guard application for ${guardName} (Status set to SUSPENDED)`,
      previousValues: { status: existingGuard.status },
      newValues: { status: GuardStatus.SUSPENDED },
      reason: 'Application rejected / suspended by Super Admin',
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
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
 * Fetch all Client accounts and profiles with status filtering, search & pagination for Admin audits
 */
export const getClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query;
    const isExport = req.query.export === 'true';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = isExport ? 1000 : Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

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

    // Compute stats across all corporate clients
    const stats = {
      total: decryptedClients.length,
      pendingApproval: decryptedClients.filter((c) => c.status === ClientStatus.PENDING_APPROVAL).length,
      active: decryptedClients.filter((c) => c.status === ClientStatus.ACTIVE).length,
      suspended: decryptedClients.filter((c) => c.status === ClientStatus.SUSPENDED).length,
    };

    // Apply optional status filtering (?status=PENDING_APPROVAL | ACTIVE | SUSPENDED)
    let filteredClients = status && status !== 'ALL'
      ? decryptedClients.filter((c) => c.status === status)
      : decryptedClients;

    // Apply search filter on decrypted attributes (companyName, email, contactPerson, representative names, slug)
    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filteredClients = filteredClients.filter((c) => {
        const company = (c.companyName || '').toLowerCase();
        const email = (c.user?.email || '').toLowerCase();
        const contact = (c.contactPerson || '').toLowerCase();
        const repName = `${c.user?.firstName || ''} ${c.user?.lastName || ''}`.toLowerCase();
        const phone = (c.contactPhone || c.user?.phoneNumber || '').toLowerCase();
        const address = (c.billingAddress || '').toLowerCase();
        const slug = (c.urlSlug || '').toLowerCase();
        return company.includes(q) || email.includes(q) || contact.includes(q) || repName.includes(q) || phone.includes(q) || address.includes(q) || slug.includes(q);
      });
    }

    const totalCount = filteredClients.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const paginatedClients = isExport
      ? filteredClients
      : filteredClients.slice((page - 1) * limit, page * limit);

    res.json({
      clients: paginatedClients,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error while fetching client records' });
  }
};

/**
 * Approve (Pass) a Client account and profile status to ACTIVE
 */
export const approveClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    let clientProfile = await prisma.clientProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
      include: { user: true, sites: true },
    });

    if (clientProfile) {
      const companyName = clientProfile.companyName ? decryptRandomized(clientProfile.companyName) : 'Corporate Client';

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

      await recordAuditLog({
        userId: userAuth?.userId || null,
        action: 'CLIENT_APPROVED',
        entityType: 'CLIENT',
        entityId: clientProfile.id,
        entityName: companyName,
        summary: `Approved client company ${companyName} (Status set to ACTIVE)`,
        previousValues: {
          status: clientProfile.status,
          isActive: clientProfile.user?.isActive ?? false,
        },
        newValues: {
          status: ClientStatus.ACTIVE,
          isActive: true,
        },
        reason: 'Client company approved by Super Admin',
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
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

      const userEmail = decryptDeterministic(user.email);
      await recordAuditLog({
        userId: userAuth?.userId || null,
        action: 'CLIENT_APPROVED',
        entityType: 'CLIENT',
        entityId: user.id,
        entityName: userEmail,
        summary: `Activated client user ${userEmail}`,
        previousValues: { isActive: user.isActive },
        newValues: { isActive: true },
        reason: 'Client activated by Super Admin',
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
      });

      res.json({
        message: 'Client user marked as active',
        user: {
          id: user.id,
          email: userEmail,
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
    const userAuth = (req as any).user;
    const { id } = req.params;

    let clientProfile = await prisma.clientProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
      include: { user: true, sites: true },
    });

    if (clientProfile) {
      const companyName = clientProfile.companyName ? decryptRandomized(clientProfile.companyName) : 'Corporate Client';

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

      await recordAuditLog({
        userId: userAuth?.userId || null,
        action: 'CLIENT_SUSPENDED',
        entityType: 'CLIENT',
        entityId: clientProfile.id,
        entityName: companyName,
        summary: `Suspended client company ${companyName} (Status set to SUSPENDED)`,
        previousValues: {
          status: clientProfile.status,
          isActive: clientProfile.user?.isActive ?? true,
        },
        newValues: {
          status: ClientStatus.SUSPENDED,
          isActive: false,
        },
        reason: 'Client company suspended by Super Admin',
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
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

      const userEmail = decryptDeterministic(user.email);
      await recordAuditLog({
        userId: userAuth?.userId || null,
        action: 'CLIENT_SUSPENDED',
        entityType: 'CLIENT',
        entityId: user.id,
        entityName: userEmail,
        summary: `Suspended client user ${userEmail}`,
        previousValues: { isActive: user.isActive },
        newValues: { isActive: false },
        reason: 'Client suspended by Super Admin',
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
      });

      res.json({
        message: 'Client user marked as suspended',
        user: {
          id: user.id,
          email: userEmail,
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

/**
 * Retrieve all Client Site Service Requests for Operations Management with Pagination & Stats
 */
export const getSiteServiceRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, urgency, clientId, type, search } = req.query;

    const isExport = req.query.export === 'true' || req.query.all === 'true';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = isExport ? 10000 : Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));
    const skip = isExport ? 0 : (page - 1) * limit;

    const whereClause: any = {};
    if (status && status !== 'ALL') {
      whereClause.status = status as ServiceRequestStatus;
    }
    if (urgency && urgency !== 'ALL') {
      whereClause.urgency = urgency as ServiceRequestUrgency;
    }
    if (clientId) {
      whereClause.clientId = String(clientId);
    }
    if (type && type !== 'ALL') {
      whereClause.type = type as ServiceRequestType;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      whereClause.OR = [
        { propertyName: { contains: q } },
        { propertyAddress: { contains: q } },
        { city: { contains: q } },
        { postcode: { contains: q } },
        { client: { companyName: { contains: q } } },
      ];
    }

    const [totalCount, requests, totalAll, pendingCount, assessmentCount, approvedCount] = await Promise.all([
      prisma.siteServiceRequest.count({ where: whereClause }),
      prisma.siteServiceRequest.findMany({
        where: whereClause,
        include: {
          client: {
            include: {
              user: true,
            },
          },
          site: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.siteServiceRequest.count(),
      prisma.siteServiceRequest.count({ where: { status: ServiceRequestStatus.PENDING_REVIEW } }),
      prisma.siteServiceRequest.count({ where: { status: ServiceRequestStatus.UNDER_ASSESSMENT } }),
      prisma.siteServiceRequest.count({ where: { status: ServiceRequestStatus.APPROVED } }),
    ]);

    const formattedRequests = requests.map((reqItem) => ({
      ...reqItem,
      client: reqItem.client ? decryptClientProfile(reqItem.client) : null,
    }));

    res.json({
      requests: formattedRequests,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      stats: {
        total: totalAll,
        pendingReview: pendingCount,
        underAssessment: assessmentCount,
        approved: approvedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve site service requests' });
  }
};

/**
 * Retrieve single Site Service Request by ID
 */
export const getSiteServiceRequestById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const request = await prisma.siteServiceRequest.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            user: true,
          },
        },
        site: true,
      },
    });

    if (!request) {
      res.status(404).json({ error: 'Site service request not found' });
      return;
    }

    res.json({
      request: {
        ...request,
        client: request.client ? decryptClientProfile(request.client) : null,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve service request details' });
  }
};

/**
 * Mark request as UNDER_ASSESSMENT and record supervisor notes
 */
export const assessSiteServiceRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const parsedData = assessSiteServiceRequestSchema.parse(req.body);

    const existingRequest = await prisma.siteServiceRequest.findUnique({
      where: { id },
    });

    if (!existingRequest) {
      res.status(404).json({ error: 'Site service request not found' });
      return;
    }

    const updated = await prisma.siteServiceRequest.update({
      where: { id },
      data: {
        status: ServiceRequestStatus.UNDER_ASSESSMENT,
        adminFeedbackNotes: parsedData.adminFeedbackNotes || existingRequest.adminFeedbackNotes,
        reviewedByUserId: userAuth?.userId || null,
        reviewedAt: new Date(),
      },
      include: {
        client: { include: { user: true } },
        site: true,
      },
    });

    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'SITE_REQUEST_ASSESSED',
      entityType: 'SERVICE_REQUEST',
      entityId: id,
      entityName: existingRequest.propertyName,
      summary: `Moved site request for ${existingRequest.propertyName} to Assessment`,
      previousValues: {
        status: existingRequest.status,
        adminFeedbackNotes: existingRequest.adminFeedbackNotes,
      },
      newValues: {
        status: ServiceRequestStatus.UNDER_ASSESSMENT,
        adminFeedbackNotes: parsedData.adminFeedbackNotes || existingRequest.adminFeedbackNotes,
      },
      reason: parsedData.adminFeedbackNotes || 'Under Assessment',
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
    });

    res.json({
      message: 'Service request moved to assessment stage',
      request: {
        ...updated,
        client: updated.client ? decryptClientProfile(updated.client) : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to update request assessment' });
    }
  }
};

/**
 * Approve Site Service Request and Provision Official Physical Site with Geofence Centerpoint
 */
export const approveSiteServiceRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const parsedData = approveSiteServiceRequestSchema.parse(req.body);

    const existingRequest = await prisma.siteServiceRequest.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!existingRequest) {
      res.status(404).json({ error: 'Site service request not found' });
      return;
    }

    if (existingRequest.status === ServiceRequestStatus.APPROVED) {
      res.status(400).json({ error: 'Service request is already approved' });
      return;
    }

    // Run transaction: create Site, update request, and write encrypted AuditLog
    const result = await prisma.$transaction(async (tx) => {
      let provisionedSiteId = existingRequest.siteId;

      if (!provisionedSiteId) {
        // Create new physical site geofence entry
        const newSite = await tx.site.create({
          data: {
            clientId: existingRequest.clientId,
            name: existingRequest.propertyName,
            address: existingRequest.propertyAddress,
            latitude: parsedData.latitude,
            longitude: parsedData.longitude,
            geofenceRadiusMeters: parsedData.geofenceRadiusMeters,
            siteInstructions: parsedData.siteInstructions || existingRequest.specialInstructions || null,
            emergencyContact: parsedData.emergencyContact || (existingRequest.emergencyContactName ? `${existingRequest.emergencyContactName} - ${existingRequest.emergencyContactPhone || ''}`.trim() : null),
          },
        });
        provisionedSiteId = newSite.id;
      } else {
        // Update existing site geofence if values provided
        await tx.site.update({
          where: { id: provisionedSiteId },
          data: {
            latitude: parsedData.latitude,
            longitude: parsedData.longitude,
            geofenceRadiusMeters: parsedData.geofenceRadiusMeters,
            siteInstructions: parsedData.siteInstructions !== undefined ? parsedData.siteInstructions : undefined,
            emergencyContact: parsedData.emergencyContact !== undefined ? parsedData.emergencyContact : undefined,
          },
        });
      }

      // Update Service Request status
      const updatedRequest = await tx.siteServiceRequest.update({
        where: { id },
        data: {
          status: ServiceRequestStatus.APPROVED,
          siteId: provisionedSiteId,
          adminFeedbackNotes: parsedData.adminFeedbackNotes || 'Site approved and geofence provisioned successfully.',
          reviewedByUserId: userAuth?.userId || null,
          reviewedAt: new Date(),
        },
        include: {
          site: true,
          client: { include: { user: true } },
        },
      });

      // Encrypted Audit Log
      await recordAuditLog({
        userId: userAuth?.userId || null,
        action: 'SITE_REQUEST_APPROVED_AND_PROVISIONED',
        entityType: 'SERVICE_REQUEST',
        entityId: id,
        entityName: existingRequest.propertyName,
        summary: `Approved site service request and provisioned geofence for: ${existingRequest.propertyName}`,
        previousValues: {
          status: existingRequest.status,
          siteId: existingRequest.siteId,
        },
        newValues: {
          status: ServiceRequestStatus.APPROVED,
          siteId: provisionedSiteId,
          geofenceRadiusMeters: parsedData.geofenceRadiusMeters,
        },
        metadata: {
          requestId: id,
          siteId: provisionedSiteId,
          siteName: existingRequest.propertyName,
          geofenceRadiusMeters: parsedData.geofenceRadiusMeters,
        },
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
        tx,
      });

      return updatedRequest;
    });

    res.json({
      message: 'Site service request approved and property geofence provisioned successfully',
      request: {
        ...result,
        client: result.client ? decryptClientProfile(result.client) : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to approve and provision site request' });
    }
  }
};

/**
 * Reject Site Service Request with feedback
 */
export const rejectSiteServiceRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const parsedData = rejectSiteServiceRequestSchema.parse(req.body);

    const existingRequest = await prisma.siteServiceRequest.findUnique({
      where: { id },
    });

    if (!existingRequest) {
      res.status(404).json({ error: 'Site service request not found' });
      return;
    }

    const updated = await prisma.siteServiceRequest.update({
      where: { id },
      data: {
        status: ServiceRequestStatus.REJECTED,
        adminFeedbackNotes: parsedData.adminFeedbackNotes,
        reviewedByUserId: userAuth?.userId || null,
        reviewedAt: new Date(),
      },
      include: {
        client: { include: { user: true } },
        site: true,
      },
    });

    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'SITE_REQUEST_REJECTED',
      entityType: 'SERVICE_REQUEST',
      entityId: id,
      entityName: existingRequest.propertyName,
      summary: `Rejected site service request for property: ${existingRequest.propertyName}`,
      previousValues: {
        status: existingRequest.status,
        adminFeedbackNotes: existingRequest.adminFeedbackNotes,
      },
      newValues: {
        status: ServiceRequestStatus.REJECTED,
        adminFeedbackNotes: parsedData.adminFeedbackNotes,
      },
      reason: parsedData.adminFeedbackNotes,
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
    });

    res.json({
      message: 'Site service request rejected',
      request: {
        ...updated,
        client: updated.client ? decryptClientProfile(updated.client) : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to reject site service request' });
    }
  }
};

/**
 * Retrieve all Sites across all clients for Admin Site Management
 */
export const getAllSites = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.query;

    const whereClause: any = {};
    if (clientId) {
      whereClause.clientId = String(clientId);
    }

    const sites = await prisma.site.findMany({
      where: whereClause,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
            urlSlug: true,
          },
        },
        shifts: {
          where: {
            status: ShiftStatus.CHECKED_IN,
          },
          select: {
            id: true,
            guard: {
              select: {
                firstName: true,
                lastName: true,
                profilePictureUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            shifts: true,
            patrolRoutes: true,
            incidents: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedSites = sites.map((site) => ({
      id: site.id,
      name: site.name,
      address: site.address,
      latitude: site.latitude,
      longitude: site.longitude,
      geofenceRadiusMeters: site.geofenceRadiusMeters,
      siteInstructions: site.siteInstructions,
      emergencyContact: site.emergencyContact,
      client: {
        id: site.client.id,
        companyName: decryptRandomized(site.client.companyName),
        logoUrl: site.client.logoUrl,
        urlSlug: site.client.urlSlug,
      },
      activeOfficersCount: site.shifts.length,
      activeShifts: site.shifts.map((s) => ({
        id: s.id,
        guard: {
          firstName: decryptRandomized(s.guard.firstName),
          lastName: decryptRandomized(s.guard.lastName),
          profilePictureUrl: s.guard.profilePictureUrl,
        },
      })),
      totalShifts: site._count.shifts,
      totalPatrolRoutes: site._count.patrolRoutes,
      totalIncidents: site._count.incidents,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    }));

    res.json({ sites: formattedSites });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve physical sites' });
  }
};

/**
 * Update an existing site (geofence, instructions, emergency contacts)
 */
export const updateSite = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;
    const parsedData = updateSiteSchema.parse(req.body);

    const existingSite = await prisma.site.findUnique({
      where: { id },
    });

    if (!existingSite) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const updated = await prisma.site.update({
      where: { id },
      data: {
        name: parsedData.name !== undefined ? parsedData.name.trim() : undefined,
        address: parsedData.address !== undefined ? parsedData.address.trim() : undefined,
        latitude: parsedData.latitude !== undefined ? parsedData.latitude : undefined,
        longitude: parsedData.longitude !== undefined ? parsedData.longitude : undefined,
        geofenceRadiusMeters: parsedData.geofenceRadiusMeters !== undefined ? parsedData.geofenceRadiusMeters : undefined,
        siteInstructions: parsedData.siteInstructions !== undefined ? parsedData.siteInstructions : undefined,
        emergencyContact: parsedData.emergencyContact !== undefined ? parsedData.emergencyContact : undefined,
      },
    });

    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'SITE_UPDATED',
      entityType: 'SITE',
      entityId: id,
      entityName: updated.name,
      summary: `Updated property settings & geofence parameters for ${updated.name}`,
      previousValues: {
        name: existingSite.name,
        address: existingSite.address,
        latitude: existingSite.latitude ? String(existingSite.latitude) : null,
        longitude: existingSite.longitude ? String(existingSite.longitude) : null,
        geofenceRadiusMeters: existingSite.geofenceRadiusMeters,
        siteInstructions: existingSite.siteInstructions,
        emergencyContact: existingSite.emergencyContact,
      },
      newValues: {
        name: updated.name,
        address: updated.address,
        latitude: updated.latitude ? String(updated.latitude) : null,
        longitude: updated.longitude ? String(updated.longitude) : null,
        geofenceRadiusMeters: updated.geofenceRadiusMeters,
        siteInstructions: updated.siteInstructions,
        emergencyContact: updated.emergencyContact,
      },
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || null,
    });

    res.json({
      message: 'Site updated successfully',
      site: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to update site' });
    }
  }
};

/**
 * Retrieve Audit Logs with search, status filtering, date range & pagination
 * All records stored in database are encrypted with AES-256 and decrypted exclusively for authorized Super Admins.
 */
export const getAuditLogsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page,
      limit,
      search,
      entityType,
      action,
      userId,
      startDate,
      endDate,
    } = req.query;

    const isExport = req.query.export === 'true' || req.query.all === 'true';

    const result = await getAuditLogs({
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
      search: typeof search === 'string' ? search : undefined,
      entityType: typeof entityType === 'string' ? entityType : undefined,
      action: typeof action === 'string' ? action : undefined,
      userId: typeof userId === 'string' ? userId : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      exportAll: isExport,
    });

    res.json(result);
  } catch (error: any) {
    console.error('CRITICAL: Error in getAuditLogsController:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve encrypted audit logs',
      message: error?.message || 'Database query error',
    });
  }
};

/**
 * Retrieve single decrypted Audit Log by ID
 */
export const getAuditLogByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const log = await getAuditLogById(id);
    if (!log) {
      res.status(404).json({ error: 'Audit log entry not found' });
      return;
    }

    res.json({ log });
  } catch (error: any) {
    console.error('CRITICAL: Error in getAuditLogByIdController:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve audit log details',
      message: error?.message || 'Database query error',
    });
  }
};
