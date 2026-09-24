const Joi = require('joi');

const registerSchema = Joi.object({
  fullname: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string(),

  phone: Joi.string().optional(),
  organizationId: Joi.string().optional(),

  title: Joi.string().optional(),
  surname: Joi.string().optional(),
  firstName: Joi.string().optional(),
  dateOfBirth: Joi.date().optional(),
  primaryContactNumber: Joi.string().optional(),
  medicareProviderNumber: Joi.string().optional(),

  // Payroll fields
  taxFileNumber: Joi.string().optional(),
  superannuationFundName: Joi.string().optional(),
  superMemberNumber: Joi.string().optional(),
  bankAccountName: Joi.string().optional(),
  accountNumber: Joi.string().optional(),
  bsb: Joi.string().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
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
  validationMiddleware,
};
