# Guardian Backend - Database Relationship Model

## Overview

The Guardian Backend system manages elderly care through a structured relationship model with four core entities: **Roles**, **Users**, **Patients**, and **Entry Reports**. This document outlines the relationships, constraints, and business rules governing these entities.

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Role     │──────▶│    User     │──────▶│   Patient   │──────▶│ EntryReport │
│             │ 1:N   │             │ 1:N   │             │ 1:N   │             │
│ - _id       │       │ - _id       │       │ - _id       │       │ - _id       │
│ - name      │       │ - fullname  │       │ - fullname  │       │ - patient   │
└─────────────┘       │ - email     │       │ - caretaker │       │ - nurse     │
                      │ - role      │       │ - nurses[]  │       │ - activity  │
                      └─────────────┘       └─────────────┘       └─────────────┘
```

## Core Entities

### 1. Role
**Purpose**: Defines user permissions and access levels
- **Fields**: `_id`, `name`
- **Types**: `admin`, `nurse`, `caretaker`
- **Relationships**: One-to-Many with Users

### 2. User
**Purpose**: System users with specific roles and responsibilities
- **Fields**: `_id`, `fullname`, `email`, `password_hash`, `role`, `assignedPatients[]`
- **Relationships**: 
  - Many-to-One with Role
  - One-to-Many with Patients (as caretaker)
  - Many-to-Many with Patients (as assigned nurses)
  - One-to-Many with EntryReports (as nurse)

### 3. Patient
**Purpose**: Elderly individuals receiving care
- **Fields**: `_id`, `fullname`, `dateOfBirth`, `gender`, `caretaker`, `assignedNurses[]`, `healthConditions[]`
- **Relationships**:
  - Many-to-One with User (caretaker)
  - Many-to-Many with Users (assigned nurses)
  - One-to-Many with EntryReports

### 4. EntryReport
**Purpose**: Daily activity logs and care documentation
- **Fields**: `_id`, `patient`, `nurse`, `activityType`, `comment`, `activityTimestamp`
- **Relationships**:
  - Many-to-One with Patient
  - Many-to-One with User (nurse)

## Relationship Rules & Constraints

### Role-User Relationship (1:N)
- **Rule**: Every user must have exactly one role
- **Constraint**: Role must exist before user creation
- **Validation**: Pre-save hooks validate role existence

### User-Patient Relationships

#### Caretaker Assignment (1:N)
- **Rule**: Each patient must have exactly one caretaker
- **Constraint**: Caretaker must have 'caretaker' role
- **Business Logic**: Caretakers are typically family members or primary caregivers

#### Nurse Assignment (M:N)
- **Rule**: Patients can have multiple assigned nurses
- **Constraint**: All assigned users must have 'nurse' role
- **Business Logic**: Nurses provide professional medical care

### Patient-EntryReport Relationship (1:N)
- **Rule**: Each report belongs to exactly one patient
- **Constraint**: Patient must exist and nurse must be assigned to patient
- **Validation**: Nurse assignment verified before report creation

## Data Integrity Safeguards

### Referential Integrity
1. **Cascade Prevention**: Users cannot be deleted if assigned to patients
2. **Orphan Prevention**: Patients cannot be deleted if they have entry reports
3. **Role Validation**: User roles validated on creation and updates

### Business Rule Enforcement
1. **Age Validation**: Patients must be 18+ years old
2. **Date Validation**: Birth dates and activity timestamps cannot be in future
3. **Assignment Validation**: Only nurses can create reports for their assigned patients
4. **Caregiver Requirement**: Patients must have at least one caretaker or nurse

### Pre-save Validations
```javascript
// Patient validation example
PatientSchema.pre('save', async function (next) {
  // Validate caretaker exists and has correct role
  await assertUsersHaveRole([this.caretaker], 'caretaker');
  
  // Validate assigned nurses have correct roles
  await assertUsersHaveRole(this.assignedNurses, 'nurse');
  
  // Validate age requirements
  validatePatientAge(this.dateOfBirth);
});
```

## Query Patterns

### Common Relationship Queries

#### Get Patient with Caregivers
```javascript
const patient = await Patient.findById(patientId)
  .populate('caretaker', 'fullname email')
  .populate('assignedNurses', 'fullname email');
```

#### Get User's Assigned Patients
```javascript
const patients = await Patient.find({
  $or: [
    { caretaker: userId },
    { assignedNurses: userId }
  ]
}).populate('caretaker assignedNurses');
```

#### Get Patient's Recent Reports
```javascript
const reports = await EntryReport.find({ patient: patientId })
  .populate('nurse', 'fullname')
  .sort({ activityTimestamp: -1 })
  .limit(10);
```

## Database Seeding Strategy

The system uses a structured seeding approach:

1. **Roles**: Create system roles (admin, nurse, caretaker)
2. **Users**: Create users with proper role assignments
3. **Patients**: Create patients with valid caretaker/nurse assignments
4. **Reports**: Generate sample activity reports with proper relationships

### Seeding Validation
- Validates all relationships before creation
- Ensures referential integrity
- Provides rollback capability for failed operations

## Performance Considerations

### Indexing Strategy
```javascript
// EntryReport indexes for common queries
EntryReportSchema.index({ patient: 1, activityTimestamp: -1 });
EntryReportSchema.index({ nurse: 1, createdAt: -1 });

// User indexes for authentication and lookups
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
```

### Query Optimization
- Use population selectively to avoid over-fetching
- Implement pagination for large result sets
- Cache frequently accessed role mappings

## Error Handling

### Relationship Validation Errors
- **Missing References**: Clear error messages for invalid IDs
- **Role Mismatches**: Specific errors for incorrect user roles
- **Constraint Violations**: Detailed messages for business rule violations

### Example Error Messages
```javascript
"User references not found: 507f1f77bcf86cd799439011"
"Users do not have required role 'nurse': John Doe (507f1f77bcf86cd799439012)"
"Cannot delete patient: 5 entry reports depend on this patient"
```

## Migration Considerations

### Schema Evolution
- Use Mongoose schema versioning for major changes
- Implement data migration scripts for relationship updates
- Maintain backward compatibility during transitions

### Relationship Updates
- Batch operations for large-scale relationship changes
- Validation of data integrity after migrations
- Rollback procedures for failed migrations

## Security Implications

### Access Control
- Role-based access to patient data
- Nurse-patient assignment verification for report access
- Caretaker permissions for patient management

### Data Privacy
- Sensitive patient information protected by relationship constraints
- Audit trails through EntryReport relationships
- User activity tracking through relationship queries