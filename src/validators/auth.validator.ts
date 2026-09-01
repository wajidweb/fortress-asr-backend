import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const registerGuardSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().min(5, 'Phone number is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  
  // Extended PII & Right to work fields (Sourced from Guards table specs, optional during initial signup)
  siaLicenceNumber: z.string().length(16, 'SIA licence number must be exactly 16 characters').optional(),
  siaExpiryDate: z.string().transform((val) => new Date(val)).optional(),
  rtwDocumentType: z.string().max(50).optional(),
  rtwExpiryDate: z.string().transform((val) => new Date(val)).optional(),
  hasIndefiniteRtw: z.boolean().optional(),
  rtwDocumentUrl: z.string().url().max(512).optional(),
});

export const registerClientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyName: z.string().min(1, 'Company name is required'),
  billingAddress: z.string().min(1, 'Billing address is required'),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().min(5, 'Phone number is required').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  
  // Extended Corporate branding (Sourced from Clients table specs)
  logoUrl: z.string().url().max(512).optional(),
});

export const updateGuardProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  phoneNumber: z.string().min(5, 'Phone number is required'),
  
  // Compliance credentials required on update
  siaLicenceNumber: z.string().length(16, 'SIA licence number must be exactly 16 characters'),
  siaExpiryDate: z.string().transform((val) => (val && val.trim() !== '' ? new Date(val) : new Date())),
  rtwDocumentType: z.string().min(1, 'Right to work document type is required'),
  rtwExpiryDate: z.string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() !== '' ? new Date(val) : null)),
  hasIndefiniteRtw: z.boolean().default(false),
  rtwDocumentUrl: z.string().min(1, 'Right to work document link is required').max(512),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
});
