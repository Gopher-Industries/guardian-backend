'use strict';

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;
const { v4: uuidv4 } = require('uuid');
const User = require('./User');
const Organization = require('./Organization');

/* helper → cleanly pull ObjectId from strings/docs/hex */
function extractId(input) {
  if (input == null) return input;

  // if already valid ObjectId (string or ObjectId)
  if (Types.ObjectId.isValid(input) && String(input).length === 24) return String(input);

  // if mongoose doc
  if (typeof input === 'object') {
    const candidate = input._id ?? input.id;
    if (candidate && Types.ObjectId.isValid(String(candidate))) return String(candidate);
  }

  // if string like ObjectId("...") or bare hex
  if (typeof input === 'string') {
    const m = input.match(/ObjectId\([\"']([0-9a-fA-F]{24})[\"']\)|([0-9a-fA-F]{24})/);
    const hex = (m && (m[1] || m[2])) ? (m[1] || m[2]) : null;
    if (hex && Types.ObjectId.isValid(hex)) return hex;
  }

  return input; // fallback → let validation handle
}

/* normalize gender inputs */
function normalizeGender(g) {
  if (!g) return g;
  const s = String(g).trim().toLowerCase();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return 'other';
}

const PatientSchema = new Schema(
  {
    // uuid for external reference (not just mongo id)
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
      required: true,
      immutable: true,
    },

    // basic patient info
    fullname: { type: String, required: true, trim: true, index: true },
    gender: { type: String, required: true, enum: ['M', 'F', 'other'], set: normalizeGender },
    dateOfBirth: { type: Date, required: true },

    // org link (and cached name)
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      set: extractId,
      validate: {
        validator: (v) => v == null || Types.ObjectId.isValid(String(v)),
        message: 'Invalid organization ObjectId',
      },
    },
    organizationName: { type: String },

    // caretaker must always exist (role = caretaker)
    caretaker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      set: extractId,
      required: true,
      validate: {
        validator: (v) => v == null || Types.ObjectId.isValid(String(v)),
        message: 'Invalid caretaker ObjectId',
      },
    },

    // nurses (can be multiple)
    assignedNurses: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        set: extractId,
        validate: {
          validator: (v) => v == null || Types.ObjectId.isValid(String(v)),
          message: 'Invalid nurse ObjectId',
        },
      },
    ],

    // doctor (single link)
    assignedDoctor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      set: extractId,
      validate: {
        validator: (v) => v == null || Types.ObjectId.isValid(String(v)),
        message: 'Invalid doctor ObjectId',
      },
    },

    // misc profile info
    profilePhoto: { type: String },
    dateOfAdmitting: { type: Date },
    description: { type: String, default: '' },

    // soft delete fields
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, 
    toJSON: { virtuals: true }, 
    toObject: { virtuals: true } 
  }
);

// pre-validate → clean ids before mongo cast
PatientSchema.pre('validate', function (next) {
  this.organization = extractId(this.organization);
  this.caretaker = extractId(this.caretaker);
  if (Array.isArray(this.assignedNurses)) this.assignedNurses = this.assignedNurses.map(extractId);
  this.assignedDoctor = extractId(this.assignedDoctor);
  next();
});

// common query index
PatientSchema.index({ organization: 1, isDeleted: 1, created_at: -1 });

// virtual age calc
PatientSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  let age = today.getFullYear() - this.dateOfBirth.getFullYear();
  const m = today.getMonth() - this.dateOfBirth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < this.dateOfBirth.getDate())) age--;
  return age;
});

// pre-save checks → set orgName + validate roles
PatientSchema.pre('save', async function preSave(next) {
  try {
    const jobs = [];

    // auto-fill org name if missing
    if (this.organization && !this.organizationName) {
      jobs.push(
        Organization.findById(this.organization).select('name').lean().then((org) => {
          if (org?.name) this.organizationName = org.name;
        })
      );
    }

    // caretaker must have caretaker role
    if (this.caretaker) {
      jobs.push(
        User.findById(this.caretaker).populate('role', 'name').then((u) => {
          if (!u || !u.role || u.role.name !== 'caretaker') {
            throw new Error('Assigned caretaker must have role "caretaker".');
          }
        })
      );
    }

    // all nurses must have nurse role
    if (Array.isArray(this.assignedNurses) && this.assignedNurses.length) {
      jobs.push(
        User.find({ _id: { $in: this.assignedNurses } })
          .populate('role', 'name')
          .then((users) => {
            const invalid = users.filter((u) => !u?.role || u.role.name !== 'nurse');
            if (invalid.length) throw new Error('All assigned nurses must have the role "nurse".');
          })
      );
    }

    // doctor must have doctor role
    if (this.assignedDoctor) {
      jobs.push(
        User.findById(this.assignedDoctor).populate('role', 'name').then((u) => {
          if (!u || !u.role || u.role.name !== 'doctor') {
            throw new Error('Assigned doctor must have role "doctor".');
          }
        })
      );
    }

    await Promise.all(jobs);
    next();
  } catch (err) {
    next(err);
  }
});

// json transform → add `id` field and drop __v
PatientSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    return ret;
  },
});

module.exports = mongoose.model('Patient', PatientSchema);
