import { Router } from 'express';
import { 
  updateClientProfile,
  createSiteServiceRequest,
  getMySiteServiceRequests,
  getMySiteServiceRequestById,
  updateSiteServiceRequest,
  cancelSiteServiceRequest,
  getMySites,
  getMySiteById,
} from '../controllers/client.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { logoUpload } from '../config/multer';
import { Role } from '@prisma/client';

const router = Router();

// Profile management
router.put('/profile', requireAuth, requireRole([Role.CLIENT]), logoUpload.single('logo'), updateClientProfile);

// Site Service Requests
router.post('/requests', requireAuth, requireRole([Role.CLIENT]), createSiteServiceRequest);
router.get('/requests', requireAuth, requireRole([Role.CLIENT]), getMySiteServiceRequests);
router.get('/requests/:id', requireAuth, requireRole([Role.CLIENT]), getMySiteServiceRequestById);
router.put('/requests/:id', requireAuth, requireRole([Role.CLIENT]), updateSiteServiceRequest);
router.delete('/requests/:id', requireAuth, requireRole([Role.CLIENT]), cancelSiteServiceRequest);

// Monitored Sites (Secure Properties)
router.get('/sites', requireAuth, requireRole([Role.CLIENT]), getMySites);
router.get('/sites/:id', requireAuth, requireRole([Role.CLIENT]), getMySiteById);

export default router;
