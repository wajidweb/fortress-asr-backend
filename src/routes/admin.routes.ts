import { Router } from 'express';
import { getGuards, approveGuard, rejectGuard } from '../controllers/admin.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Retrieve all guard profiles with optional status filtering (?status=PENDING_APPROVAL)
router.get('/guards', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), getGuards);

// Approve (pass) a Guard profile status to ACTIVE
router.put('/guards/:id/approve', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), approveGuard);

// Reject (suspend) a Guard profile status
router.put('/guards/:id/reject', requireAuth, requireRole([Role.SUPER_ADMIN, Role.SUPERVISOR]), rejectGuard);

export default router;
