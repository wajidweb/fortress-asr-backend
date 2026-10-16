import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { 
  getGuards, approveGuard, rejectGuard,
  getClients, approveClient, rejectClient,
  getSiteServiceRequests, getSiteServiceRequestById,
  assessSiteServiceRequest, approveSiteServiceRequest, rejectSiteServiceRequest, revertSiteServiceRequest,
  getVisitAssignees, scheduleSiteVisit, recordSiteSurveyReport,
  getAllSites, updateSite,
  getAuditLogsController, getAuditLogByIdController,
  inviteStaff, getStaffList, updateStaffPermissions, toggleStaffStatus,
  resendStaffInvitation, getAvailablePermissionsController, deleteStaffUser,
} from '../controllers/admin.controller';
import {
  createShift,
  getShifts,
  getShiftById,
  updateShift,
  cancelShift,
  getEligibleGuards,
  getLiveAttendance,
} from '../controllers/admin.shift.controller';
import { changePassword } from '../controllers/security.controller';
import { requireAuth, requireRole, requirePermission } from '../middlewares/auth.middleware';

import { Role } from '@prisma/client';

const router = Router();

// Strict rate limiter for sensitive administrative security operations
const securityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: 'Too many security operations requested from this IP. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});


// Retrieve all guard profiles with optional status filtering (?status=PENDING_APPROVAL)
router.get(
  '/guards',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('guards:read'),
  getGuards
);

// Approve (pass) a Guard profile status to ACTIVE
router.put(
  '/guards/:id/approve',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('guards:approve'),
  approveGuard
);

// Reject (suspend) a Guard profile status
router.put(
  '/guards/:id/reject',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('guards:approve'),
  rejectGuard
);

// Retrieve all client profiles with optional status filtering (?status=PENDING_APPROVAL)
router.get(
  '/clients',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('clients:read'),
  getClients
);

// Approve (pass) a Client profile status to ACTIVE
router.put(
  '/clients/:id/approve',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('clients:approve'),
  approveClient
);

// Reject (suspend) a Client profile status
router.put(
  '/clients/:id/reject',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('clients:approve'),
  rejectClient
);

// Site Service Requests Management
router.get(
  '/requests',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:read'),
  getSiteServiceRequests
);

// Fetch assignable officers for Site Visits
router.get(
  '/requests/assignees',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:assess'),
  getVisitAssignees
);

router.get(
  '/requests/:id',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:read'),
  getSiteServiceRequestById
);

router.put(
  '/requests/:id/assess',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:assess'),
  assessSiteServiceRequest
);

router.put(
  '/requests/:id/schedule-visit',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:assess'),
  scheduleSiteVisit
);

router.put(
  '/requests/:id/survey-notes',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:assess'),
  recordSiteSurveyReport
);

router.post(
  '/requests/:id/approve',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:approve'),
  approveSiteServiceRequest
);

router.put(
  '/requests/:id/reject',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:approve'),
  rejectSiteServiceRequest
);

router.put(
  '/requests/:id/revert',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('requests:assess'),
  revertSiteServiceRequest
);

// Monitored Sites (Properties Geofences)
router.get(
  '/sites',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('sites:read'),
  getAllSites
);

router.put(
  '/sites/:id',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('sites:write'),
  updateSite
);

// Rota & Shift Management
router.get(
  '/attendance/live',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:read'),
  getLiveAttendance
);

router.get(
  '/shifts/eligible-guards',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:read'),
  getEligibleGuards
);

router.get(
  '/shifts',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:read'),
  getShifts
);

router.post(
  '/shifts',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:write'),
  createShift
);

router.get(
  '/shifts/:id',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:read'),
  getShiftById
);

router.put(
  '/shifts/:id',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:write'),
  updateShift
);

router.put(
  '/shifts/:id/cancel',
  requireAuth,
  requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]),
  requirePermission('shifts:dispatch'),
  cancelShift
);

// Encrypted Audit Logs (Append-only & Read-Only for Super Admin accountability)
router.get('/audit-logs', requireAuth, requireRole([Role.SUPER_ADMIN]), getAuditLogsController);
router.get('/audit-logs/:id', requireAuth, requireRole([Role.SUPER_ADMIN]), getAuditLogByIdController);

// Internal Staff & Role Management (Super Admin governance)
router.get('/staff', requireAuth, requireRole([Role.SUPER_ADMIN]), getStaffList);
router.post('/staff/invite', requireAuth, requireRole([Role.SUPER_ADMIN]), inviteStaff);
router.put('/staff/:id/permissions', requireAuth, requireRole([Role.SUPER_ADMIN]), updateStaffPermissions);
router.put('/staff/:id/status', requireAuth, requireRole([Role.SUPER_ADMIN]), toggleStaffStatus);
router.post('/staff/:id/resend-invite', requireAuth, requireRole([Role.SUPER_ADMIN]), resendStaffInvitation);
router.get('/staff/permissions-schema', requireAuth, requireRole([Role.SUPER_ADMIN]), getAvailablePermissionsController);
router.delete('/staff/:id', requireAuth, requireRole([Role.SUPER_ADMIN]), deleteStaffUser);

// Dedicated Super Admin Password Change (Settings)
router.put(
  '/security/change-password',
  requireAuth,
  requireRole([Role.SUPER_ADMIN]),
  securityLimiter,
  changePassword
);

export default router;


