import { NextResponse, type NextRequest } from "next/server";

import {
  createFinancialModelingPrepProvider,
  refreshTrackedMarketData,
} from "@/lib/market-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleScheduledMarketDataRefresh(request);
}

export async function POST(request: NextRequest) {
  return handleScheduledMarketDataRefresh(request);
}

async function handleScheduledMarketDataRefresh(request: NextRequest) {
  if (!isAuthorizedScheduledRefreshRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshTrackedMarketData({
      provider: createFinancialModelingPrepProvider(),
      supabase: createAdminClient(),
    });

    return NextResponse.json({
      ...result,
      summary: {
        requested: result.symbols.length,
        refreshed: result.refreshed.length,
        failed: result.failed.length,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Scheduled market data refresh failed.",
      },
      { status: 500 },
    );
  }
}

function isAuthorizedScheduledRefreshRequest(request: NextRequest) {
  const secret = getScheduledRefreshSecret();

  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function getScheduledRefreshSecret() {
  return process.env.MARKET_DATA_REFRESH_SECRET ?? process.env.CRON_SECRET;
}
