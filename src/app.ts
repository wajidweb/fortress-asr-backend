import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { errorHandler } from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import guardRoutes from './routes/guard.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

// Security and HTTP Request middlewares
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/guard', guardRoutes);
app.use('/api/admin', adminRoutes);

// Expose secure local file upload scans as static resources
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', message: 'Fortress ASR Backend is active.', timestamp: new Date() });
});

// Global Error Handler
app.use(errorHandler);

export { app };
