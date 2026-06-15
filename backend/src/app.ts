import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';

import ingestRouter from './routes/ingest';
import campaignsRouter from './routes/campaigns';
import channelStubRouter from './routes/channelStub';
import webhooksRouter from './routes/webhooks';
import aiRouter from './routes/ai';
import { globalErrorHandler } from './lib/middleware';

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// ─── CORS Origin Allowlist ────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5500',    // VS Code Live Server
  'http://127.0.0.1:3000',
  // Add your production frontend URL here, e.g. https://r2005ishi.github.io
  ...(process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : []),
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const v1 = express.Router();

v1.use('/ingest', ingestRouter);
v1.use('/campaigns', campaignsRouter);
v1.use('/channel-stub', channelStubRouter);
v1.use('/webhooks', webhooksRouter);
v1.use('/ai', aiRouter);

app.use('/api/v1', v1);

// ─── 404 Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler (must be last) ─────────────────────────────────────
app.use(globalErrorHandler);

export default app;
