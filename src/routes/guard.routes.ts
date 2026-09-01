import { Router } from 'express';
import { updateGuardProfile } from '../controllers/guard.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { upload } from '../config/multer';

const router = Router();

// Guard Profile Update Route (Strictly require authorization and handle rtwDocument file upload via central multer config)
router.put('/profile', requireAuth, upload.single('rtwDocument'), updateGuardProfile);

export default router;
