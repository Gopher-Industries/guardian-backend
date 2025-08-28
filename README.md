

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
├── controllers/
│   ├── organizationController.js
│   └── patientController.js
├── middleware/
│   ├── verifyToken.js
│   ├── verifyRole.js
│   └── context.js        # adds req.ctx { me, roleName, orgId, isOrgMember }
├── models/               # MongoDB schemas (Mongoose models)
│   ├── User.js
│   ├── Organization.js
│   ├── Patient.js
│   ├── EntryReport.js
│   ├── UserRole.js
│   ├── WifiCSI.js
│   ├── ActivityRecognition.js
│   ├── Alert.js
│   └── Notification.js
├── routes/               # API route handlers
│   ├── organizationRoutes.js
│   ├── patientRoutes.js
│   ├── auth.js
│   ├── user.js
│   ├── wifiCSI.js
│   ├── activityRecognition.js
│   └── alerts.js
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

#### Organization & Roster Management (Admin)
- **POST** `/api/v1/orgs/create` — Create an organization (caller becomes org admin & member)
- **POST** `/api/v1/orgs/add-member` — Add nurse/caretaker to org (approve + activate)
- **PATCH** `/api/v1/orgs/member-status` — Toggle isApproved / isActive
- **POST** `/api/v1/orgs/remove-member` — Remove member from org
- **GET** `/api/v1/orgs/me` — Org summary (admin/nurses/caretakers)
- **POST** `/api/v1/orgs/patients/register` — Create org patient (requires nurseId + caretakerId from same org, approved & active)

#### Patients (Org & Freelance)
- **POST** `/api/v1/patients/register` — Create freelance patient (caller nurse/caretaker; organization:null; optional freelance counterpart)
- **POST** `/api/v1/patients/assign-nurse` — Assign nurse (org: admin-only; freelance: creator/assignees)
- **POST** `/api/v1/patients/assign-caretaker` — Assign caretaker (same rules as above)
- **GET** `/api/v1/patients/org` — Patients in my org (admin: full; nurse/caretaker: roster view)
- **GET** `/api/v1/patients/assigned-patients` — Patients assigned to me (by role)
- **GET** `/api/v1/patients/:patientId` — Patient details (access enforced by org/assignment)
- **POST** `/api/v1/patients/entryreport` — Log activity (nurse or org admin)
- **GET** `/api/v1/patients/activities?patientId=` — Patient activities
- **DELETE** `/api/v1/patients/entryreport/:entryId` — Delete entry (org admin or author nurse)

#### Wi-Fi CSI Data Management

- **POST** `/api/wifi-csi` - Create a new Wi-Fi CSI record (requires JWT token)
- **GET** `/api/wifi-csi` - Get all Wi-Fi CSI records (requires JWT token)

#### Activity Recognition

- **POST** `/api/activity-recognition` - Create a new activity recognition record (requires JWT token)
- **GET** `/api/activity-recognition` - Get all activity recognition records (requires JWT token)

#### Alerts and Notifications

- **POST** `/api/alerts` - Create a new alert (requires JWT token)
- **GET** `/api/alerts` - Get all alerts (requires JWT token)

### Modes & Access Rules (Summary)
**Organization Mode**
- Only org admins can create patients and assign exactly one nurse + one caretaker (same org, approved & active).
- Org staff can view within org; non-admins must be assigned (or creator).
  
**Freelance Mode**
- Nurses/Caretakers can create patients with organization:null.
- Assignments allowed among freelance users (no org membership).

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
- Org Management: New controller/routes (/api/v1/orgs/*) for org create, add/remove members, approve/activate, org summary.
- Patients (Org & Freelance):
- Freelance register: /api/v1/patients/register (nurse/caretaker).
- Org register (admin-only): /api/v1/orgs/patients/register.
- Assignments: /api/v1/patients/assign-nurse, /api/v1/patients/assign-caretaker.
- Lists/Details: /api/v1/patients/org, /api/v1/patients/assigned-patients, /:patientId.
- RBAC Context: Added context middleware (req.ctx: me, roleName, orgId, isOrgMember) and enforced access rules.
- Activity Logs: Entry reports create/list/delete with role & assignment checks.
- Models:
- User (org, approvals, assignedPatients, secure hashing).
- Patient (uuid, org links, single nurse/caretaker, photo).
- Organization (admin, nurses, caretakers, patients).
- Wiring & Docs: Routes added in server.js, uploads served, rate limiting kept, Swagger/ReDoc updated.
