/**
 * Comprehensive validation utilities to prevent orphan records
 * and ensure data integrity across the application
 */

const mongoose = require('mongoose');
const Role = require('../models/Role');
const User = require('../models/User');
const Patient = require('../models/Patient');
const EntryReport = require('../models/EntryReport');

class ValidationService {
  /**
   * Validate that a user exists and has the required role
   */
  static async validateUserRole(userId, requiredRole) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }

    const user = await User.findById(userId).populate('role', 'name');
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    if (!user.role) {
      throw new Error(`User ${user.fullname} has no role assigned`);
    }

    if (user.role.name !== requiredRole) {
      throw new Error(`User ${user.fullname} has role '${user.role.name}', expected '${requiredRole}'`);
    }

    return user;
  }

  /**
   * Validate that multiple users exist and have the required role
   */
  static async validateUsersRole(userIds, requiredRole) {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    const validUsers = [];
    for (const userId of userIds) {
      const user = await this.validateUserRole(userId, requiredRole);
      validUsers.push(user);
    }

    return validUsers;
  }

  /**
   * Validate patient assignment rules
   */
  static async validatePatientAssignment(patientData) {
    const { caretaker, assignedNurses } = patientData;
    
    const hasCaretaker = !!caretaker;
    const hasNurses = Array.isArray(assignedNurses) && assignedNurses.length > 0;

    if (!hasCaretaker && !hasNurses) {
      throw new Error('Patient must have at least one caretaker or nurse assigned');
    }

    // Validate caretaker
    if (hasCaretaker) {
      await this.validateUserRole(caretaker, 'caretaker');
    }

    // Validate nurses
    if (hasNurses) {
      await this.validateUsersRole(assignedNurses, 'nurse');
    }

    return true;
  }

  /**
   * Validate entry report creation
   */
  static async validateEntryReport(reportData) {
    const { patient, nurse, activityTimestamp } = reportData;

    // Validate patient exists
    if (!patient || !mongoose.Types.ObjectId.isValid(patient)) {
      throw new Error('Valid patient ID is required');
    }

    const patientDoc = await Patient.findById(patient);
    if (!patientDoc) {
      throw new Error(`Patient not found: ${patient}`);
    }

    // Validate nurse exists and has nurse role
    const nurseDoc = await this.validateUserRole(nurse, 'nurse');

    // Validate nurse is assigned to this patient
    const isAssigned = patientDoc.assignedNurses.some(assignedNurse => 
      assignedNurse.toString() === nurse.toString()
    );

    if (!isAssigned) {
      throw new Error(`Nurse ${nurseDoc.fullname} is not assigned to patient ${patientDoc.fullname}`);
    }

    // Validate timestamp
    if (activityTimestamp) {
      if (activityTimestamp > new Date()) {
        throw new Error('Activity timestamp cannot be in the future');
      }

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (activityTimestamp < oneYearAgo) {
        throw new Error('Activity timestamp cannot be more than 1 year old');
      }
    }

    return { patient: patientDoc, nurse: nurseDoc };
  }

  /**
   * Check for orphan records in the database
   */
  static async findOrphanRecords() {
    const orphans = {
      users: [],
      patients: [],
      reports: []
    };

    // Find users without valid roles
    const usersWithoutRoles = await User.find({ role: { $exists: false } });
    const usersWithInvalidRoles = await User.find({}).populate('role').then(users =>
      users.filter(user => user.role && !['admin', 'nurse', 'caretaker'].includes(user.role.name))
    );

    orphans.users = [...usersWithoutRoles, ...usersWithInvalidRoles];

    // Find patients without proper caregivers
    const patientsWithoutCaregivers = await Patient.find({
      $and: [
        { $or: [{ caretaker: { $exists: false } }, { caretaker: null }] },
        { $or: [{ assignedNurses: { $exists: false } }, { assignedNurses: { $size: 0 } }] }
      ]
    });

    // Find patients with invalid caretaker references
    const patientsWithInvalidCaretakers = await Patient.find({
      caretaker: { $exists: true, $ne: null }
    }).populate('caretaker').then(patients =>
      patients.filter(patient => !patient.caretaker)
    );

    // Find patients with invalid nurse references
    const patientsWithInvalidNurses = await Patient.find({
      assignedNurses: { $exists: true, $not: { $size: 0 } }
    }).populate('assignedNurses').then(patients =>
      patients.filter(patient => 
        patient.assignedNurses.some(nurse => !nurse)
      )
    );

    orphans.patients = [
      ...patientsWithoutCaregivers,
      ...patientsWithInvalidCaretakers,
      ...patientsWithInvalidNurses
    ];

    // Find reports with invalid references
    const reportsWithInvalidPatients = await EntryReport.find({}).populate('patient').then(reports =>
      reports.filter(report => !report.patient)
    );

    const reportsWithInvalidNurses = await EntryReport.find({}).populate('nurse').then(reports =>
      reports.filter(report => !report.nurse)
    );

    orphans.reports = [...reportsWithInvalidPatients, ...reportsWithInvalidNurses];

    return orphans;
  }

  /**
   * Clean up orphan records (use with caution)
   */
  static async cleanupOrphanRecords(dryRun = true) {
    const orphans = await this.findOrphanRecords();
    const cleanup = {
      users: 0,
      patients: 0,
      reports: 0
    };

    if (!dryRun) {
      // Remove users without valid roles
      if (orphans.users.length > 0) {
        const userIds = orphans.users.map(user => user._id);
        await User.deleteMany({ _id: { $in: userIds } });
        cleanup.users = orphans.users.length;
      }

      // Remove patients without proper caregivers
      if (orphans.patients.length > 0) {
        const patientIds = orphans.patients.map(patient => patient._id);
        await Patient.deleteMany({ _id: { $in: patientIds } });
        cleanup.patients = orphans.patients.length;
      }

      // Remove reports with invalid references
      if (orphans.reports.length > 0) {
        const reportIds = orphans.reports.map(report => report._id);
        await EntryReport.deleteMany({ _id: { $in: reportIds } });
        cleanup.reports = orphans.reports.length;
      }
    }

    return {
      found: {
        users: orphans.users.length,
        patients: orphans.patients.length,
        reports: orphans.reports.length
      },
      cleaned: cleanup,
      dryRun
    };
  }

  /**
   * Validate database integrity
   */
  static async validateDatabaseIntegrity() {
    const issues = [];

    // Check for required roles
    const requiredRoles = ['admin', 'nurse', 'caretaker'];
    const existingRoles = await Role.find({}).select('name');
    const existingRoleNames = existingRoles.map(r => r.name);
    const missingRoles = requiredRoles.filter(role => !existingRoleNames.includes(role));

    if (missingRoles.length > 0) {
      issues.push({
        type: 'MISSING_ROLES',
        severity: 'CRITICAL',
        message: `Missing required roles: ${missingRoles.join(', ')}`,
        count: missingRoles.length
      });
    }

    // Check for orphan records
    const orphans = await this.findOrphanRecords();

    if (orphans.users.length > 0) {
      issues.push({
        type: 'ORPHAN_USERS',
        severity: 'ERROR',
        message: `Users without valid roles: ${orphans.users.length}`,
        count: orphans.users.length
      });
    }

    if (orphans.patients.length > 0) {
      issues.push({
        type: 'ORPHAN_PATIENTS',
        severity: 'CRITICAL',
        message: `Patients without proper caregivers: ${orphans.patients.length}`,
        count: orphans.patients.length
      });
    }

    if (orphans.reports.length > 0) {
      issues.push({
        type: 'ORPHAN_REPORTS',
        severity: 'ERROR',
        message: `Reports with invalid references: ${orphans.reports.length}`,
        count: orphans.reports.length
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
      summary: {
        total: issues.length,
        critical: issues.filter(i => i.severity === 'CRITICAL').length,
        errors: issues.filter(i => i.severity === 'ERROR').length,
        warnings: issues.filter(i => i.severity === 'WARNING').length
      }
    };
  }
}

module.exports = ValidationService;