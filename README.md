

```markdown
# Guardian System Management API

The Guardian System Management API provides functionalities for managing user data
## Getting Started

These instructions will help you get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v14 or later recommended)
- Docker and Docker Compose
- MongoDB (Local or Remote Instance)
- Postman (For API Testing)

### Installation

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/Gopher-Industries/guardian-backend.git
   ```

2. Navigate into the project directory:
   ```bash
   cd guardian-backend
   ```

3. Set up environment variables by creating a `.env` file in the project root, or simply rename the `.env.sample` file and remove the `.sample` extension and skip this step:
   ```bash
   touch .env
   ```
   Add the following environment variables to the `.env` file:
   ```plaintext
   BASE_URL=http://localhost:3000
   MONGODB_URL=mongodb://localhost:27017/guardian
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=your_jwt_secret_key
   ```

4. You might need to install the `dotenv` package:
   ```bash
   npm install dotenv
   ```

5. Start the application with Docker:
   ```bash
   docker-compose up --build
   ```

6. The API will be available at `http://localhost:3000`.

### Project Structure

```
guardian-backend/
│
├── config/               # Configuration files (MongoDB connection)
│   └── db.js
├── models/               # MongoDB schemas (Mongoose models)
│   ├── User.js
│   ├── UserRole.js
│   ├── WifiCSI.js
│   ├── ActivityRecognition.js
│   ├── Alert.js
│   └── Notification.js
├── routes/               # API route handlers
│   ├── auth.js           # Authentication routes (register, login, protected routes)
│   ├── user.js           # User routes (protected by JWT)
│   ├── wifiCSI.js        # Wi-Fi CSI routes (protected by JWT)
│   ├── activityRecognition.js # Activity recognition routes (protected by JWT)
│   └── alerts.js         # Alerts routes (protected by JWT)
├── .env                  # Environment variables
├── server.js             # Main server file
└── package.json          # Dependencies and scripts
```

### API Endpoints

#### Authentication

- **POST** `/api/auth/register` - Register a new user
- **POST** `/api/auth/login` - Login a user and receive a JWT token
- **GET** `/api/auth/me` - Get the authenticated user's information (requires JWT token)

#### User Management

- **GET** `/api/users` - Get all users (requires JWT token)

#### Wi-Fi CSI Data Management

- **POST** `/api/wifi-csi` - Create a new Wi-Fi CSI record (requires JWT token)
- **GET** `/api/wifi-csi` - Get all Wi-Fi CSI records (requires JWT token)

#### Activity Recognition

- **POST** `/api/activity-recognition` - Create a new activity recognition record (requires JWT token)
- **GET** `/api/activity-recognition` - Get all activity recognition records (requires JWT token)

#### Alerts and Notifications

- **POST** `/api/alerts` - Create a new alert (requires JWT token)
- **GET** `/api/alerts` - Get all alerts (requires JWT token)

### Authentication

This API uses JWT (JSON Web Tokens) for securing routes. The token is issued upon successful login and must be included in the `x-auth-token` header of requests to protected routes.

### Testing

To test the API, use Postman or similar API testing tools.

1. **Start the server** using the Docker Compose command mentioned above.
2. **Use Postman** to send HTTP requests to the API endpoints. Examples:
   - **POST** `/api/auth/register` - Register a new user.
   - **POST** `/api/auth/login` - Log in to get a JWT token.
   - **GET** `/api/auth/me` - Access a protected route using the JWT token.
   - **GET** `/api/users` - Access the users' list using the JWT token.

### Environment Variables

- `MONGODB_URL`: The MongoDB connection string.
- `PORT`: The port on which the application runs (default: 3000).
- `NODE_ENV`: The environment in which the app is running (e.g., `development`).
- `JWT_SECRET`: The secret key used to sign JWT tokens.

### Security Features
Rate Limiter:

Protects the API by limiting the number of requests per IP address within a given time window.
Configured globally for all endpoints with the following settings:
Limit: 100 requests per 15 minutes
Response: HTTP 429 with the message: "Too many requests from this IP, please try again after 15 minutes."
Request Blocker:

Blocks requests from script-based tools such as curl, wget, or custom scripts by analyzing headers and user agents.

### Built With

- **Node.js** - The runtime environment
- **Express** - The web framework used
- **Mongoose** - MongoDB object modeling for Node.js
- **JWT** - JSON Web Token for secure authentication
- **Docker** - Containerization for the application


```

### Summary of Updates:

- **Added JWT Authentication**: Explained the JWT implementation and how to use it with the API.
- **Updated Project Structure**: Included the new `auth.js` route and the integration of JWT in the `user.js`, `wifiCSI.js`, `activityRecognition.js`, and `alerts.js` routes.
- **Detailed API Endpoints**: Provided information on how to use the authentication endpoints and access protected routes.
- **Environment Variables**: Added the `JWT_SECRET` key to the list of environment variables.