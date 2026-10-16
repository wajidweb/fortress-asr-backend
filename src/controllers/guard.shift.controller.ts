import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { decryptRandomized } from '../utils/crypto';
import { recordAuditLog } from '../services/audit.service';
import { calculateHaversineDistanceKm } from '../utils/shift.utils';
import { ShiftStatus } from '@prisma/client';
import fs from 'fs';

/**
 * Get current authenticated guard's shifts
 */
export const getMyShifts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    if (!userAuth || userAuth.role !== 'GUARD') {
      res.status(403).json({ error: 'Access restricted to security officers.' });
      return;
    }

    const guardProfile = await prisma.guardProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!guardProfile) {
      res.status(404).json({ error: 'Guard profile not found.' });
      return;
    }

    const { upcoming, startDate, endDate } = req.query;

    const whereClause: any = {
      guardId: guardProfile.id,
      status: { notIn: [ShiftStatus.CANCELLED] },
    };

    if (upcoming === 'true') {
      whereClause.endTime = { gte: new Date() };
    }

    if (startDate || endDate) {
      whereClause.AND = [];
      if (startDate) {
        whereClause.AND.push({ endTime: { gte: new Date(startDate as string) } });
      }
      if (endDate) {
        whereClause.AND.push({ startTime: { lte: new Date(endDate as string) } });
      }
    }

    const shifts = await prisma.shift.findMany({
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
            siteInstructions: true,
            emergencyContact: true,
            client: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    const sanitizedShifts = shifts.map((shift) => ({
      ...shift,
      site: shift.site
        ? {
            ...shift.site,
            client: shift.site.client
              ? {
                  companyName: decryptRandomized(shift.site.client.companyName),
                }
              : undefined,
          }
        : undefined,
    }));

    res.json({ shifts: sanitizedShifts });
  } catch (error: any) {
    console.error('Error fetching guard shifts:', error);
    res.status(500).json({ error: 'Failed to retrieve your shifts.' });
  }
};

/**
 * Pre-shift attendance confirmation (Guards confirm attendance ahead of scheduled shift)
 */
export const confirmShiftAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    if (!userAuth || userAuth.role !== 'GUARD') {
      res.status(403).json({ error: 'Access restricted to security officers.' });
      return;
    }

    const guardProfile = await prisma.guardProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!guardProfile) {
      res.status(404).json({ error: 'Guard profile not found.' });
      return;
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { site: true },
    });

    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    if (shift.guardId !== guardProfile.id) {
      res.status(403).json({ error: 'You are not assigned to this shift.' });
      return;
    }

    if (shift.status !== ShiftStatus.SCHEDULED) {
      res.status(400).json({
        error: `Cannot confirm shift attendance. Current shift status is ${shift.status}.`,
      });
      return;
    }

    const updatedShift = await prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CONFIRMED,
        preShiftConfirmedAt: new Date(),
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true,
            siteInstructions: true,
            emergencyContact: true,
          },
        },
      },
    });

    const guardName = `${decryptRandomized(guardProfile.firstName)} ${decryptRandomized(guardProfile.lastName)}`.trim();
    await recordAuditLog({
      userId: userAuth.userId,
      action: 'SHIFT_CONFIRMED',
      entityType: 'SHIFT',
      entityId: shift.id,
      entityName: `${shift.site.name} - ${guardName}`,
      summary: `Guard ${guardName} confirmed attendance for shift at ${shift.site.name}`,
      previousValues: { status: shift.status },
      newValues: { status: ShiftStatus.CONFIRMED, preShiftConfirmedAt: updatedShift.preShiftConfirmedAt },
    });

    res.json({
      message: 'Attendance successfully confirmed for your shift.',
      shift: updatedShift,
    });
  } catch (error: any) {
    console.error('Error confirming shift attendance:', error);
    res.status(500).json({ error: 'Failed to confirm attendance.' });
  }
};

/**
 * Visual Check-In with Geofence Verification (BRD §2, §5.1)
 */
export const checkInShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;
    const { latitude, longitude, ppeAcknowledged } = req.body;

    if (!userAuth || userAuth.role !== 'GUARD') {
      res.status(403).json({ error: 'Access restricted to security officers.' });
      return;
    }

    const guardProfile = await prisma.guardProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!guardProfile) {
      res.status(404).json({ error: 'Guard profile not found.' });
      return;
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { site: true },
    });

    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    if (shift.guardId !== guardProfile.id) {
      res.status(403).json({ error: 'You are not assigned to this shift.' });
      return;
    }

    if (shift.status !== ShiftStatus.SCHEDULED && shift.status !== ShiftStatus.CONFIRMED) {
      res.status(400).json({
        error: `Cannot check in. Shift status is already ${shift.status}.`,
      });
      return;
    }

    // Mandatory visual capture
    if (!req.file) {
      res.status(400).json({
        error: 'Mandatory live visual capture missing. Please submit a live selfie to prove identity on site.',
      });
      return;
    }

    const guardLat = parseFloat(latitude);
    const guardLng = parseFloat(longitude);

    if (isNaN(guardLat) || isNaN(guardLng)) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({
        error: 'Invalid GPS coordinates provided. Geolocation permissions must be enabled on your device.',
      });
      return;
    }

    const siteLat = Number(shift.site.latitude);
    const siteLng = Number(shift.site.longitude);
    const geofenceRadius = shift.site.geofenceRadiusMeters || 100;

    // Haversine distance in meters
    const distanceKm = calculateHaversineDistanceKm(guardLat, guardLng, siteLat, siteLng);
    const distanceMeters = Math.round(distanceKm * 1000);

    // Incorporate client GPS accuracy buffer (up to 150m) or 50m baseline buffer for indoor / WiFi drift
    const clientAccuracy = req.body.accuracy ? parseFloat(req.body.accuracy) : null;
    const accuracyBuffer = clientAccuracy && !isNaN(clientAccuracy) ? Math.min(Math.round(clientAccuracy), 150) : 50;
    const allowedPerimeter = geofenceRadius + accuracyBuffer;

    // Strict Block if outside geofence boundary + accuracy tolerance
    if (distanceMeters > allowedPerimeter) {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({
        error: 'Geofence Breach: Check-in rejected.',
        details: `You are approximately ${distanceMeters}m away from ${shift.site.name}. Allowed perimeter is ${geofenceRadius}m (±${accuracyBuffer}m GPS tolerance). Please move onto property grounds.`,
      });
      return;
    }

    const photoUrl = `/uploads/check-in-photos/${req.file.filename}`;

    const updatedShift = await prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CHECKED_IN,
        checkInTime: new Date(),
        checkInLatitude: guardLat,
        checkInLongitude: guardLng,
        checkInPhotoUrl: photoUrl,
        checkInPpeVerified: ppeAcknowledged === 'true' || ppeAcknowledged === true,
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true,
            siteInstructions: true,
            emergencyContact: true,
            client: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
    });

    const sanitizedShift = {
      ...updatedShift,
      site: updatedShift.site
        ? {
            ...updatedShift.site,
            client: updatedShift.site.client
              ? {
                  companyName: decryptRandomized(updatedShift.site.client.companyName),
                }
              : undefined,
          }
        : undefined,
    };

    const guardName = `${decryptRandomized(guardProfile.firstName)} ${decryptRandomized(guardProfile.lastName)}`.trim();
    await recordAuditLog({
      userId: userAuth.userId,
      action: 'SHIFT_CHECK_IN',
      entityType: 'SHIFT',
      entityId: shift.id,
      entityName: `${shift.site.name} - ${guardName}`,
      summary: `Guard ${guardName} checked in at ${shift.site.name} (${distanceMeters}m from center, verified in geofence)`,
      previousValues: { status: shift.status },
      newValues: {
        status: ShiftStatus.CHECKED_IN,
        checkInTime: updatedShift.checkInTime,
        checkInLatitude: guardLat,
        checkInLongitude: guardLng,
        checkInPhotoUrl: photoUrl,
      },
    });

    res.json({
      message: 'Visual check-in verified. You are now logged on active duty!',
      shift: sanitizedShift,
      distanceMeters,
    });
  } catch (error: any) {
    console.error('Error during shift check-in:', error);
    res.status(500).json({ error: 'Failed to complete check-in. Please try again.' });
  }
};

/**
 * Visual Check-Out (Shift Completion & Timesheet Generation)
 */
export const checkOutShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!userAuth || userAuth.role !== 'GUARD') {
      res.status(403).json({ error: 'Access restricted to security officers.' });
      return;
    }

    const guardProfile = await prisma.guardProfile.findUnique({
      where: { userId: userAuth.userId },
    });

    if (!guardProfile) {
      res.status(404).json({ error: 'Guard profile not found.' });
      return;
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { site: true },
    });

    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    if (shift.guardId !== guardProfile.id) {
      res.status(403).json({ error: 'You are not assigned to this shift.' });
      return;
    }

    if (shift.status !== ShiftStatus.CHECKED_IN) {
      res.status(400).json({
        error: `Cannot check out. Shift status is ${shift.status}. Only CHECKED_IN shifts can be completed.`,
      });
      return;
    }

    const guardLat = latitude ? parseFloat(latitude) : null;
    const guardLng = longitude ? parseFloat(longitude) : null;
    const photoUrl = req.file ? `/uploads/check-in-photos/${req.file.filename}` : null;

    const updatedShift = await prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CHECKED_OUT,
        checkOutTime: new Date(),
        checkOutLatitude: guardLat,
        checkOutLongitude: guardLng,
        checkOutPhotoUrl: photoUrl,
      },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true,
            siteInstructions: true,
            emergencyContact: true,
            client: {
              select: {
                companyName: true,
              },
            },
          },
        },
      },
    });

    const sanitizedShift = {
      ...updatedShift,
      site: updatedShift.site
        ? {
            ...updatedShift.site,
            client: updatedShift.site.client
              ? {
                  companyName: decryptRandomized(updatedShift.site.client.companyName),
                }
              : undefined,
          }
        : undefined,
    };

    const guardName = `${decryptRandomized(guardProfile.firstName)} ${decryptRandomized(guardProfile.lastName)}`.trim();
    await recordAuditLog({
      userId: userAuth.userId,
      action: 'SHIFT_CHECK_OUT',
      entityType: 'SHIFT',
      entityId: shift.id,
      entityName: `${shift.site.name} - ${guardName}`,
      summary: `Guard ${guardName} checked out of ${shift.site.name}`,
      previousValues: { status: shift.status },
      newValues: {
        status: ShiftStatus.CHECKED_OUT,
        checkOutTime: updatedShift.checkOutTime,
      },
    });

    res.json({
      message: 'Duty completed. Visual check-out confirmed and recorded.',
      shift: sanitizedShift,
    });
  } catch (error: any) {
    console.error('Error during shift check-out:', error);
    res.status(500).json({ error: 'Failed to complete check-out.' });
  }
};
