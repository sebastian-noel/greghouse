import { LS_TOKEN } from '../config.js';

// v1 api() helper: bearer token from localStorage, JSON in/out, error.message
// from the server's {error} body
export async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(LS_TOKEN);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || ('http ' + res.status));
  }
  return res.json();
}
