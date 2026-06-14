import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ChannelSendSchema } from '../lib/schemas';
import { validate, asyncHandler } from '../lib/middleware';

const router = Router();

// Ordered progression that the stub simulates. FAILED branches out separately.
const STATUS_FLOW = ['SENT', 'DELIVERED', 'OPENED', 'READ', 'CLICKED'] as const;

// Simulated delay range (ms) between status events per recipient
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

function jitteredDelay(baseMs: number): number {
  return baseMs + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/channel-stub/send
//
// Simulates an external messaging provider:
// • Returns 202 immediately.
// • For each queued delivery log, schedules async callbacks (via the real
//   webhook endpoint) that advance through STATUS_FLOW with random jitter.
// • A small % of messages are randomly marked FAILED instead.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/send',
  validate(ChannelSendSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { campaignId } = req.body;

    const logs = await prisma.deliveryLog.findMany({
      where: { campaignId, status: 'QUEUED' },
      select: { id: true },
    });

    if (logs.length === 0) {
      res.status(200).json({ message: 'No queued logs found', campaignId });
      return;
    }

    // Acknowledge immediately – all subsequent work is fire-and-forget
    res.status(202).json({ message: 'Delivery simulation started', count: logs.length });

    const baseUrl = process.env.INTERNAL_BASE_URL ?? 'http://localhost:3001';

    for (const log of logs) {
      // ~10% of deliveries fail at the SENT stage
      const willFail = Math.random() < 0.1;

      if (willFail) {
        setTimeout(async () => {
          await postReceipt(baseUrl, log.id, 'FAILED');
        }, jitteredDelay(MIN_DELAY_MS));
        continue;
      }

      // Progress through STATUS_FLOW with cumulative jitter
      let cumulative = 0;
      for (const status of STATUS_FLOW) {
        cumulative += jitteredDelay(MIN_DELAY_MS / STATUS_FLOW.length);
        const delay = cumulative;
        const s = status; // capture loop variable

        // ~30% of users stop engaging after READ (never click)
        if (s === 'CLICKED' && Math.random() < 0.3) break;

        setTimeout(async () => {
          await postReceipt(baseUrl, log.id, s);
        }, delay);
      }
    }
  }),
);

async function postReceipt(
  baseUrl: string,
  deliveryLogId: string,
  status: string,
): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/v1/webhooks/delivery-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryLogId, status }),
    });
  } catch (err) {
    console.error('[channel-stub] receipt callback failed', { deliveryLogId, status, err });
  }
}

export default router;
