import { Router } from 'express';
import { updateClientProfile } from '../controllers/client.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { logoUpload } from '../config/multer';

const router = Router();

router.put('/profile', requireAuth, logoUpload.single('logo'), updateClientProfile);

export default router;
