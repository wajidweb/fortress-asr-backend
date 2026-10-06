import { Router } from 'express';
import { 
  getGuards, approveGuard, rejectGuard,
  getClients, approveClient, rejectClient 
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

export default router;
