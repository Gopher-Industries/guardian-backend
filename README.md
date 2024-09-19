
# Guardian System Management API

The Guardian System Management API provides functionalities for managing user data, including user registration, login, password reset, and more.

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

3. Set up environment variables by creating a `.env` file in the project root:
   ```bash
   touch .env
   ```
   Add the following environment variables to the `.env` file:
   ```plaintext
   MONGODB_URL=mongodb://localhost:27017/guardian
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=your_jwt_secret_key
   ```
   If using Ethereal for testing email functionality, add:
   ```plaintext
   EMAIL_USER=your_ethereal_user
   EMAIL_PASS=your_ethereal_password
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

- **POST** `/api/users/register` - Register a new user
- **POST** `/api/users/login` - Login a user and receive a JWT token
- **POST** `/api/users/request-reset-password` - Request a password reset email
- **POST** `/api/users/reset-password` - Reset the user's password using a token
- **POST** `/api/users/change-password` - Change the user's password (requires JWT token)

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

### Password Reset and Expiry Check

The API includes functionality for handling user password resets and reminders for password expiration:

1. **Request Password Reset**: Allows users to request a password reset email. An email is sent to the user’s registered email address with a link to reset the password.
2. **Reset Password**: Users can reset their password using a token sent to their email. This process verifies the token and allows the user to set a new password.
3. **Change Password**: Logged-in users can change their password by providing their current password and a new password.
4. **Password Expiry Check**: During login, if the user's password is about to expire (within 5 days of the 90-day expiry period), a reminder is included in the response.

### Authentication

This API uses JWT (JSON Web Tokens) for securing routes. The token is issued upon successful login and must be included in the `x-auth-token` header of requests to protected routes.

### Testing

To test the API, use Postman or similar API testing tools.

1. **Start the server** using the Docker Compose command mentioned above.
2. **Use Postman** to send HTTP requests to the API endpoints. Examples:
   - **POST** `/api/users/register` - Register a new user.
   - **POST** `/api/users/login` - Log in to get a JWT token.
   - **POST** `/api/users/request-reset-password` - Request a password reset email.
   - **POST** `/api/users/reset-password` - Reset the user's password.

### Environment Variables

- `MONGODB_URL`: The MongoDB connection string.
- `PORT`: The port on which the application runs (default: 3000).
- `NODE_ENV`: The environment in which the app is running (e.g., `development`).
- `JWT_SECRET`: The secret key used to sign JWT tokens.
- `EMAIL_USER`: Ethereal email username (for testing email functionality).
- `EMAIL_PASS`: Ethereal email password (for testing email functionality).

### Built With

- **Node.js** - The runtime environment
- **Express** - The web framework used
- **Mongoose** - MongoDB object modeling for Node.js
- **JWT** - JSON Web Token for secure authentication
- **Nodemailer** - For sending emails (using Ethereal for testing)
- **Docker** - Containerization for the application

### Notes

- Ensure to replace placeholder values in the `.env` file with actual values for local testing.
- The password reset functionality uses Ethereal for email testing. You can use the preview URL from the console logs to view the sent emails.
```

### Summary of Updates:
- **Password Reset**: Added endpoints for requesting a password reset and resetting the password using a token.
- **Password Expiry Check**: Explained the password expiry reminder included in the login response.
- **Environment Variables**: Included `EMAIL_USER` and `EMAIL_PASS` for email functionality testing using Ethereal.