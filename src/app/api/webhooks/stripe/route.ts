import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@/db';
import { enrollments } from '@/db/schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe sends a raw body — must not be parsed by Next.js body parser
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  const sig = headers().get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Missing signature or webhook secret', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // programId and learnerId are passed as metadata when creating the Stripe session
    const { programId, learnerId, offeringId } = session.metadata ?? {};

    if (programId && learnerId) {
      await db
        .insert(enrollments)
        .values({
          learnerId,
          programId,
          offeringId: offeringId ?? 'paid_learner',
          status: 'active',
        })
        .onConflictDoNothing(); // idempotent — Stripe may retry webhooks

      console.log(`Enrollment created: learner=${learnerId} program=${programId}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    // Handle subscription cancellation — suspend enrollment
    const subscription = event.data.object as Stripe.Subscription;
    const { learnerId, programId } = subscription.metadata ?? {};

    if (learnerId && programId) {
      await db
        .update(enrollments)
        .set({ status: 'suspended' })
        .where(
          // Using raw SQL since we need AND on two columns
          db.execute(
            `learnerId = ${learnerId} AND programId = ${programId}`
          ) as never,
        );
    }
  }

  return new Response('ok', { status: 200 });
}
