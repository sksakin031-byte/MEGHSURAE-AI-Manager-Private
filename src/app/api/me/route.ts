import { route } from "@/lib/api";
import { MODE_INFO } from "@/lib/permissions";

export const GET = route({}, async ({ user }) => ({
  user: {
    email: user.email,
    name: user.name,
    picture: user.picture,
    channelId: user.channelId,
    channelTitle: user.channelTitle,
    permissionMode: user.permissionMode,
    canEditYouTube: user.canEditYouTube,
  },
  modeInfo: MODE_INFO,
}));
