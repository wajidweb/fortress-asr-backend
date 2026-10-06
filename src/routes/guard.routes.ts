import { Router } from 'express';
import { updateGuardProfile } from '../controllers/guard.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { guardUpload } from '../config/multer';

const router = Router();

// Guard Profile Update Route (Strictly require authorization and handle rtwDocument file and photo uploads)
router.put(
  '/profile',
  requireAuth,
  guardUpload.fields([
    { name: 'rtwDocument', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ]),
  updateGuardProfile
);

export default router;
