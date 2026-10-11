import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { encryptRandomized, decryptRandomized } from '../utils/crypto';
import { updateClientProfileSchema } from '../validators/auth.validator';
import { createSiteServiceRequestSchema, updateSiteServiceRequestSchema } from '../validators/site-request.validator';
import { decryptUser } from './auth.controller';
import { z } from 'zod';
import { ServiceRequestStatus, ShiftStatus } from '@prisma/client';

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

/**
 * Submit a new Site or Service deployment request by corporate client
 */
export const createSiteServiceRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    if (!userAuth || userAuth.role !== 'CLIENT') {
      res.status(403).json({ error: 'Authorisation denied. Access restricted to corporate clients.' });
      return;
    }

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.status(400).json({ error: 'Please complete your corporate client profile before requesting site deployments.' });
      return;
    }

    const parsedData = createSiteServiceRequestSchema.parse(req.body);

    // If siteId provided, verify it belongs to this client
    if (parsedData.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: parsedData.siteId, clientId: clientProfile.id },
      });
      if (!site) {
        res.status(404).json({ error: 'Specified existing site not found or access denied.' });
        return;
      }
    }

    const request = await prisma.siteServiceRequest.create({
      data: {
        clientId: clientProfile.id,
        siteId: parsedData.siteId || null,
        type: parsedData.type,
        status: ServiceRequestStatus.PENDING_REVIEW,
        urgency: parsedData.urgency,
        propertyName: parsedData.propertyName.trim(),
        propertyAddress: parsedData.propertyAddress.trim(),
        city: parsedData.city?.trim() || null,
        postcode: parsedData.postcode?.trim() || null,
        suggestedLatitude: parsedData.suggestedLatitude !== undefined && parsedData.suggestedLatitude !== null ? parsedData.suggestedLatitude : null,
        suggestedLongitude: parsedData.suggestedLongitude !== undefined && parsedData.suggestedLongitude !== null ? parsedData.suggestedLongitude : null,
        requiredGuardsCount: parsedData.requiredGuardsCount,
        serviceStartDate: parsedData.serviceStartDate,
        serviceEndDate: parsedData.serviceEndDate || null,
        shiftScheduleNotes: parsedData.shiftScheduleNotes?.trim() || null,
        specialInstructions: parsedData.specialInstructions?.trim() || null,
        emergencyContactName: parsedData.emergencyContactName?.trim() || null,
        emergencyContactPhone: parsedData.emergencyContactPhone?.trim() || null,
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Site service deployment request submitted successfully. Pending operational review.',
      request,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error while creating site request' });
    }
  }
};

/**
 * Retrieve all site service requests for the authenticated corporate client with pagination & stats
 */
export const getMySiteServiceRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    if (!userAuth || userAuth.role !== 'CLIENT') {
      res.status(403).json({ error: 'Authorisation denied. Access restricted to corporate clients.' });
      return;
    }

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.json({
        requests: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 1 },
        stats: { total: 0, pendingReview: 0, underAssessment: 0, approved: 0 },
      });
      return;
    }

    const { status, type, urgency, search } = req.query;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const whereClause: any = { clientId: clientProfile.id };
    if (status && status !== 'ALL') {
      whereClause.status = status as ServiceRequestStatus;
    }
    if (type && type !== 'ALL') {
      whereClause.type = type;
    }
    if (urgency && urgency !== 'ALL') {
      whereClause.urgency = urgency;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      whereClause.OR = [
        { propertyName: { contains: q } },
        { propertyAddress: { contains: q } },
        { city: { contains: q } },
        { postcode: { contains: q } },
      ];
    }

    const [totalCount, requests, totalAll, pendingCount, assessmentCount, approvedCount] = await Promise.all([
      prisma.siteServiceRequest.count({ where: whereClause }),
      prisma.siteServiceRequest.findMany({
        where: whereClause,
        include: {
          site: {
            select: {
              id: true,
              name: true,
              address: true,
              latitude: true,
              longitude: true,
              geofenceRadiusMeters: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.siteServiceRequest.count({ where: { clientId: clientProfile.id } }),
      prisma.siteServiceRequest.count({ where: { clientId: clientProfile.id, status: ServiceRequestStatus.PENDING_REVIEW } }),
      prisma.siteServiceRequest.count({ where: { clientId: clientProfile.id, status: ServiceRequestStatus.UNDER_ASSESSMENT } }),
      prisma.siteServiceRequest.count({ where: { clientId: clientProfile.id, status: ServiceRequestStatus.APPROVED } }),
    ]);

    res.json({
      requests,
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
 * Retrieve single site service request by ID
 */
export const getMySiteServiceRequestById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.status(404).json({ error: 'Client profile not found' });
      return;
    }

    const request = await prisma.siteServiceRequest.findFirst({
      where: { id, clientId: clientProfile.id },
      include: {
        site: true,
      },
    });

    if (!request) {
      res.status(404).json({ error: 'Service request not found or access denied' });
      return;
    }

    res.json({ request });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve service request' });
  }
};

/**
 * Update an existing site service deployment request
 * Restricted strictly to requests in PENDING_REVIEW status (before SOC or Admin assessment/approval/rejection)
 */
export const updateSiteServiceRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    if (!userAuth || userAuth.role !== 'CLIENT') {
      res.status(403).json({ error: 'Authorisation denied. Access restricted to corporate clients.' });
      return;
    }

    const { id } = req.params;

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.status(404).json({ error: 'Client profile not found' });
      return;
    }

    const existingRequest = await prisma.siteServiceRequest.findFirst({
      where: { id, clientId: clientProfile.id },
    });

    if (!existingRequest) {
      res.status(404).json({ error: 'Service request not found or access denied.' });
      return;
    }

    if (existingRequest.status !== ServiceRequestStatus.PENDING_REVIEW) {
      res.status(400).json({
        error: `Cannot edit request: this request is already ${existingRequest.status.toLowerCase().replace('_', ' ')} and is locked from modification.`,
      });
      return;
    }

    const parsedData = updateSiteServiceRequestSchema.parse(req.body);

    // If siteId provided and changed, verify it belongs to this client
    if (parsedData.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: parsedData.siteId, clientId: clientProfile.id },
      });
      if (!site) {
        res.status(404).json({ error: 'Specified existing site not found or access denied.' });
        return;
      }
    }

    const updated = await prisma.siteServiceRequest.update({
      where: { id },
      data: {
        ...(parsedData.type !== undefined && { type: parsedData.type }),
        ...(parsedData.urgency !== undefined && { urgency: parsedData.urgency }),
        ...(parsedData.propertyName !== undefined && { propertyName: parsedData.propertyName.trim() }),
        ...(parsedData.propertyAddress !== undefined && { propertyAddress: parsedData.propertyAddress.trim() }),
        ...(parsedData.city !== undefined && { city: parsedData.city?.trim() || null }),
        ...(parsedData.postcode !== undefined && { postcode: parsedData.postcode?.trim() || null }),
        ...(parsedData.suggestedLatitude !== undefined && {
          suggestedLatitude: parsedData.suggestedLatitude !== null ? parsedData.suggestedLatitude : null,
        }),
        ...(parsedData.suggestedLongitude !== undefined && {
          suggestedLongitude: parsedData.suggestedLongitude !== null ? parsedData.suggestedLongitude : null,
        }),
        ...(parsedData.requiredGuardsCount !== undefined && { requiredGuardsCount: parsedData.requiredGuardsCount }),
        ...(parsedData.serviceStartDate !== undefined && { serviceStartDate: parsedData.serviceStartDate }),
        ...(parsedData.serviceEndDate !== undefined && { serviceEndDate: parsedData.serviceEndDate }),
        ...(parsedData.shiftScheduleNotes !== undefined && { shiftScheduleNotes: parsedData.shiftScheduleNotes?.trim() || null }),
        ...(parsedData.specialInstructions !== undefined && { specialInstructions: parsedData.specialInstructions?.trim() || null }),
        ...(parsedData.emergencyContactName !== undefined && { emergencyContactName: parsedData.emergencyContactName?.trim() || null }),
        ...(parsedData.emergencyContactPhone !== undefined && { emergencyContactPhone: parsedData.emergencyContactPhone?.trim() || null }),
        ...(parsedData.siteId !== undefined && { siteId: parsedData.siteId || null }),
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    res.json({
      message: 'Site service deployment request updated successfully.',
      request: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error while updating site service request' });
    }
  }
};

/**
 * Cancel a pending site service request
 */
export const cancelSiteServiceRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.status(404).json({ error: 'Client profile not found' });
      return;
    }

    const request = await prisma.siteServiceRequest.findFirst({
      where: { id, clientId: clientProfile.id },
    });

    if (!request) {
      res.status(404).json({ error: 'Service request not found' });
      return;
    }

    if (request.status !== ServiceRequestStatus.PENDING_REVIEW) {
      res.status(400).json({ error: `Cannot cancel a request that is already ${request.status.toLowerCase()}` });
      return;
    }

    const updated = await prisma.siteServiceRequest.update({
      where: { id },
      data: { status: ServiceRequestStatus.CANCELLED },
    });

    res.json({ message: 'Service request cancelled successfully', request: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel service request' });
  }
};

/**
 * Retrieve all approved physical sites belonging to the authenticated client
 */
export const getMySites = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    if (!userAuth || userAuth.role !== 'CLIENT') {
      res.status(403).json({ error: 'Authorisation denied. Access restricted to corporate clients.' });
      return;
    }

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.json({ sites: [] });
      return;
    }

    const sites = await prisma.site.findMany({
      where: { clientId: clientProfile.id },
      include: {
        shifts: {
          where: {
            status: ShiftStatus.CHECKED_IN,
          },
          select: {
            id: true,
            guardId: true,
            status: true,
            checkInTime: true,
            guard: {
              select: {
                firstName: true,
                lastName: true,
                profilePictureUrl: true,
                siaLicenceNumber: true,
              },
            },
          },
        },
        _count: {
          select: {
            patrolRoutes: true,
            incidents: true,
            shifts: true,
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
      activeOfficersCount: site.shifts.length,
      activeShifts: site.shifts.map((s) => ({
        id: s.id,
        checkInTime: s.checkInTime,
        guard: {
          firstName: decryptRandomized(s.guard.firstName),
          lastName: decryptRandomized(s.guard.lastName),
          profilePictureUrl: s.guard.profilePictureUrl,
        },
      })),
      totalPatrolRoutes: site._count.patrolRoutes,
      totalIncidents: site._count.incidents,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    }));

    res.json({ sites: formattedSites });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve monitored client sites' });
  }
};

/**
 * Retrieve single site details for the client
 */
export const getMySiteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!clientProfile) {
      res.status(404).json({ error: 'Client profile not found' });
      return;
    }

    const site = await prisma.site.findFirst({
      where: { id, clientId: clientProfile.id },
      include: {
        patrolRoutes: {
          include: {
            checkpoints: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        shifts: {
          where: {
            status: { in: [ShiftStatus.SCHEDULED, ShiftStatus.CONFIRMED, ShiftStatus.CHECKED_IN] },
          },
          include: {
            guard: {
              select: {
                firstName: true,
                lastName: true,
                profilePictureUrl: true,
              },
            },
          },
          orderBy: { startTime: 'asc' },
          take: 10,
        },
      },
    });

    if (!site) {
      res.status(404).json({ error: 'Site not found or access denied' });
      return;
    }

    res.json({
      site: {
        ...site,
        shifts: site.shifts.map((s) => ({
          ...s,
          guard: {
            ...s.guard,
            firstName: decryptRandomized(s.guard.firstName),
            lastName: decryptRandomized(s.guard.lastName),
          },
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve site details' });
  }
};
