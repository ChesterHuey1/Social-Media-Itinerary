/** Started once, outside render, and read with use(): true when this browser has a session cookie the server accepts. */
export const initialSignedIn: Promise<boolean> = fetch('/api/auth/me').then((response) => response.ok);

/** Resolves to null when signed in, or the message to show. */
export async function signIn(password: string): Promise<string | null> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (response.ok) return null;
  const body = (await response.json().catch(() => null)) as { detail?: string } | null;
  return body?.detail ?? "Couldn't sign in. Try again.";
}
