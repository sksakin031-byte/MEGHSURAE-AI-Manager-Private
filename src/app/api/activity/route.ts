import { route } from "@/lib/api";
import { listActivity } from "@/services/activity";

export const GET = route({}, async ({ user }) => ({ activity: await listActivity(user.id, 150) }));
