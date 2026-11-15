import { z } from "zod";
import { route } from "@/lib/api";
import { getAnalyticsOverview } from "@/services/analytics";

const q = z.object({ days: z.coerce.number().int().refine((d) => [7, 28, 90].includes(d), "days must be 7, 28 or 90").default(28) });

export const GET = route({ perMinute: 20 }, async ({ req, user }) => {
  const { days } = q.parse({ days: req.nextUrl.searchParams.get("days") ?? undefined });
  return { analytics: await getAnalyticsOverview(user.id, days) };
});
