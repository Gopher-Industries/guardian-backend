const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  ahpra: Joi.string().pattern(/^\d{10}$/).required(),// an API exists, but is very expensive to use
  role: Joi.string()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

// Medication record validation
const medicationRecordSchema = Joi.object({
  medicationRecord: Joi.object({
    allergies: Joi.string().required(),
    drugName: Joi.string().required(),
    dose: Joi.number().required(),
    frequency: Joi.string().required(),
    duration: Joi.string().required(),
    indication: Joi.string().required()
  }).required()
});

// Lab test record validation
const labTestRecordSchema = Joi.object({
  labTestRecord: Joi.object().required()
});

const validationMiddleware = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
};


module.exports = {
  registerSchema,
  loginSchema,
  medicationRecordSchema,
  labTestRecordSchema,
  validationMiddleware,
};
