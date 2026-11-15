"use client";
import { useEffect, useState } from "react";

/** Reads a query-string value after mount (avoids Suspense requirements of useSearchParams). */
export function useQueryParam(name: string): string {
  const [v, setV] = useState("");
  useEffect(() => setV(new URLSearchParams(window.location.search).get(name) ?? ""), [name]);
  return v;
}
