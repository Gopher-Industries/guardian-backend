'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { Schema, Types } = mongoose;
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


//value arrays for enum fields
const BIRTH_SEX_VALUES = ['Male', 'Female', 'Other'];
const GENDER_IDENTITY_VALUES = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];
const PRONOUN_VALUES = ['He/Him', 'She/Her', 'They/Them', 'Other', 'Prefer not to say'];
const ETHNICITY_VALUES = ['Australian, non-Aboriginal','Aboriginal', 'Torres Strait Islander', 'Both Aboriginal and Torres Strait Islander', 'Other'];
const COUNTRY_OF_BIRTH_VALUES = ['Australia', 'New Zealand', 'United Kingdom', 'United States', 'China', 'India', 'Malaysia', 'Philippines', 'Vietnam', 'Other'];
const PREFERRED_LANGUAGE_VALUES = ['English', 'Mandarin', 'Arabic', 'Cantonese', 'Vietnamese', 'Italian', 'Greek', 'Croatian', 'Spanish', 'Hindi', 'Farsi', 'Punjabi', 'Tagalog', 'Burmese', 'Nepali', 'Other'];
const CONTACT_VIA_VALUES = ['homePhone', 'mobilePhone', 'workPhone'];
const PENSION_CARD_TYPE_VALUES = ['Concession', 'Healthcare Card', 'Pension Card'];
const USUAL_ACCOUNT_VALUES = ['Patient Fee', 'Concession Fee', 'Medicare', 'DVA', 'Private Health Insurance', 'Other'];



const patientSchema = new Schema(
  {
    // uuid for external reference (not just mongo id)
    uuid: {
      type: String,
      default: randomUUID,
      unique: true,
      index: true,
      required: true,
      immutable: true,
    },

    // patient identity fields
    title: { type: String, trim: true },//need to define ENUM or replace with String
    firstName: { type: String, required: true, trim: true, index: true },
    lastName: { type: String, required: true, trim: true, index: true },
    middleName: { type: String, trim: true },
    preferredName: { type: String, trim: true },
    dateOfBirth: { type: Date, required: true },
    birthSex: { type: String, required: true, enum: BIRTH_SEX_VALUES },
    genderIdentity: { type: String, enum: GENDER_IDENTITY_VALUES },
    pronouns: { type: String, trim: true, enum: PRONOUN_VALUES },
    ethnicity: { type: String, trim: true, enum: ETHNICITY_VALUES },
    countryOfBirth: { type: String, trim: true, enum: COUNTRY_OF_BIRTH_VALUES },
    preferredLanguage: { type: String, trim: true, enum: PREFERRED_LANGUAGE_VALUES },
    interpreterRequired: { type: Boolean, default: false },



    // contact info
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    cityOrSuburb: { type: String, trim: true },
    postCode: { type: String, trim: true },
    homePhone: { type: String, trim: true },
    mobilePhone: { type: String, trim: true },
    workPhone: { type: String, trim: true },
    contactVia: { type: String, enum: CONTACT_VIA_VALUES },//get enum to show just the names of the fields above, not the actual values
    email: { type: String, trim: true },

    //consents
    optOutofDeidentifiedDataSharing: { type: Boolean, default: false },
    updateAddressOfAllFamilyMembers: { type: Boolean, default: false },

    //medicare and health identifiers
    healthIdentifier: { type: String, trim: true },
    medicareNumber: { type: String, trim: true },
    irn: { type: String, trim: true },
    expiryDate: { type: Date },//needs to be valid when only using month and year, but not day. Need to check if this is possible with mongoose date type
    pensionHccNumber: { type: String, trim: true },
    pensionCardType: { type: String, enum: PENSION_CARD_TYPE_VALUES },
    dvaNumber: { type: String, trim: true },
    usualGP: { type: String, trim: true },//enum to be defined based on Org doctors
    usualGPID: { type: Schema.Types.ObjectId, ref: 'User', set: extractId },//id of doctor based on usualGP enum
    registeredLocation: { type: String, trim: true },//enum to be defined based on locations could probably be a front end task
    registeredLocationID: { type: Schema.Types.ObjectId, ref: 'Location', set: extractId },//id of location based on registeredLocation enum

    //clinical/admin details
    usualAccount: { type: String, enum: USUAL_ACCOUNT_VALUES },//verify enum values
    healthInsuranceProvider: { type: String, trim: true },
    healthInsuranceNumber: { type: String, trim: true },
    healthInsuranceExpiryDate: { type: Date },
    religion: { type: String, trim: true },
    headOfFamily: { type: String, trim: true },
    nextOfKin: { type: String, trim: true },
    nextOfKinRelationship: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    occupation: { type: String, trim: true },

    //status/flags
    isActive: { type: Boolean, default: true },
    isDeceased: { type: Boolean, default: false },
    dateOfDeath: { type: Date },
    causeOfDeath: { type: String, trim: true },
    
    //admin fields
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },

    //General and Appointment Notes
    //generalNotes: sits on patient file to record general notes about the patient, visible to all staff
    //appointmentNotes: sits on patient file to record notes about the patient that are specific to appointments, 
    //  visible to all staff, creates popup when booking an appointment for the patient? need to discuss with chehul
    generalNotes: { type: String, trim: true },
    appointmentNotes: { type: String, trim: true },


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

    // medical info
    allergies: [{ type: String }],
    conditions: [{ type: String }],

    // soft delete fields
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
);

//need to validate array of doctors based on org or location doctors, need to discuss with chehul and sam
// pre-validate → clean ids before mongo cast
patientSchema.pre('validate', function (next) {
  this.organization = extractId(this.organization);
  //if (Array.isArray(this.assignedNurses)) this.assignedNurses = this.assignedNurses.map(extractId);
  this.assignedDoctor = extractId(this.assignedDoctor);
  next();
});

// common query index
patientSchema.index({ organization: 1, isDeleted: 1, created_at: -1 });
patientSchema.index({ assignedDoctor: 1 });

// virtual age calc
patientSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  let age = today.getFullYear() - this.dateOfBirth.getFullYear();
  const m = today.getMonth() - this.dateOfBirth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < this.dateOfBirth.getDate())) age--;
  return age;
});

// pre-save checks → set orgName + validate doctor
patientSchema.pre('save', async function preSave(next) {
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
patientSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    return ret;
  },
});

module.exports = mongoose.model('Patient', patientSchema);
