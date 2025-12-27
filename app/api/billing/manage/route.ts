import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20"
});

async function getUser() {
  const cookieStore = cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return null;
  
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

// GET - Get billing info, invoices, payment methods
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "overview";

    // Get user profile with Stripe customer ID
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id, subscription_tier")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({
        subscription: null,
        invoices: [],
        paymentMethods: [],
        credits: { balance: 0 }
      });
    }

    const customerId = profile.stripe_customer_id;

    if (action === "overview") {
      // Get subscription
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1
      });

      // Get invoices
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 10
      });

      // Get payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card"
      });

      // Get credits
      const { data: credits } = await supabase
        .from("user_credits")
        .select("balance, lifetime_earned")
        .eq("user_id", user.id)
        .single();

      return NextResponse.json({
        subscription: subscriptions.data[0] || null,
        invoices: invoices.data.map(inv => ({
          id: inv.id,
          amount: inv.amount_paid,
          status: inv.status,
          date: inv.created,
          pdf: inv.invoice_pdf,
          description: inv.description
        })),
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
          isDefault: pm.id === (subscriptions.data[0]?.default_payment_method as string)
        })),
        credits: credits || { balance: 0, lifetime_earned: 0 }
      });
    }

    if (action === "invoices") {
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 100
      });

      return NextResponse.json({
        invoices: invoices.data.map(inv => ({
          id: inv.id,
          number: inv.number,
          amount: inv.amount_paid,
          status: inv.status,
          date: inv.created,
          dueDate: inv.due_date,
          pdf: inv.invoice_pdf,
          description: inv.description,
          lines: inv.lines.data.map(line => ({
            description: line.description,
            amount: line.amount
          }))
        }))
      });
    }

    if (action === "usage") {
      const { data: transactions } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      return NextResponse.json({ transactions });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Billing actions (portal, update payment, cancel)
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account" }, { status: 400 });
    }

    switch (action) {
      case "portal": {
        // Create Stripe Customer Portal session
        const session = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing`
        });
        return NextResponse.json({ url: session.url });
      }

      case "update_payment": {
        // Create setup intent for new payment method
        const setupIntent = await stripe.setupIntents.create({
          customer: profile.stripe_customer_id,
          payment_method_types: ["card"]
        });
        return NextResponse.json({ clientSecret: setupIntent.client_secret });
      }

      case "set_default_payment": {
        const { paymentMethodId } = body;
        await stripe.customers.update(profile.stripe_customer_id, {
          invoice_settings: { default_payment_method: paymentMethodId }
        });
        return NextResponse.json({ success: true });
      }

      case "remove_payment": {
        const { paymentMethodId } = body;
        await stripe.paymentMethods.detach(paymentMethodId);
        return NextResponse.json({ success: true });
      }

      case "cancel_subscription": {
        const { subscriptionId, reason } = body;
        const subscription = await stripe.subscriptions.cancel(subscriptionId);

        await supabase
          .from("user_subscriptions")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            cancellation_reason: reason
          })
          .eq("stripe_subscription_id", subscriptionId);

        return NextResponse.json({ subscription });
      }

      case "reactivate": {
        const { subscriptionId } = body;
        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: false
        });

        await supabase
          .from("user_subscriptions")
          .update({ status: "active", canceled_at: null })
          .eq("stripe_subscription_id", subscriptionId);

        return NextResponse.json({ subscription });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}