import { prisma } from './lib/prisma';
import app from './app';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main(): Promise<void> {
  // Verify DB connectivity before accepting traffic
  await prisma.$connect();
  console.log('[DB] Connected to PostgreSQL via Prisma');

  const server = app.listen(PORT, () => {
    console.log(`[SERVER] Xeno CRM backend running on http://localhost:${PORT}`);
    console.log(`[SERVER] Health: http://localhost:${PORT}/health`);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[SIGNAL] ${signal} received – shutting down gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[DB] Prisma disconnected. Bye!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[FATAL] Server failed to start', err);
  process.exit(1);
});
