import { z } from 'zod';
import { ServiceRequestType, ServiceRequestUrgency } from '@prisma/client';

export const createSiteServiceRequestSchema = z.object({
  type: z.nativeEnum(ServiceRequestType).default(ServiceRequestType.NEW_SITE_DEPLOYMENT),
  urgency: z.nativeEnum(ServiceRequestUrgency).default(ServiceRequestUrgency.STANDARD),
  
  propertyName: z.string().min(1, 'Property name is required').max(150, 'Property name cannot exceed 150 characters'),
  propertyAddress: z.string().min(1, 'Physical property address is required'),
  city: z.string().min(1, 'City / town is required').max(100),
  postcode: z.string().min(1, 'Postcode is required').max(20),
  suggestedLatitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  suggestedLongitude: z.coerce.number().min(-180).max(180).optional().nullable(),

  requiredGuardsCount: z.coerce.number().int().min(1, 'At least 1 officer is required').default(1),
  serviceStartDate: z.string().min(1, 'Service start date is required').transform((val) => new Date(val)),
  serviceEndDate: z.string().min(1, 'Contract end date is required').transform((val) => new Date(val)),
  shiftScheduleNotes: z.string().min(1, 'Shift schedule details are required').max(1000),
  specialInstructions: z.string().min(1, 'Site instructions or hazard details are required').max(2000),
  emergencyContactName: z.string().min(1, 'Emergency contact name is required').max(100),
  emergencyContactPhone: z.string().min(1, 'Emergency contact phone is required').max(50),
  siteId: z.string().optional().nullable(), // If referencing existing site for extra coverage
});

export const updateSiteServiceRequestSchema = z.object({
  type: z.nativeEnum(ServiceRequestType).optional(),
  urgency: z.nativeEnum(ServiceRequestUrgency).optional(),

  propertyName: z.string().min(1, 'Property name is required').max(150, 'Property name cannot exceed 150 characters').optional(),
  propertyAddress: z.string().min(1, 'Physical property address is required').optional(),
  city: z.string().min(1, 'City / town is required').max(100).optional().nullable(),
  postcode: z.string().min(1, 'Postcode is required').max(20).optional().nullable(),
  suggestedLatitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  suggestedLongitude: z.coerce.number().min(-180).max(180).optional().nullable(),

  requiredGuardsCount: z.coerce.number().int().min(1, 'At least 1 officer is required').optional(),
  serviceStartDate: z.string().min(1, 'Service start date is required').transform((val) => new Date(val)).optional(),
  serviceEndDate: z.string().optional().nullable().transform((val) => (val ? new Date(val) : null)),
  shiftScheduleNotes: z.string().min(1, 'Shift schedule details are required').max(1000).optional(),
  specialInstructions: z.string().min(1, 'Site instructions or hazard details are required').max(2000).optional(),
  emergencyContactName: z.string().min(1, 'Emergency contact name is required').max(100).optional(),
  emergencyContactPhone: z.string().min(1, 'Emergency contact phone is required').max(50).optional(),
  siteId: z.string().optional().nullable(),
});

export const approveSiteServiceRequestSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90').optional().default(51.5074),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180').optional().default(-0.1278),
  geofenceRadiusMeters: z.coerce.number().int().min(10, 'Geofence radius must be at least 10 meters').max(5000, 'Geofence radius cannot exceed 5000 meters').optional().default(100),
  siteInstructions: z.string().max(3000).optional().nullable(),
  emergencyContact: z.string().max(200).optional().nullable(),
  adminFeedbackNotes: z.string().max(1000).optional().nullable(),
});

export const assessSiteServiceRequestSchema = z.object({
  adminFeedbackNotes: z.string().max(1000).optional().nullable(),
});

export const rejectSiteServiceRequestSchema = z.object({
  adminFeedbackNotes: z.string().min(1, 'A rejection reason is required to notify the client').max(1000),
});

export const updateSiteSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  address: z.string().min(1).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(10).max(5000).optional(),
  siteInstructions: z.string().max(3000).optional().nullable(),
  emergencyContact: z.string().max(200).optional().nullable(),
});
