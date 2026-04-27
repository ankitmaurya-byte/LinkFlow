import { config } from '../config.js';

// Origin is matched against config.corsOrigins (comma-separated patterns).
// A pattern can be:
//   '*'                   → allow any origin
//   'http://localhost:*'  → wildcard suffix (everything after last '*' must follow the prefix)
//   'moz-extension://*'   → matches any moz-extension://<id> origin
//   'https://app.example' → exact match
function matchOrigin(origin, pattern) {
  if (!origin || !pattern) return false;
  if (pattern === '*') return true;
  if (pattern === origin) return true;
  const star = pattern.indexOf('*');
  if (star === -1) return false;
  const prefix = pattern.slice(0, star);
  return origin.startsWith(prefix);
}

function isAllowed(origin) {
  return config.corsOrigins.some(p => matchOrigin(origin, p));
}

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}
