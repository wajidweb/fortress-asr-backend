import { Router } from 'express';
import { updateClientProfile } from '../controllers/client.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.put('/profile', requireAuth, updateClientProfile);

export default router;
