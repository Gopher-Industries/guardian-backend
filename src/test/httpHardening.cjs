process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const express = require('express');
const cors = require('cors');

const securityHeaders = require('../middleware/securityHeaders');
const { buildCorsOptions, isOriginAllowed, getAllowedOrigins } = require('../config/corsOptions');

chai.use(chaiHttp);
const { expect } = chai;

// Small app wired the same way as server.js.
function makeApp(env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  const corsOptions = buildCorsOptions(env);
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

describe('http hardening', () => {
  describe('security headers', () => {
    it('stops the API being framed by other sites', async () => {
      const res = await chai.request(makeApp({})).get('/ping');

      expect(res).to.have.status(200);
      expect(res).to.have.header('x-frame-options', 'DENY');
      expect(res).to.have.header('content-security-policy', "frame-ancestors 'none'");
      expect(res).to.have.header('x-content-type-options', 'nosniff');
      expect(res).to.have.header('referrer-policy', 'strict-origin-when-cross-origin');
      expect(res.headers).to.not.have.property('x-powered-by');
    });

    it('adds HSTS only in production', async () => {
      const original = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const prod = await chai.request(makeApp({})).get('/ping');
        expect(prod.headers['strict-transport-security']).to.contain('max-age=31536000');
      } finally {
        process.env.NODE_ENV = original;
      }

      const dev = await chai.request(makeApp({})).get('/ping');
      expect(dev.headers).to.not.have.property('strict-transport-security');
    });
  });

  describe('CORS', () => {
    const prodEnv = {
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://dashboard.example.org, https://admin.example.org/',
    };

    it('allows a listed website', async () => {
      const res = await chai.request(makeApp(prodEnv)).get('/ping').set('Origin', 'https://dashboard.example.org');

      expect(res).to.have.header('access-control-allow-origin', 'https://dashboard.example.org');
    });

    it('gives no CORS headers to an unlisted website', async () => {
      const res = await chai.request(makeApp(prodEnv)).get('/ping').set('Origin', 'https://evil.example.com');

      expect(res.headers).to.not.have.property('access-control-allow-origin');
    });

    it('answers preflight only for listed websites', async () => {
      const good = await chai.request(makeApp(prodEnv)).options('/ping')
        .set('Origin', 'https://admin.example.org')
        .set('Access-Control-Request-Method', 'POST');
      const bad = await chai.request(makeApp(prodEnv)).options('/ping')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(good).to.have.header('access-control-allow-origin', 'https://admin.example.org');
      expect(bad.headers).to.not.have.property('access-control-allow-origin');
    });

    it('always allows requests with no Origin (Android app, server calls)', async () => {
      const res = await chai.request(makeApp(prodEnv)).get('/ping');

      expect(res).to.have.status(200);
      expect(isOriginAllowed(undefined, prodEnv)).to.equal(true);
    });

    it('allows local dev servers outside production only', () => {
      const devEnv = { ...prodEnv, NODE_ENV: 'development' };

      expect(isOriginAllowed('http://localhost:5173', devEnv)).to.equal(true);
      expect(isOriginAllowed('http://localhost:5173', prodEnv)).to.equal(false);
    });

    it('keeps the old allow-all behaviour when nothing is configured', () => {
      expect(getAllowedOrigins({ NODE_ENV: 'production' })).to.equal(null);
      expect(isOriginAllowed('https://anything.example.com', { NODE_ENV: 'test' })).to.equal(true);
    });
  });
});
