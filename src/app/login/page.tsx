import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  invalid_state: "The sign-in request could not be verified (state mismatch). Please try again.",
  expired_state: "The sign-in request expired. Please try again.",
  email_unverified: "Your Google email is not verified.",
  not_allowed: "This Google account is not allowed to use this instance (ALLOWED_EMAIL).",
  instance_taken: "This instance is already linked to a different Google account.",
  login_failed: "Sign-in failed. Check the server logs and your Google OAuth settings.",
  access_denied: "Google sign-in was cancelled.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  let configError: string | null = null;
  try {
    if (await getSessionUser()) redirect("/");
  } catch (e) {
    // redirect() throws a special error that must pass through.
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (typeof e === "object" && e !== null && "digest" in e) throw e;
    configError = e instanceof Error ? e.message : "Server configuration error.";
  }
  const message = error ? (MESSAGES[error] ?? "Sign-in failed.") : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div>
        <div className="text-3xl font-bold tracking-tight text-brand">MEGHSURAE</div>
        <p className="mt-1 text-muted">AI Manager for the @MEGHSURAE YouTube channel</p>
      </div>
      {configError && <div className="card border-danger/40 text-sm text-danger" role="alert">{configError}</div>}
      {message && <div className="card border-warn/40 text-sm text-warn" role="alert">{message}</div>}
      <div className="card space-y-3">
        <p className="text-sm text-muted">
          Sign in with the Google account that owns the channel. The app starts in <strong>Read mode</strong>: it can analyze but never change anything until you
          switch modes and approve each action.
        </p>
        <a className="btn btn-primary w-full" href="/api/auth/google" aria-disabled={Boolean(configError)}>
          Sign in with Google (read-only access)
        </a>
        <a className="btn w-full" href="/api/auth/google?access=manage">
          Sign in with edit access
        </a>
        <p className="text-xs text-muted">Edit access is only needed to apply approved changes to titles, descriptions, tags and playlists. You can revoke access any time in Settings.</p>
      </div>
    </main>
  );
}
