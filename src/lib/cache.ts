// Tiny in-memory TTL cache to conserve YouTube API quota. Per server instance only.
interface Entry<T> {
  value: T;
  expires: number;
}
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (store.size > 500) for (const [k, e] of store) if (e.expires <= Date.now()) store.delete(k);
  return value;
}

export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
