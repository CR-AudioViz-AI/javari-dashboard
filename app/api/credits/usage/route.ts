import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUser() {
  const cookieStore = cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

// GET - Get usage stats and credit balance
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";

    const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // Get credit balance
    const { data: credits } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Get transactions
    const { data: transactions } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });

    // Calculate usage by type
    const usageByType: Record<string, number> = {};
    const usageByDay: Record<string, number> = {};
    
    transactions?.forEach(tx => {
      if (tx.amount < 0) {
        const type = tx.type || "other";
        usageByType[type] = (usageByType[type] || 0) + Math.abs(tx.amount);
        
        const day = new Date(tx.created_at).toISOString().split("T")[0];
        usageByDay[day] = (usageByDay[day] || 0) + Math.abs(tx.amount);
      }
    });

    // Get subscription limits
    const { data: subscription } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    const planLimits: Record<string, { credits: number; apiCalls: number }> = {
      free: { credits: 100, apiCalls: 1000 },
      starter: { credits: 500, apiCalls: 5000 },
      pro: { credits: 2000, apiCalls: 25000 },
      enterprise: { credits: 10000, apiCalls: 100000 }
    };

    const currentPlan = subscription?.plan_id || "free";
    const limits = planLimits[currentPlan] || planLimits.free;

    // Calculate usage this period
    const totalUsage = transactions
      ?.filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0) || 0;

    return NextResponse.json({
      credits: {
        balance: credits?.balance || 0,
        lifetimeEarned: credits?.lifetime_earned || 0,
        lifetimeSpent: credits?.lifetime_spent || 0
      },
      usage: {
        period,
        total: totalUsage,
        byType: usageByType,
        byDay: Object.entries(usageByDay).map(([date, amount]) => ({ date, amount }))
      },
      limits: {
        plan: currentPlan,
        creditsLimit: limits.credits,
        apiCallsLimit: limits.apiCalls,
        creditsUsedPercent: limits.credits > 0 ? (totalUsage / limits.credits) * 100 : 0
      },
      transactions: transactions?.slice(0, 50) || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Purchase credits
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { packageId } = body;

    const packages: Record<string, { credits: number; price: number }> = {
      small: { credits: 100, price: 499 },
      medium: { credits: 500, price: 1999 },
      large: { credits: 2000, price: 6999 },
      xlarge: { credits: 5000, price: 14999 }
    };

    const pkg = packages[packageId];
    if (!pkg) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    // Get Stripe customer ID
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-06-20"
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: profile?.stripe_customer_id,
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${pkg.credits} Credits`,
            description: `One-time purchase of ${pkg.credits} AI credits`
          },
          unit_amount: pkg.price
        },
        quantity: 1
      }],
      metadata: {
        user_id: user.id,
        credits: pkg.credits.toString(),
        type: "credit_purchase"
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/credits?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/credits?canceled=true`
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}