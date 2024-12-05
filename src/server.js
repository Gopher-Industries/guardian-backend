require('dotenv').config();

const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const database = require('./config/db');
const patientSelfRoutes = require('./routes/patientSelfRegistration');
const app = express();
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
  apis: ['./src/routes/*.js','./src/routes/**/*.js', './src/controllers/*.js'],  // Add the controllers path here
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);


// Set up EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const wifiCSIRoutes = require('./routes/wifiCSI');
const activityRecognitionRoutes = require('./routes/activityRecognition');
const alertsRoutes = require('./routes/alerts');
const nurseRoutes = require('./routes/nurseRoutes'); // Import nurse routes
const userRoutes = require('./routes/user');

app.use('/swaggerDocs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/wifi-csi', wifiCSIRoutes);
app.use('/api/v1/activity-recognition', activityRecognitionRoutes);
app.use('/api/v1/alerts', alertsRoutes);
app.use("/api/v1/nurse", nurseRoutes);
app.use("/api/v1/auth", userRoutes);
app.use('/api/v1/patient-self', patientSelfRoutes);

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