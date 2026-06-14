import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { IngestCustomerSchema, IngestOrderSchema } from '../lib/schemas';
import { validate, asyncHandler } from '../lib/middleware';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ingest/customer
// Upsert a customer by email. Merges metadata shallowly so callers can patch
// individual traits without overwriting the entire JSONB blob.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/customer',
  validate(IngestCustomerSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { firstName, lastName, email, phone, metadata = {} } = req.body;

    const customer = await prisma.customer.upsert({
      where: { email },
      update: { firstName, lastName, phone, metadata },
      create: { firstName, lastName, email, phone, metadata },
    });

    res.status(200).json({ customer });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/ingest/order
// Creates an order and runs attribution: if the customer clicked a campaign
// link within the last 5 days, that delivery log is promoted to CONVERTED.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/order',
  validate(IngestOrderSchema),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { customerId, totalAmount, items } = req.body;

    // Verify customer exists before creating the order
    const customerExists = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customerExists) {
      res.status(404).json({ error: `Customer ${customerId} not found` });
      return;
    }

    // Run order creation + attribution atomically in a transaction
    const { order, attributed } = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: { customerId, totalAmount, items },
      });

      // 5-day attribution window
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000);

      // Find the most-recent CLICKED log within the window (last-touch model)
      const clickLog = await tx.deliveryLog.findFirst({
        where: {
          customerId,
          status: 'CLICKED',
          updatedAt: { gte: fiveDaysAgo },
        },
        orderBy: { updatedAt: 'desc' },
      });

      let attributed = false;
      if (clickLog) {
        await tx.deliveryLog.update({
          where: { id: clickLog.id },
          data: { status: 'CONVERTED' },
        });
        attributed = true;
      }

      return { order, attributed };
    });

    res.status(201).json({ order, attributed });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/ingest/customers
// Returns all customers ordered by creation date (newest first).
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/customers',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        orders: {
          select: { totalAmount: true }
        }
      }
    });
    res.json({ customers });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/ingest/orders
// Returns all orders with customer details ordered by creation date (newest first).
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/orders',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });
    res.json({ orders });
  }),
);

export default router;
