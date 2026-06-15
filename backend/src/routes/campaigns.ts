import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { LaunchCampaignSchema } from '../lib/schemas';
import { validate, asyncHandler } from '../lib/middleware';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/campaigns/launch
//
// 1. Creates the Campaign record (status = SENDING).
// 2. Bulk-inserts one DeliveryLog (QUEUED) per recipient.
// 3. Fires-and-forgets to the channel stub so this endpoint returns 202
//    immediately and does not block on delivery simulation.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/launch',
  validate(LaunchCampaignSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { recipientIds, goal, channel, copy } = req.body;

    // Validate that all recipient IDs actually exist
    const customers = await prisma.customer.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true },
    });
    const foundIds = new Set(customers.map((c) => c.id));
    const missing = (recipientIds as string[]).filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      res.status(422).json({ error: 'Unknown recipient IDs', missing });
      return;
    }

    // Create campaign + delivery logs atomically
    const campaign = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          goalDescription: goal,
          targetChannel:   channel,
          status:          'SENDING',
        },
      });

      await tx.deliveryLog.createMany({
        data: (recipientIds as string[]).map((customerId: string) => ({
          campaignId: campaign.id,
          customerId,
          channel,
          status: 'QUEUED',
        })),
        skipDuplicates: true,
      });

      return campaign;
    });

    // Fire-and-forget: don't await so the caller gets 202 right away
    const baseUrl = process.env.INTERNAL_BASE_URL ?? 'http://localhost:3001';
    fetch(`${baseUrl}/api/v1/channel-stub/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: campaign.id }),
    }).catch((err) =>
      console.error('[campaigns/launch] channel-stub fire failed', err),
    );

    res.status(202).json({
      message: 'Campaign launched',
      campaignId: campaign.id,
      recipientCount: recipientIds.length,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/campaigns/:id
// Returns campaign details and aggregate delivery stats.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        deliveryLogs: {
          select: { status: true },
        },
      },
    });

    if (!campaign) {
      res.status(404).json({ error: `Campaign ${id} not found` });
      return;
    }

    // Compute status breakdown
    const stats = campaign.deliveryLogs.reduce<Record<string, number>>(
      (acc, log) => {
        acc[log.status] = (acc[log.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    const { deliveryLogs: _, ...campaignData } = campaign;
    res.json({ campaign: campaignData, stats });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/campaigns
// Returns all campaigns with their aggregate stats.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        deliveryLogs: {
          select: { status: true }
        }
      }
    });

    const campaignsWithStats = campaigns.map((campaign) => {
      const stats = campaign.deliveryLogs.reduce<Record<string, number>>(
        (acc, log) => {
          acc[log.status] = (acc[log.status] ?? 0) + 1;
          return acc;
        },
        {},
      );

      const { deliveryLogs: _, ...campaignData } = campaign;
      return {
        ...campaignData,
        stats,
        totalRecipients: campaign.deliveryLogs.length
      };
    });

    res.json({ campaigns: campaignsWithStats });
  }),
);

export default router;
