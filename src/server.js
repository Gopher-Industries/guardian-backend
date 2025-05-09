require('dotenv').config();

const express = require('express');
const path = require('path');
const database = require('./config/db');
const multer = require('multer');

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save to "uploads" folder
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

exports.upload = multer({ storage });

app.use('/uploads', express.static('uploads'));

// Security Middleware
const blockScriptRequests = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const normalizedUserAgent = userAgent.toLowerCase();

  console.log(`Incoming Request - User-Agent: ${normalizedUserAgent}`);
  console.log('Request Headers:', req.headers);

  // Disallowed User-Agents
  const disallowedUserAgents = [
    'curl',
    'wget',
    'python-requests',
    'node-fetch',
    'axios',
    'java-http-client',
    'php',
    'httpie',
  ];

  // Browser headers to check
  const requiredBrowserHeaders = {
    'sec-fetch-site': /same-origin|cross-site/,
    'sec-fetch-mode': /navigate|cors/,
    'sec-fetch-dest': /document|iframe/,
    'referer': /http(s)?:\/\//,
    'accept': /text\/html|application\/json|\*\/\*/,
    'cookie': /.*/, // At least one cookie (adjust based on your app)
  };

  // Block disallowed User-Agents
  if (!userAgent || disallowedUserAgents.some(ua => normalizedUserAgent.includes(ua))) {
    console.log('Blocked Request - Disallowed User-Agent Detected');
    return res.status(403).json({ error: 'Forbidden: CLI or script-based requests are not allowed.' });
  }

  // Check for browser-specific headers
  for (const [header, pattern] of Object.entries(requiredBrowserHeaders)) {
    const headerValue = req.headers[header];

    // Skip validation for optional headers if they are missing
    if (['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'].includes(header) && !headerValue) {
      continue; // Allow requests without these optional headers
    }

    // Skip validation for the "referer" header if it's missing
    if (header === 'referer' && !headerValue) {
      continue; // Allow requests without a "referer" header
    }

    if (!headerValue || !pattern.test(headerValue)) {
      console.log(`Blocked Request - Missing or Invalid Header: ${header}`);
      return res.status(403).json({ error: `Forbidden: Missing or invalid ${header} header.` });
    }
  }

  // Additional validation: Block requests missing cookies (optional)
  if (!req.headers['cookie']) {
    console.log('Blocked Request - Missing Cookie Header');
    return res.status(403).json({ error: 'Forbidden: Missing browser-specific cookie header.' });
  }

  next(); // Allow legitimate requests
};

// Apply middleware globally to all endpoints 
// TODO: Need to test this middleware with requests from browsers, postman, and the application
// app.use(blockScriptRequests);


const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);


// Swagger Setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Guardian API',
      version: '1.0.0',
      description: 'API documentation with Swagger UI and Redoc'
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [], // Apply globally to all endpoints
    },
  ],
  apis: ['./src/routes/*.js', './src/routes/**/*.js', './src/controllers/*.js'],  // Add the controllers path here
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Set up EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const userRoutes = require('./routes/user');
const caretakerRoutes = require('./routes/caretakerRoutes');
const nurseRoutes = require('./routes/nurseRoutes');
const patientRoutes = require('./routes/patientRoutes');
const wifiCSIRoutes = require('./routes/wifiCSI');
const activityRecognitionRoutes = require('./routes/activityRecognition');
const alertsRoutes = require('./routes/alerts');

app.use('/api/v1/auth', userRoutes);
app.use('/api/v1/caretaker', caretakerRoutes);
app.use('/api/v1/nurse', nurseRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/wifi-csi', wifiCSIRoutes);
app.use('/api/v1/activity-recognition', activityRecognitionRoutes);
app.use('/api/v1/alerts', alertsRoutes);

app.use(
  '/swaggerDocs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.1/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.1/swagger-ui-bundle.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.1/swagger-ui-standalone-preset.min.js'
    ]
  })
);

app.get('/redoc', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Guardian Monitor APIs</title>
        <!-- Include the Redoc script -->
        <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
      </head>
      <body>
        <redoc spec-url="/openapi.json"></redoc> <!-- Specify OpenAPI spec URL -->
        <script>
          Redoc.init('/openapi.json', {}, document.querySelector('redoc'));
        </script>
      </body>
    </html>
  `);
});

app.get('/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="ie=edge">
      <title>Guardian API Documentation</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-color: #f4f4f4;
        }
        .container {
          text-align: center;
        }
        h1 {
          color: #333;
        }
        .button-container {
          margin-top: 20px;
        }
        .button {
          background-color: #4CAF50; /* Green */
          border: none;
          color: white;
          padding: 15px 32px;
          text-align: center;
          text-decoration: none;
          display: inline-block;
          font-size: 16px;
          margin: 10px;
          cursor: pointer;
          border-radius: 8px;
          transition: background-color 0.3s ease;
        }
        .button:hover {
          background-color: #45a049;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Welcome to Guardian API. Read Our docs</h1>
        <div class="button-container">
          <a href="/swaggerDocs" class="button">Swagger UI Docs</a>
          <a href="/redoc" class="button">Redoc Docs</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
