import { prisma } from '@/lib/prisma';
import { PaymentStatus } from '@prisma/client';

export class TransactionRepository {
  public async create(data: {
    userId: string;
    subscriptionId?: string | null;
    status: PaymentStatus;
    amountCents: number;
    currency: string;
    razorpayOrderId?: string | null;
  }) {
    return prisma.paymentTransaction.create({ data });
  }

  public async findByRazorpayOrderId(razorpayOrderId: string) {
    return prisma.paymentTransaction.findUnique({ where: { razorpayOrderId } });
  }

  public async findByRazorpayPaymentId(razorpayPaymentId: string) {
    return prisma.paymentTransaction.findUnique({ where: { razorpayPaymentId } });
  }

  public async updateByOrderId(
    razorpayOrderId: string,
    data: Partial<{
      status: PaymentStatus;
      razorpayPaymentId: string | null;
      razorpaySignatureVerified: boolean;
      failureReason: string | null;
    }>
  ) {
    return prisma.paymentTransaction.update({ where: { razorpayOrderId }, data });
  }

  public async listByUser(userId: string, opts?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize ?? 20));
    const [items, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.paymentTransaction.count({ where: { userId } })
    ]);
    return { items, total, page, pageSize };
  }
}

export const transactionRepository = new TransactionRepository();
