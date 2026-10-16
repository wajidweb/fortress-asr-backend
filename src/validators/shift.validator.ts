import { z } from 'zod';
import { ShiftStatus } from '@prisma/client';

export const createShiftSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format'),
  guardId: z.string().uuid('Invalid guard ID format'),
  startTime: z.string().min(1, 'Start time is required').transform((val) => new Date(val)),
  endTime: z.string().min(1, 'End time is required').transform((val) => new Date(val)),
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const updateShiftSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format').optional(),
  guardId: z.string().uuid('Invalid guard ID format').optional(),
  startTime: z.string().transform((val) => new Date(val)).optional(),
  endTime: z.string().transform((val) => new Date(val)).optional(),
  status: z.nativeEnum(ShiftStatus).optional(),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    return data.endTime > data.startTime;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const queryShiftsSchema = z.object({
  siteId: z.string().uuid().optional(),
  guardId: z.string().uuid().optional(),
  startDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  status: z.nativeEnum(ShiftStatus).optional(),
});
