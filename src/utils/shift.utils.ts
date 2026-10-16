import { prisma } from '../config/db';
import { GuardProfile, Site, Shift, GuardStatus, ShiftStatus } from '@prisma/client';

/**
 * Calculates the great-circle distance between two GPS points using the Haversine formula (in km)
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates travel time in minutes assuming an average transit speed (default 40 km/h) + 15 min buffer
 */
export function estimateTravelTimeMinutes(distanceKm: number, speedKmH = 40): number {
  if (distanceKm <= 0.1) return 0; // Effectively same location
  const travelMinutes = (distanceKm / speedKmH) * 60;
  return Math.ceil(travelMinutes + 15); // Add a 15-minute buffer for parking/traffic
}

export interface ComplianceCheckResult {
  compliant: boolean;
  reason?: string;
}

/**
 * Evaluates whether a guard meets all compliance requirements for a shift's time window.
 * Mandated by BRD §4.1 and §8.1:
 * - Guard status must be ACTIVE
 * - SIA Licence must not be expired before shift endTime
 * - Right to Work must not be expired before shift endTime (unless indefinite)
 */
export function evaluateGuardCompliance(
  guard: GuardProfile,
  shiftEndTime: Date
): ComplianceCheckResult {
  if (guard.status !== GuardStatus.ACTIVE) {
    return {
      compliant: false,
      reason: `Guard status is ${guard.status}. Only ACTIVE officers may be scheduled.`,
    };
  }

  if (!guard.siaExpiryDate) {
    return {
      compliant: false,
      reason: 'Guard does not have a recorded SIA Licence expiry date.',
    };
  }

  if (new Date(guard.siaExpiryDate) <= shiftEndTime) {
    return {
      compliant: false,
      reason: `SIA Licence expires on ${new Date(guard.siaExpiryDate).toISOString().split('T')[0]}, which is before or during shift completion.`,
    };
  }

  if (!guard.hasIndefiniteRTW) {
    if (!guard.rightToWorkExpiryDate) {
      return {
        compliant: false,
        reason: 'Guard does not have indefinite Right to Work and no RTW expiry date is on record.',
      };
    }
    if (new Date(guard.rightToWorkExpiryDate) <= shiftEndTime) {
      return {
        compliant: false,
        reason: `Right to Work expires on ${new Date(guard.rightToWorkExpiryDate).toISOString().split('T')[0]}, which is before or during shift completion.`,
      };
    }
  }

  return { compliant: true };
}

export interface OverlapCheckResult {
  hasOverlap: boolean;
  conflictingShift?: Shift & { site: Site };
}

/**
 * Checks if the guard has an overlapping shift (excluding cancelled or missed shifts).
 * Overlap condition: existing.startTime < newEndTime AND existing.endTime > newStartTime
 */
export async function checkGuardShiftOverlap(
  guardId: string,
  startTime: Date,
  endTime: Date,
  excludeShiftId?: string
): Promise<OverlapCheckResult> {
  const conflictingShift = await prisma.shift.findFirst({
    where: {
      guardId,
      id: excludeShiftId ? { not: excludeShiftId } : undefined,
      status: {
        notIn: [ShiftStatus.CANCELLED, ShiftStatus.MISSED],
      },
      startTime: {
        lt: endTime,
      },
      endTime: {
        gt: startTime,
      },
    },
    include: {
      site: true,
    },
  });

  if (conflictingShift) {
    return {
      hasOverlap: true,
      conflictingShift,
    };
  }

  return { hasOverlap: false };
}

export interface TravelFeasibilityResult {
  feasible: boolean;
  warning?: string;
}

/**
 * Evaluates whether back-to-back shifts allow realistic travel time between different sites.
 */
export async function evaluateTravelFeasibility(
  guardId: string,
  targetSiteId: string,
  startTime: Date,
  endTime: Date,
  excludeShiftId?: string
): Promise<TravelFeasibilityResult> {
  const targetSite = await prisma.site.findUnique({
    where: { id: targetSiteId },
  });

  if (!targetSite) {
    return { feasible: true };
  }

  const targetLat = Number(targetSite.latitude);
  const targetLon = Number(targetSite.longitude);

  // 1. Look for immediately preceding shift (ends up to 6 hours before this shift starts)
  const sixHoursBefore = new Date(startTime.getTime() - 6 * 60 * 60 * 1000);
  const precedingShift = await prisma.shift.findFirst({
    where: {
      guardId,
      id: excludeShiftId ? { not: excludeShiftId } : undefined,
      status: { notIn: [ShiftStatus.CANCELLED, ShiftStatus.MISSED] },
      endTime: {
        gte: sixHoursBefore,
        lte: startTime,
      },
    },
    orderBy: { endTime: 'desc' },
    include: { site: true },
  });

  if (precedingShift && precedingShift.siteId !== targetSiteId) {
    const prevLat = Number(precedingShift.site.latitude);
    const prevLon = Number(precedingShift.site.longitude);
    const distanceKm = calculateHaversineDistanceKm(prevLat, prevLon, targetLat, targetLon);
    const requiredTravelMinutes = estimateTravelTimeMinutes(distanceKm);
    const availableMinutes = (startTime.getTime() - precedingShift.endTime.getTime()) / (60 * 1000);

    if (availableMinutes < requiredTravelMinutes) {
      return {
        feasible: false,
        warning: `Insufficient travel time from prior shift at "${precedingShift.site.name}". Distance: ${distanceKm.toFixed(1)} km (~${requiredTravelMinutes} min required, but only ${Math.round(availableMinutes)} min available).`,
      };
    }
  }

  // 2. Look for immediately following shift (starts up to 6 hours after this shift ends)
  const sixHoursAfter = new Date(endTime.getTime() + 6 * 60 * 60 * 1000);
  const followingShift = await prisma.shift.findFirst({
    where: {
      guardId,
      id: excludeShiftId ? { not: excludeShiftId } : undefined,
      status: { notIn: [ShiftStatus.CANCELLED, ShiftStatus.MISSED] },
      startTime: {
        gte: endTime,
        lte: sixHoursAfter,
      },
    },
    orderBy: { startTime: 'asc' },
    include: { site: true },
  });

  if (followingShift && followingShift.siteId !== targetSiteId) {
    const nextLat = Number(followingShift.site.latitude);
    const nextLon = Number(followingShift.site.longitude);
    const distanceKm = calculateHaversineDistanceKm(targetLat, targetLon, nextLat, nextLon);
    const requiredTravelMinutes = estimateTravelTimeMinutes(distanceKm);
    const availableMinutes = (followingShift.startTime.getTime() - endTime.getTime()) / (60 * 1000);

    if (availableMinutes < requiredTravelMinutes) {
      return {
        feasible: false,
        warning: `Insufficient travel time to consecutive shift at "${followingShift.site.name}". Distance: ${distanceKm.toFixed(1)} km (~${requiredTravelMinutes} min required, but only ${Math.round(availableMinutes)} min available).`,
      };
    }
  }

  return { feasible: true };
}
