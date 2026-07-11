// Where the real-time soil telemetry lives.
// '' = same origin → the Node server's DEV MOCK (fake wandering readings).
// When the real cloud stack (API Gateway + Lambda + DynamoDB) is up, set this
// to its base URL, e.g. 'https://xxxx.execute-api.us-east-1.amazonaws.com'.
export const TELEMETRY_BASE = '';

export const POLL_TELEMETRY_MS = 2000;         // hardware-plant poll cadence
export const POLL_TELEMETRY_HIDDEN_MS = 15000; // backoff while tab hidden
export const STALE_MS = 10000;                 // older than this → "probe offline"

export const WATER_AMOUNT = 20;                // +moisture per watering (walk-up or debug)
export const WATER_FX_MS = 1500;               // pour animation + movement-lock duration

export const LS_STATE = 'greenhouse_v1';       // v1-compatible localStorage schema
export const LS_TOKEN = 'gh_token';
