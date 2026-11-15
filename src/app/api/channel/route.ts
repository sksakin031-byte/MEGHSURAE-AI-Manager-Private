import { route } from "@/lib/api";
import { getChannel } from "@/services/insights";

export const GET = route({}, async ({ user }) => ({ channel: await getChannel(user) }));
