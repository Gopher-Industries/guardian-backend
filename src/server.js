require('dotenv').config();
const express = require('express');
const path = require('path');
require('./config/db'); // init DB
const { errorHandler, notFound } = require('./middleware/error');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Global API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      type: 'https://docs.api/errors/too-many-requests',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Try again in 15 minutes.'
    });
  }
});

app.use('/api', apiLimiter);

// Swagger / OpenAPI
const openapi = require('./openapi.json');
app.use('/swaggerDocs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/redoc', (_req, res) => {
  res.send(`<!doctype html><html><head>
    <title>Guardian API Docs</title>
    <meta charset="utf-8"/>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </head><body>
    <redoc spec-url="/swagger.json"></redoc>
  </body></html>`);
});
app.get('/swagger.json', (_req,res)=>res.json(openapi));

// Routes
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/users', require('./routes/userRoutes'));
app.use('/api/v1/patients', require('./routes/patientRoutes'));
app.use('/api/v1/credentials', require('./routes/credentialRoutes'));
app.use('/api/v1/wifi-csi', require('./routes/wifiCSI'));
app.use('/api/v1/patient-logs', require('./routes/patientLogRoutes'));

// Landing
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html><html><head>
    <meta charset="utf-8"/><title>Guardian API</title>
    <style>body{font-family:sans-serif;margin:40px}</style>
  </head><body>
    <h1>Welcome to Guardian API</h1>
    <p>See <a href="/swaggerDocs">Swagger UI</a> or <a href="/redoc">ReDoc</a>.</p>
  </body></html>`);
});

// 404 + errors
app.use(notFound);
app.use(errorHandler);

// Start
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports = app;
