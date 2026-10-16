import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { decryptRandomized, decryptDeterministic } from '../utils/crypto';
import { createShiftSchema, updateShiftSchema, queryShiftsSchema } from '../validators/shift.validator';
import {
  evaluateGuardCompliance,
  checkGuardShiftOverlap,
  evaluateTravelFeasibility,
} from '../utils/shift.utils';
import { recordAuditLog } from '../services/audit.service';
import { ShiftStatus } from '@prisma/client';

function sanitizeShift(shift: any) {
  if (!shift) return shift;
  return {
    ...shift,
    guard: shift.guard
      ? {
          ...shift.guard,
          firstName: shift.guard.firstName ? decryptRandomized(shift.guard.firstName) : '',
          lastName: shift.guard.lastName ? decryptRandomized(shift.guard.lastName) : '',
          phoneNumber: shift.guard.phoneNumber ? decryptRandomized(shift.guard.phoneNumber) : null,
          siaLicenceNumber: shift.guard.siaLicenceNumber ? decryptRandomized(shift.guard.siaLicenceNumber) : null,
          user: shift.guard.user
            ? {
                ...shift.guard.user,
                email: decryptDeterministic(shift.guard.user.email),
                firstName: shift.guard.user.firstName ? decryptRandomized(shift.guard.user.firstName) : '',
                lastName: shift.guard.user.lastName ? decryptRandomized(shift.guard.user.lastName) : '',
              }
            : undefined,
        }
      : undefined,
    site: shift.site
      ? {
          ...shift.site,
          client: shift.site.client
            ? {
                ...shift.site.client,
                companyName: shift.site.client.companyName ? decryptRandomized(shift.site.client.companyName) : '',
              }
            : undefined,
        }
      : undefined,
  };
}

/**
 * Create a new shift on the rota with full automated compliance and overlap checks
 */
export const createShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const data = createShiftSchema.parse(req.body);

    // 1. Fetch site and client to obtain commercial billing rate
    const site = await prisma.site.findUnique({
      where: { id: data.siteId },
      include: { client: true },
    });

    if (!site) {
      res.status(404).json({ error: 'Selected site does not exist.' });
      return;
    }

    // 2. Fetch guard profile to evaluate compliance and hourly pay rate
    const guard = await prisma.guardProfile.findUnique({
      where: { id: data.guardId },
    });

    if (!guard) {
      res.status(404).json({ error: 'Selected guard profile does not exist.' });
      return;
    }

    // 3. Rule 1: Automated Compliance Check (SIA & RTW validity)
    const compliance = evaluateGuardCompliance(guard, data.endTime);
    if (!compliance.compliant) {
      res.status(400).json({
        error: 'Compliance Violation: Guard cannot be scheduled.',
        details: compliance.reason,
      });
      return;
    }

    // 4. Rule 2: Overlap Prevention (Double-booking check)
    const overlap = await checkGuardShiftOverlap(data.guardId, data.startTime, data.endTime);
    if (overlap.hasOverlap && overlap.conflictingShift) {
      const conflictSite = overlap.conflictingShift.site?.name || 'another site';
      const conflictStart = new Date(overlap.conflictingShift.startTime).toLocaleTimeString();
      const conflictEnd = new Date(overlap.conflictingShift.endTime).toLocaleTimeString();
      res.status(409).json({
        error: 'Scheduling Conflict: Guard already has an active shift during this time period.',
        details: `Conflicting shift at ${conflictSite} (${conflictStart} - ${conflictEnd}).`,
      });
      return;
    }

    // 5. Rule 3: Travel Feasibility Warning (Consecutive shifts)
    const travelCheck = await evaluateTravelFeasibility(data.guardId, data.siteId, data.startTime, data.endTime);

    // 6. Rule 4: Snapshot Financial Rates at Shift Creation
    const shift = await prisma.shift.create({
      data: {
        siteId: data.siteId,
        guardId: data.guardId,
        startTime: data.startTime,
        endTime: data.endTime,
        status: ShiftStatus.SCHEDULED,
        guardPayRateHour: guard.payRatePerHour,
        clientBillingRateHour: site.client.billingRateHour,
      },
      include: {
        site: { include: { client: true } },
        guard: { include: { user: true } },
      },
    });

    // 7. Audit log creation
    const guardName = `${decryptRandomized(guard.firstName)} ${decryptRandomized(guard.lastName)}`.trim();
    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'SHIFT_CREATED',
      entityType: 'SHIFT',
      entityId: shift.id,
      entityName: `${site.name} - ${guardName}`,
      summary: `Created shift for ${guardName} at ${site.name} (${shift.startTime.toISOString()} to ${shift.endTime.toISOString()})`,
      newValues: {
        siteId: shift.siteId,
        guardId: shift.guardId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        guardPayRateHour: shift.guardPayRateHour,
        clientBillingRateHour: shift.clientBillingRateHour,
      },
    });

    res.status(201).json({
      message: 'Shift successfully scheduled.',
      shift: sanitizeShift(shift),
      travelWarning: travelCheck.warning || null,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: error.errors[0]?.message || 'Validation error' });
      return;
    }
    console.error('Error creating shift:', error);
    res.status(500).json({ error: 'Failed to create shift. Please try again later.' });
  }
};

/**
 * Query shifts with filtering by site, guard, date range, and status
 */
export const getShifts = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = queryShiftsSchema.parse(req.query);

    const whereClause: any = {};
    if (filters.siteId) whereClause.siteId = filters.siteId;
    if (filters.guardId) whereClause.guardId = filters.guardId;
    if (filters.status) whereClause.status = filters.status;

    if (filters.startDate || filters.endDate) {
      whereClause.AND = [];
      if (filters.startDate) {
        whereClause.AND.push({ endTime: { gte: filters.startDate } });
      }
      if (filters.endDate) {
        whereClause.AND.push({ startTime: { lte: filters.endDate } });
      }
    }

    const shifts = await prisma.shift.findMany({
      where: whereClause,
      include: {
        site: { include: { client: true } },
        guard: { include: { user: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    res.json({
      shifts: shifts.map(sanitizeShift),
    });
  } catch (error: any) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({ error: 'Failed to fetch shifts.' });
  }
};

/**
 * Get a single shift by ID
 */
export const getShiftById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const shift = await prisma.shift.findUnique({
      where: { id },
      include: {
        site: { include: { client: true } },
        guard: { include: { user: true } },
      },
    });

    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    res.json({ shift: sanitizeShift(shift) });
  } catch (error: any) {
    console.error('Error fetching shift by ID:', error);
    res.status(500).json({ error: 'Failed to fetch shift details.' });
  }
};

/**
 * Update an existing shift (times, guard reassignment, or status)
 */
export const updateShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;
    const data = updateShiftSchema.parse(req.body);

    const existingShift = await prisma.shift.findUnique({
      where: { id },
      include: { site: { include: { client: true } }, guard: true },
    });

    if (!existingShift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    const targetSiteId = data.siteId || existingShift.siteId;
    const targetGuardId = data.guardId || existingShift.guardId;
    const targetStartTime = data.startTime || existingShift.startTime;
    const targetEndTime = data.endTime || existingShift.endTime;

    // If timing or guard changed, re-validate compliance and overlaps
    const guardChanged = data.guardId && data.guardId !== existingShift.guardId;
    const timesChanged =
      (data.startTime && data.startTime.getTime() !== existingShift.startTime.getTime()) ||
      (data.endTime && data.endTime.getTime() !== existingShift.endTime.getTime());

    let newGuardPayRate = existingShift.guardPayRateHour;
    let newClientBillingRate = existingShift.clientBillingRateHour;

    if (guardChanged || timesChanged) {
      const guard = guardChanged
        ? await prisma.guardProfile.findUnique({ where: { id: targetGuardId } })
        : existingShift.guard;

      if (!guard) {
        res.status(404).json({ error: 'Target guard does not exist.' });
        return;
      }

      if (guardChanged) {
        newGuardPayRate = guard.payRatePerHour;
      }

      // Check compliance
      const compliance = evaluateGuardCompliance(guard, targetEndTime);
      if (!compliance.compliant) {
        res.status(400).json({
          error: 'Compliance Violation: Guard cannot be scheduled.',
          details: compliance.reason,
        });
        return;
      }

      // Check overlap
      const overlap = await checkGuardShiftOverlap(targetGuardId, targetStartTime, targetEndTime, existingShift.id);
      if (overlap.hasOverlap && overlap.conflictingShift) {
        res.status(409).json({
          error: 'Scheduling Conflict: Guard already has an active shift during this time period.',
          details: `Conflict at ${overlap.conflictingShift.site?.name || 'another site'}.`,
        });
        return;
      }
    }

    if (data.siteId && data.siteId !== existingShift.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: data.siteId },
        include: { client: true },
      });
      if (site) {
        newClientBillingRate = site.client.billingRateHour;
      }
    }

    const updatedShift = await prisma.shift.update({
      where: { id },
      data: {
        siteId: targetSiteId,
        guardId: targetGuardId,
        startTime: targetStartTime,
        endTime: targetEndTime,
        status: data.status || existingShift.status,
        guardPayRateHour: newGuardPayRate,
        clientBillingRateHour: newClientBillingRate,
      },
      include: {
        site: { include: { client: true } },
        guard: { include: { user: true } },
      },
    });

    // Record audit log
    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'SHIFT_UPDATED',
      entityType: 'SHIFT',
      entityId: id,
      summary: `Updated shift ${id}`,
      previousValues: {
        guardId: existingShift.guardId,
        startTime: existingShift.startTime,
        endTime: existingShift.endTime,
        status: existingShift.status,
      },
      newValues: {
        guardId: updatedShift.guardId,
        startTime: updatedShift.startTime,
        endTime: updatedShift.endTime,
        status: updatedShift.status,
      },
    });

    res.json({
      message: 'Shift updated successfully.',
      shift: sanitizeShift(updatedShift),
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: error.errors[0]?.message || 'Validation error' });
      return;
    }
    console.error('Error updating shift:', error);
    res.status(500).json({ error: 'Failed to update shift.' });
  }
};

/**
 * Cancel a shift
 */
export const cancelShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const userAuth = (req as any).user;
    const { id } = req.params;

    const existingShift = await prisma.shift.findUnique({
      where: { id },
      include: { site: true, guard: true },
    });

    if (!existingShift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }

    const cancelledShift = await prisma.shift.update({
      where: { id },
      data: { status: ShiftStatus.CANCELLED },
      include: {
        site: { include: { client: true } },
        guard: { include: { user: true } },
      },
    });

    await recordAuditLog({
      userId: userAuth?.userId || null,
      action: 'SHIFT_CANCELLED',
      entityType: 'SHIFT',
      entityId: id,
      summary: `Cancelled shift at ${existingShift.site.name}`,
      previousValues: { status: existingShift.status },
      newValues: { status: ShiftStatus.CANCELLED },
    });

    res.json({
      message: 'Shift has been cancelled.',
      shift: sanitizeShift(cancelledShift),
    });
  } catch (error: any) {
    console.error('Error cancelling shift:', error);
    res.status(500).json({ error: 'Failed to cancel shift.' });
  }
};

/**
 * Helper endpoint for the Rota Shift Creation form:
 * Evaluates all guards against a target site and time window, returning eligibility status & reasons
 */
export const getEligibleGuards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { siteId, startTime, endTime, excludeShiftId } = req.query;

    if (!siteId || !startTime || !endTime) {
      res.status(400).json({ error: 'siteId, startTime, and endTime are required query parameters.' });
      return;
    }

    const start = new Date(startTime as string);
    const end = new Date(endTime as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      res.status(400).json({ error: 'Invalid start or end time.' });
      return;
    }

    const guards = await prisma.guardProfile.findMany({
      include: { user: true },
    });

    const evaluatedGuards = await Promise.all(
      guards.map(async (guard) => {
        const fullName = `${decryptRandomized(guard.firstName)} ${decryptRandomized(guard.lastName)}`.trim() || 'Unnamed Guard';
        const compliance = evaluateGuardCompliance(guard, end);

        let isEligible = compliance.compliant;
        let ineligibilityReason: string | null = compliance.reason || null;
        let travelWarning: string | null = null;

        if (isEligible) {
          const overlap = await checkGuardShiftOverlap(
            guard.id,
            start,
            end,
            typeof excludeShiftId === 'string' ? excludeShiftId : undefined
          );
          if (overlap.hasOverlap && overlap.conflictingShift) {
            isEligible = false;
            ineligibilityReason = `Conflict: Scheduled at ${overlap.conflictingShift.site?.name || 'site'} (${new Date(overlap.conflictingShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(overlap.conflictingShift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
          } else {
            const travel = await evaluateTravelFeasibility(
              guard.id,
              siteId as string,
              start,
              end,
              typeof excludeShiftId === 'string' ? excludeShiftId : undefined
            );
            if (!travel.feasible && travel.warning) {
              travelWarning = travel.warning;
            }
          }
        }

        return {
          id: guard.id,
          name: fullName,
          siaLicenceNumber: guard.siaLicenceNumber ? decryptRandomized(guard.siaLicenceNumber) : null,
          siaExpiryDate: guard.siaExpiryDate,
          payRatePerHour: guard.payRatePerHour,
          status: guard.status,
          isEligible,
          ineligibilityReason,
          travelWarning,
        };
      })
    );

    // Sort: eligible first, then alphabetical by name
    evaluatedGuards.sort((a, b) => {
      if (a.isEligible && !b.isEligible) return -1;
      if (!a.isEligible && b.isEligible) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ guards: evaluatedGuards });
  } catch (error: any) {
    console.error('Error fetching eligible guards:', error);
    res.status(500).json({ error: 'Failed to evaluate guard eligibility.' });
  }
};

/**
 * Live Operations Attendance Feed (BRD §4, §6)
 * Real-time monitoring of on-site guards, punctuality, geofence compliance, and check-in photos
 */
export const getLiveAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const shifts = await prisma.shift.findMany({
      where: {
        startTime: { lte: todayEnd },
        endTime: { gte: todayStart },
        status: { notIn: [ShiftStatus.CANCELLED] },
      },
      include: {
        site: { include: { client: true } },
        guard: { include: { user: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();
    const sanitizedShifts = shifts.map(sanitizeShift);

    // Compute live operational metrics
    const onSiteNow = sanitizedShifts.filter((s) => s.status === ShiftStatus.CHECKED_IN);
    const completedToday = sanitizedShifts.filter((s) => s.status === ShiftStatus.CHECKED_OUT);

    // Late check-ins: Scheduled or Confirmed, start time was >15 min ago, but not yet checked in
    const lateCheckIns = sanitizedShifts.filter((s) => {
      if (s.status === ShiftStatus.SCHEDULED || s.status === ShiftStatus.CONFIRMED) {
        const start = new Date(s.startTime);
        const minutesOverdue = (now.getTime() - start.getTime()) / (60 * 1000);
        return minutesOverdue > 15;
      }
      return false;
    });

    res.json({
      shifts: sanitizedShifts,
      stats: {
        totalToday: sanitizedShifts.length,
        onSiteNow: onSiteNow.length,
        lateCheckIns: lateCheckIns.length,
        completedToday: completedToday.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching live attendance:', error);
    res.status(500).json({ error: 'Failed to retrieve live attendance roster.' });
  }
};
