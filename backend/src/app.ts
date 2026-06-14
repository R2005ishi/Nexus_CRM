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
app.use(cors({ origin: '*' })); // Allow all origins for local development
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
