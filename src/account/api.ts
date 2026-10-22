/** Calls to the Python Blocks server's API (server/app.ts), with the session cookie. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
/** Where to go to sign in again, keeping the page to come back to. */
export const signInPage = () => `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

export async function api<T = void>(method: string, url: string, body?: unknown, options: { keepalive?: boolean } = {}): Promise<T> {
  // The server takes changes only as JSON, so a change with nothing to say sends {}.
  if (body === undefined && method !== 'GET' && method !== 'DELETE') body = {};
  const res = await fetch(url, {
    method, credentials: 'same-origin', keepalive: options.keepalive,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (res.status === 401 && !url.startsWith('/api/login')) { location.assign(signInPage()); throw new ApiError(401, 'Sign in again.'); }
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `The server said ${res.status}.`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
