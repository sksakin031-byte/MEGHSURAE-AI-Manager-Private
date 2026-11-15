import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Shell channelTitle={user?.channelTitle ?? null}>{children}</Shell>;
}
