import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { DeliveryReceiptSchema } from '../lib/schemas';
import { validate, asyncHandler } from '../lib/middleware';
import { LogStatus } from '@prisma/client';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Status rank map – used to enforce forward-only transitions.
// Higher rank = further along the funnel. FAILED/CONVERTED sit outside the
// linear flow and are handled separately.
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_RANK: Partial<Record<LogStatus, number>> = {
  QUEUED:    0,
  SENT:      1,
  DELIVERED: 2,
  OPENED:    3,
  READ:      4,
  CLICKED:   5,
  CONVERTED: 6, // set by /ingest/order, not by webhooks
  FAILED:    -1, // always allowed as a terminal state
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/webhooks/delivery-receipt
//
// Idempotent: ignores out-of-order or duplicate events.
// Rule: only advance status if incoming rank > current rank.
// FAILED is accepted from any non-terminal state.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/delivery-receipt',
  validate(DeliveryReceiptSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { deliveryLogId, status } = req.body as {
      deliveryLogId: string;
      status: LogStatus;
    };

    const log = await prisma.deliveryLog.findUnique({
      where: { id: deliveryLogId },
      select: { id: true, status: true },
    });

    if (!log) {
      // Don't leak internal IDs – respond 200 to prevent provider retries
      res.status(200).json({ skipped: true, reason: 'log not found' });
      return;
    }

    const currentRank = STATUS_RANK[log.status as LogStatus] ?? 0;
    const newRank = STATUS_RANK[status] ?? 0;

    // Terminal states: CONVERTED is only set by /ingest/order, not webhooks
    const isTerminal =
      log.status === 'CONVERTED' || log.status === 'FAILED';

    if (isTerminal) {
      res.status(200).json({ skipped: true, reason: 'already in terminal state' });
      return;
    }

    // Allow FAILED from any non-terminal state; otherwise enforce forward-only
    const shouldAdvance = status === 'FAILED' || newRank > currentRank;

    if (!shouldAdvance) {
      res.status(200).json({ skipped: true, reason: 'out-of-order or duplicate event' });
      return;
    }

    const updated = await prisma.deliveryLog.update({
      where: { id: deliveryLogId },
      data: { status },
    });

    res.status(200).json({ updated: true, status: updated.status });
  }),
);

export default router;
