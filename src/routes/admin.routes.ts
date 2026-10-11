import { Router } from 'express';
import { 
  getGuards, approveGuard, rejectGuard,
  getClients, approveClient, rejectClient,
  getSiteServiceRequests, getSiteServiceRequestById,
  assessSiteServiceRequest, approveSiteServiceRequest, rejectSiteServiceRequest,
  getAllSites, updateSite,
  getAuditLogsController, getAuditLogByIdController
} from '../controllers/admin.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Retrieve all guard profiles with optional status filtering (?status=PENDING_APPROVAL)
router.get('/guards', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), getGuards);

// Approve (pass) a Guard profile status to ACTIVE
router.put('/guards/:id/approve', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), approveGuard);

// Reject (suspend) a Guard profile status
router.put('/guards/:id/reject', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), rejectGuard);

// Retrieve all client profiles with optional status filtering (?status=PENDING_APPROVAL)
router.get('/clients', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), getClients);

// Approve (pass) a Client profile status to ACTIVE
router.put('/clients/:id/approve', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), approveClient);

// Reject (suspend) a Client profile status
router.put('/clients/:id/reject', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), rejectClient);

// Site Service Requests Management
router.get('/requests', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), getSiteServiceRequests);
router.get('/requests/:id', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), getSiteServiceRequestById);
router.put('/requests/:id/assess', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), assessSiteServiceRequest);
router.post('/requests/:id/approve', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), approveSiteServiceRequest);
router.put('/requests/:id/reject', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), rejectSiteServiceRequest);

// Monitored Sites (Properties Geofences)
router.get('/sites', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), getAllSites);
router.put('/sites/:id', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), updateSite);

// Encrypted Audit Logs (Append-only & Read-Only for Super Admin accountability)
router.get('/audit-logs', requireAuth, requireRole([Role.SUPER_ADMIN]), getAuditLogsController);
router.get('/audit-logs/:id', requireAuth, requireRole([Role.SUPER_ADMIN]), getAuditLogByIdController);

export default router;
