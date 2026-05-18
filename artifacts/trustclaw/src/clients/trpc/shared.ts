/**
 * Returns the base URL for tRPC requests.
 * - If VITE_API_URL is set, uses that (production / cross-origin API server)
 * - Otherwise empty string (same-origin, works via Replit proxy path routing)
 */
export function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? "";
}
