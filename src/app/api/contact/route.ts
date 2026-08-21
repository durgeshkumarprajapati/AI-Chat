import { NextResponse } from 'next/server';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().trim().email('Invalid email address').max(150, 'Email is too long'),
  inquiryType: z.string().trim().min(1, 'Inquiry type is required'),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(2000, 'Message is too long')
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validatedData = contactSchema.parse(body);

    // Generate a clean ticket ID for support tracking
    const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Log contact request safely without leaking sensitive tokens
    console.log(`[ContactSupportAPI] Ticket created: ${ticketId} for email: ${validatedData.email} inquiry: ${validatedData.inquiryType}`);

    return NextResponse.json({
      success: true,
      message: 'Your inquiry has been submitted successfully.',
      ticketId,
      submittedAt: new Date().toISOString()
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: err.errors.map((e) => e.message)
        },
        { status: 400 }
      );
    }

    console.error('[ContactSupportAPI] Error handling contact submission:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'An internal error occurred while submitting your request. Please try again later.'
      },
      { status: 500 }
    );
  }
}
