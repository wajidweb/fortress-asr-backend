import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const registerGuardSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const registerClientSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
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
  profilePictureUrl: z.string().max(512).optional().nullable().or(z.literal('')),
  emergencyContactName: z.string().max(100).optional().nullable().or(z.literal('')),
  emergencyContactPhone: z.string().max(50).optional().nullable().or(z.literal('')),
});

export const updateClientProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  companyName: z.string().min(1, 'Company name is required').max(150, 'Company name must not exceed 150 characters'),
  billingAddress: z.string().min(1, 'Billing address is required'),
  urlSlug: z
    .string()
    .max(100, 'URL slug must not exceed 100 characters')
    .regex(/^[a-z0-9-]+$/, 'URL slug must contain only lowercase letters, numbers, and hyphens')
    .optional()
    .or(z.literal('')),
  phoneNumber: z.string().min(5, 'Phone number is required').optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  logoUrl: z.string().max(512, 'Logo URL must not exceed 512 characters').optional().nullable().or(z.literal('')),
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

export const inviteStaffSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().optional().nullable(),
  jobTitle: z.string().min(1, 'Job title is required'),
  department: z.string().optional().nullable(),
  template: z.enum(['FULL_OPERATIONS', 'DISPATCHER', 'READ_ONLY', 'CUSTOM']).default('FULL_OPERATIONS'),
  permissions: z.array(z.string()).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

// Strong password policy regex: At least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character
export const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

export const verifyCurrentPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters')
      .regex(
        passwordStrengthRegex,
        'Password must contain at least 8 characters, including at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
    verificationToken: z.string().optional(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password cannot be identical to your current password',
    path: ['newPassword'],
  });


