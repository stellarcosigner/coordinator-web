/**
 * Runtime configuration.
 *
 * The API base URL comes from the `VITE_API_URL` build-time environment
 * variable. It must point at a running coordinator-api instance; in production
 * that origin must also allow this frontend's origin via the API's
 * CORS_ORIGIN setting.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL;
