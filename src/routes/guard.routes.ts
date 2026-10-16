import { Router } from 'express';
import { updateGuardProfile } from '../controllers/guard.controller';
import {
  getMyShifts,
  confirmShiftAttendance,
  checkInShift,
  checkOutShift,
} from '../controllers/guard.shift.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { guardUpload, attendanceUpload } from '../config/multer';

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

// Guard Shift & Rota Routes
router.get('/shifts/my-shifts', requireAuth, getMyShifts);
router.put('/shifts/:id/confirm', requireAuth, confirmShiftAttendance);

// Shift Attendance & Geofenced Visual Check-In / Check-Out
router.post('/shifts/:id/check-in', requireAuth, attendanceUpload.single('photo'), checkInShift);
router.post('/shifts/:id/check-out', requireAuth, attendanceUpload.single('photo'), checkOutShift);

export default router;
