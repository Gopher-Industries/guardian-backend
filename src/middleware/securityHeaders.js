// Basic security headers for every response.
//
// - Pages can't be shown inside another site's frame (clickjacking).
// - Browsers must not guess content types.
// - Full URLs aren't leaked to other sites in the Referer header.
// - HTTPS is remembered for a year in production.
//
// A full Content-Security-Policy is left out on purpose because Swagger UI
// and the EJS password-reset page use inline scripts; frame-ancestors is the
// part that stops clickjacking.
function securityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

module.exports = securityHeaders;
