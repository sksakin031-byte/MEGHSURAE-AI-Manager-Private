export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError(400, "bad_request", m, details);
export const unauthorized = (m = "Sign in required.") => new AppError(401, "unauthorized", m);
export const forbidden = (m = "Not allowed.") => new AppError(403, "forbidden", m);
export const notFound = (m = "Not found.") => new AppError(404, "not_found", m);
export const conflict = (m: string) => new AppError(409, "conflict", m);
export const tooMany = (m = "Too many requests. Try again shortly.") => new AppError(429, "rate_limited", m);
export const upstream = (m: string, status = 502) => new AppError(status, "upstream_error", m);
export const misconfigured = (m: string) => new AppError(500, "misconfigured", m);
