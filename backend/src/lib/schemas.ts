// Centralised Zod schemas used across all route handlers.
// Import these in individual route files so validation is DRY.
import { z } from 'zod';

// ── Ingest ────────────────────────────────────────────────────────────────────

export const IngestCustomerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const IngestOrderSchema = z.object({
  customerId: z.string().uuid(),
  totalAmount: z.number().positive(),
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      qty: z.number().int().positive(),
      unitPrice: z.number().nonnegative(),
    }),
  ),
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const LaunchCampaignSchema = z.object({
  recipientIds: z.array(z.string().uuid()).min(1),
  goal: z.string().min(1),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'WHATSAPP']),
  copy: z.string().min(1),
});

// ── Channel Stub ──────────────────────────────────────────────────────────────

export const ChannelSendSchema = z.object({
  campaignId: z.string().uuid(),
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

export const DeliveryReceiptSchema = z.object({
  deliveryLogId: z.string().uuid(),
  status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'OPENED', 'READ', 'CLICKED']),
});
