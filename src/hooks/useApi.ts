"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "@/lib/client";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** GET a JSON endpoint. Pass null to skip fetching. */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    getJson<T>(url)
      .then((d) => mine === seq.current && setData(d))
      .catch((e: unknown) => mine === seq.current && setError(e instanceof Error ? e.message : "Request failed"))
      .finally(() => mine === seq.current && setLoading(false));
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export interface MeResponse {
  user: {
    email: string;
    name: string | null;
    picture: string | null;
    channelId: string | null;
    channelTitle: string | null;
    permissionMode: "READ" | "APPROVAL" | "WRITE";
    canEditYouTube: boolean;
  };
  modeInfo: Record<"READ" | "APPROVAL" | "WRITE", { label: string; summary: string }>;
}

export const useMe = () => useApi<MeResponse>("/api/me");
