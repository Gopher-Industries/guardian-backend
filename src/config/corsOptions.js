// Which websites may call the API from a browser.
//
// Set CORS_ALLOWED_ORIGINS to a comma-separated list, for example:
//   CORS_ALLOWED_ORIGINS=https://guardian-dashboard.vercel.app,https://guardian.example.org
//
// - Requests with no Origin header (Android app, curl, server-to-server,
//   same-origin pages) are always allowed; CORS only applies to browsers.
// - Outside production, local dev servers are allowed as well.
// - If the list is empty, every origin is still allowed (the old behaviour)
//   and a warning is logged, so a deploy without the setting doesn't break
//   the live dashboard. Set the variable to switch the restriction on.

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function getAllowedOrigins(env = process.env) {
  const configured = parseOrigins(env.CORS_ALLOWED_ORIGINS);
  if (!configured.length) return null; // not configured -> allow all
  return env.NODE_ENV === 'production' ? configured : [...configured, ...DEV_ORIGINS];
}

let warned = false;

function isOriginAllowed(origin, env = process.env) {
  if (!origin) return true;
  const allowed = getAllowedOrigins(env);
  if (!allowed) {
    if (!warned && env.NODE_ENV !== 'test') {
      warned = true;
      console.warn('[cors] CORS_ALLOWED_ORIGINS is not set; every website can call the API from a browser.');
    }
    return true;
  }
  return allowed.includes(String(origin).replace(/\/+$/, ''));
}

// Options for the `cors` package (Express).
function buildCorsOptions(env = process.env) {
  return {
    origin(origin, callback) {
      // false = no CORS headers, so the browser blocks the response.
      callback(null, isOriginAllowed(origin, env));
    },
    methods: METHODS,
    allowedHeaders: ALLOWED_HEADERS,
  };
}

// Options for socket.io.
function buildSocketCorsOptions(env = process.env) {
  return {
    origin(origin, callback) {
      callback(null, isOriginAllowed(origin, env));
    },
    methods: ['GET', 'POST'],
  };
}

module.exports = {
  buildCorsOptions,
  buildSocketCorsOptions,
  isOriginAllowed,
  getAllowedOrigins,
  parseOrigins,
};
