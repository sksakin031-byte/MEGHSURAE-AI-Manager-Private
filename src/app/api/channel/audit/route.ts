import { route } from "@/lib/api";
import { getAudit } from "@/services/insights";

export const GET = route({ perMinute: 20 }, async ({ user }) => ({ audit: await getAudit(user) }));
