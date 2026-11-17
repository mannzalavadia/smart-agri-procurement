import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ENV } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cropRoutes from './routes/cropRoutes.js';
import centerRoutes from './routes/centerRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import slotRoutes from './routes/slotRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import queueRoutes from './routes/queueRoutes.js';
import procurementRoutes from './routes/procurementRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import demoRoutes from './routes/demoRoutes.js';

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS setup supporting Cloudflare Pages and local Vite
const allowedOrigins = [
  ENV.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(cors({
  origin: true, // Dynamically mirror requesting origin (supports localhost, Vercel, Cloudflare Pages, Netlify, Render, etc.)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Idempotency-Key', 'X-Cron-Secret'],
}));

app.use(express.json({ limit: '1mb' }));

// Global Rate Limiter (relaxed for dev and demo)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again after 15 minutes.',
  },
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Smart Agricultural Procurement & Queue Management API',
    timestamp: new Date().toISOString(),
    env: ENV.NODE_ENV,
    version: '1.0.0',
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/centers', centerRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/demo', demoRoutes);

// Centralized error handler
app.use(errorHandler);

export default app;
