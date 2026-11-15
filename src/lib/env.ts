import { z } from "zod";
import { misconfigured } from "@/lib/errors";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/+$/, "")),
  GOOGLE_CLIENT_ID: z.string().min(10),
  GOOGLE_CLIENT_SECRET: z.string().min(5),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, "must be at least 32 characters"),
  ALLOWED_EMAIL: optional,
  MCP_AUTH_TOKEN: optional.refine((v) => v === undefined || v.length >= 24, "must be at least 24 characters"),
  MCP_ALLOW_URL_TOKEN: optional,
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: optional,
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment. Error messages list variable NAMES only, never values. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw misconfigured(`Invalid server configuration (${problems}). See .env.example and the README.`);
  }
  const e = parsed.data;
  if (e.GOOGLE_CLIENT_ID.startsWith("your-client-id") || e.TOKEN_ENCRYPTION_KEY.startsWith("replace-with")) {
    throw misconfigured("Environment still contains placeholder values from .env.example.");
  }
  cached = e;
  return e;
}

export function isHttps(): boolean {
  return env().APP_URL.startsWith("https://");
}

export function appOrigin(): string {
  return new URL(env().APP_URL).origin;
}
