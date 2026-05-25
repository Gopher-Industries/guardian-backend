/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: >
 *         JWT token obtained from /api/v1/auth/login.
 *         Pass it as: Authorization: Bearer <token>
 *
 *   schemas:
 *
 *     # ─────────────────────────────────────────────
 *     # AUTH
 *     # ─────────────────────────────────────────────
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *         - role
 *       properties:
 *         name:
 *           type: string
 *           example: "John Doe"
 *         email:
 *           type: string
 *           format: email
 *           example: "john.doe@guardianmonitor.com"
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: "SecurePass@123"
 *         role:
 *           type: string
 *           enum: [admin, caretaker, nurse, doctor]
 *           example: "nurse"
 *         phone:
 *           type: string
 *           example: "+61412345678"
 *         organizationId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "john.doe@guardianmonitor.com"
 *         password:
 *           type: string
 *           format: password
 *           example: "SecurePass@123"
 *
 *     LoginResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         user:
 *           $ref: '#/components/schemas/UserSummary'
 *
 *     UserSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         name:
 *           type: string
 *           example: "John Doe"
 *         email:
 *           type: string
 *           example: "john.doe@guardianmonitor.com"
 *         role:
 *           type: string
 *           enum: [admin, caretaker, nurse, doctor]
 *           example: "nurse"
 *
 *     OTPRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "john.doe@guardianmonitor.com"
 *
 *     OTPVerifyRequest:
 *       type: object
 *       required:
 *         - email
 *         - otp
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "john.doe@guardianmonitor.com"
 *         otp:
 *           type: string
 *           example: "847291"
 *
 *     ChangePasswordRequest:
 *       type: object
 *       required:
 *         - currentPassword
 *         - newPassword
 *       properties:
 *         currentPassword:
 *           type: string
 *           format: password
 *           example: "OldPass@123"
 *         newPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: "NewSecurePass@456"
 *
 *     ResetPasswordRequest:
 *       type: object
 *       required:
 *         - token
 *         - newPassword
 *       properties:
 *         token:
 *           type: string
 *           example: "reset-token-abc123"
 *         newPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: "NewSecurePass@456"
 *
 *     # ─────────────────────────────────────────────
 *     # PATIENT
 *     # ─────────────────────────────────────────────
 *     PatientCreateRequest:
 *       type: object
 *       required:
 *         - name
 *         - age
 *         - gender
 *       properties:
 *         name:
 *           type: string
 *           example: "Mary Jane"
 *         age:
 *           type: integer
 *           minimum: 0
 *           maximum: 150
 *           example: 72
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           example: "female"
 *         condition:
 *           type: string
 *           example: "Dementia - Stage 2"
 *         phone:
 *           type: string
 *           example: "+61412345678"
 *         address:
 *           type: string
 *           example: "12 Elder Street, Melbourne VIC 3000"
 *         photo:
 *           type: string
 *           format: binary
 *           description: Profile photo file upload (multipart/form-data)
 *         caretakerId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         nurseId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7c"
 *         doctorId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7d"
 *
 *     PatientUpdateRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "Mary Jane"
 *         age:
 *           type: integer
 *           example: 73
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           example: "female"
 *         condition:
 *           type: string
 *           example: "Dementia - Stage 3"
 *         phone:
 *           type: string
 *           example: "+61412345678"
 *         address:
 *           type: string
 *           example: "12 Elder Street, Melbourne VIC 3000"
 *         profilePhoto:
 *           type: string
 *           format: binary
 *           description: Updated profile photo (multipart/form-data)
 *
 *     PatientSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         name:
 *           type: string
 *           example: "Mary Jane"
 *         age:
 *           type: integer
 *           example: 72
 *         gender:
 *           type: string
 *           example: "female"
 *         condition:
 *           type: string
 *           example: "Dementia - Stage 2"
 *         isActive:
 *           type: boolean
 *           default: true
 *           example: true
 *         photo:
 *           type: string
 *           example: "uploads/1714000000000-profile.jpg"
 *
 *     AssignNurseRequest:
 *       type: object
 *       required:
 *         - patientId
 *         - nurseId
 *       properties:
 *         patientId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         nurseId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7c"
 *
 *     AssignDoctorRequest:
 *       type: object
 *       required:
 *         - doctorId
 *       properties:
 *         doctorId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7d"
 *         unassign:
 *           type: boolean
 *           default: false
 *           example: false
 *           description: Set true to unassign the doctor
 *
 *     # ─────────────────────────────────────────────
 *     # ADMIN - PATIENTS
 *     # ─────────────────────────────────────────────
 *     AdminPatientCreateRequest:
 *       type: object
 *       required:
 *         - name
 *         - age
 *         - gender
 *         - caretakerId
 *       properties:
 *         name:
 *           type: string
 *           example: "Robert Brown"
 *         age:
 *           type: integer
 *           minimum: 0
 *           example: 68
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           example: "male"
 *         caretakerId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *           description: Required — patient must have a caretaker
 *         nurseId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7c"
 *           description: Optional
 *         doctorId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7d"
 *           description: Optional
 *         condition:
 *           type: string
 *           example: "Parkinson's - Early Stage"
 *
 *     AdminPatientReassignRequest:
 *       type: object
 *       properties:
 *         caretakerId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         nurseId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7c"
 *         doctorId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7d"
 *
 *     PatientOverview:
 *       type: object
 *       properties:
 *         patient:
 *           $ref: '#/components/schemas/PatientSummary'
 *         records:
 *           type: array
 *           items:
 *             type: object
 *         carePlan:
 *           type: object
 *         tasks:
 *           type: array
 *           items:
 *             type: object
 *         logs:
 *           type: array
 *           items:
 *             type: object
 *
 *     # ─────────────────────────────────────────────
 *     # ADMIN - STAFF
 *     # ─────────────────────────────────────────────
 *     StaffAddRequest:
 *       type: object
 *       required:
 *         - userId
 *         - role
 *       properties:
 *         userId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *           description: ID of the existing user to add as staff
 *         role:
 *           type: string
 *           enum: [nurse, doctor]
 *           example: "nurse"
 *
 *     StaffSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         name:
 *           type: string
 *           example: "Dr. Sarah Connor"
 *         email:
 *           type: string
 *           example: "sarah.connor@guardianmonitor.com"
 *         role:
 *           type: string
 *           enum: [nurse, doctor]
 *           example: "doctor"
 *         isActive:
 *           type: boolean
 *           default: true
 *           example: true
 *
 *     # ─────────────────────────────────────────────
 *     # ORGANIZATION
 *     # ─────────────────────────────────────────────
 *     OrgCreateRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           example: "Sunrise Care Facility"
 *         address:
 *           type: string
 *           example: "45 Care Lane, Sydney NSW 2000"
 *         phone:
 *           type: string
 *           example: "+61298765432"
 *         email:
 *           type: string
 *           format: email
 *           example: "admin@sunrise.com.au"
 *
 *     OrgSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7b"
 *         name:
 *           type: string
 *           example: "Sunrise Care Facility"
 *         address:
 *           type: string
 *           example: "45 Care Lane, Sydney NSW 2000"
 *         adminId:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7c"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2025-05-10T08:30:00.000Z"
 *
 *     # ─────────────────────────────────────────────
 *     # DOCTOR
 *     # ─────────────────────────────────────────────
 *     DoctorSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7d"
 *         name:
 *           type: string
 *           example: "Dr. Alan Grant"
 *         email:
 *           type: string
 *           example: "alan.grant@guardianmonitor.com"
 *         specialization:
 *           type: string
 *           example: "Geriatrics"
 *         isActive:
 *           type: boolean
 *           default: true
 *           example: true
 *
 *     # ─────────────────────────────────────────────
 *     # NURSE
 *     # ─────────────────────────────────────────────
 *     NurseProfile:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1c2e8b1a2c3d4e5f6a7c"
 *         name:
 *           type: string
 *           example: "Nurse Emily Clark"
 *         email:
 *           type: string
 *           example: "emily.clark@guardianmonitor.com"
 *         phone:
 *           type: string
 *           example: "+61412345678"
 *         assignedPatients:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PatientSummary'
 *
 *     # ─────────────────────────────────────────────
 *     # COMMON RESPONSES
 *     # ─────────────────────────────────────────────
 *     SuccessMessage:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Operation completed successfully."
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "An error occurred."
 *
 *     ValidationError:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Validation failed: email is required."
 *
 *     UnauthorizedError:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Unauthorized: Invalid or missing token."
 *
 *     ForbiddenError:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Forbidden: You do not have permission to access this resource."
 *
 *     NotFoundError:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Resource not found."
 *
 *   parameters:
 *     PatientIdParam:
 *       in: path
 *       name: patientId
 *       required: true
 *       schema:
 *         type: string
 *       description: MongoDB ObjectId of the patient
 *       example: "664f1c2e8b1a2c3d4e5f6a7b"
 *
 *     IdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: MongoDB ObjectId
 *       example: "664f1c2e8b1a2c3d4e5f6a7b"
 *
 *     DoctorIdParam:
 *       in: path
 *       name: doctorId
 *       required: true
 *       schema:
 *         type: string
 *       description: MongoDB ObjectId of the doctor
 *       example: "664f1c2e8b1a2c3d4e5f6a7d"
 *
 *     StaffIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: MongoDB ObjectId of the staff member
 *       example: "664f1c2e8b1a2c3d4e5f6a7c"
 *
 *     SearchQuery:
 *       in: query
 *       name: search
 *       required: false
 *       schema:
 *         type: string
 *       description: Search by name or email
 *       example: "Mary"
 *
 *     PageQuery:
 *       in: query
 *       name: page
 *       required: false
 *       schema:
 *         type: integer
 *         default: 1
 *         minimum: 1
 *       description: Page number for pagination
 *       example: 1
 *
 *     LimitQuery:
 *       in: query
 *       name: limit
 *       required: false
 *       schema:
 *         type: integer
 *         default: 10
 *         minimum: 1
 *         maximum: 100
 *       description: Number of results per page
 *       example: 10
 */
