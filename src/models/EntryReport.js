const mongoose = require('mongoose');

const EntryReportSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  nurse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activityType: {
    type: String,
    required: true,
    enum: ['wake up', 'meal', 'medication', 'exercise', 'reading', 'meditation', 'sleep', 'therapy', 'social', 'hygiene', 'other']
  },
  comment: {
    type: String,
    maxlength: 1000
  },
  activityTimestamp: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Validation: Ensure patient exists
EntryReportSchema.pre('save', async function (next) {
  try {
    // Validate patient exists
    const Patient = mongoose.model('Patient');
    const patientExists = await Patient.findById(this.patient);
    if (!patientExists) {
      throw new Error(`Invalid patient reference: ${this.patient}`);
    }
    
    // Validate nurse exists and has nurse role
    const User = mongoose.model('User');
    const nurse = await User.findById(this.nurse).populate('role', 'name');
    if (!nurse) {
      throw new Error(`Invalid nurse reference: ${this.nurse}`);
    }
    
    if (!nurse.role || nurse.role.name !== 'nurse') {
      throw new Error(`User ${nurse.fullname} (${this.nurse}) is not a nurse`);
    }
    
    // Validate nurse is assigned to this patient
    if (!patientExists.assignedNurses.includes(this.nurse)) {
      throw new Error(`Nurse ${nurse.fullname} is not assigned to patient ${patientExists.fullname}`);
    }
    
    // Validate activity timestamp is not in the future
    if (this.activityTimestamp > new Date()) {
      throw new Error('Activity timestamp cannot be in the future');
    }
    
    // Validate activity timestamp is not too old (more than 1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (this.activityTimestamp < oneYearAgo) {
      throw new Error('Activity timestamp cannot be more than 1 year old');
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Validation for updates
EntryReportSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    const current = await this.model.findOne(this.getQuery());
    
    if (!current) {
      throw new Error('Entry report not found for update');
    }
    
    // Validate patient if being updated
    if ($set.patient) {
      const Patient = mongoose.model('Patient');
      const patientExists = await Patient.findById($set.patient);
      if (!patientExists) {
        throw new Error(`Invalid patient reference: ${$set.patient}`);
      }
    }
    
    // Validate nurse if being updated
    if ($set.nurse) {
      const User = mongoose.model('User');
      const nurse = await User.findById($set.nurse).populate('role', 'name');
      if (!nurse) {
        throw new Error(`Invalid nurse reference: ${$set.nurse}`);
      }
      
      if (!nurse.role || nurse.role.name !== 'nurse') {
        throw new Error(`User ${nurse.fullname} (${$set.nurse}) is not a nurse`);
      }
    }
    
    // Validate activity timestamp if being updated
    if ($set.activityTimestamp) {
      if ($set.activityTimestamp > new Date()) {
        throw new Error('Activity timestamp cannot be in the future');
      }
      
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if ($set.activityTimestamp < oneYearAgo) {
        throw new Error('Activity timestamp cannot be more than 1 year old');
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Add index for better query performance
EntryReportSchema.index({ patient: 1, activityTimestamp: -1 });
EntryReportSchema.index({ nurse: 1, createdAt: -1 });

const EntryReport = mongoose.model('EntryReport', EntryReportSchema);

module.exports = EntryReport;
