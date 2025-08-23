// controllers/reminderController.js
const Reminder = require('../models/Reminder');
const DeliveryAttempt = require('../models/DeliveryAttempt');
const { sendMedicationAlert } = require('../utils/notifications'); 
const { RRule } = require('rrule'); // npm i rrule

function computeNextFireAt({ schedule, timezone, fromDateUtc = new Date() }) {
  if (schedule.type === 'ONE_OFF') return schedule.startAt;
  const rule = RRule.fromString(schedule.rrule);
  rule.options.dtstart = new Date(schedule.startAt);
  const next = rule.after(fromDateUtc, true);
  return next || null;
}

exports.create = async (req, res) => {
  const body = req.body;
  if (!body.patientId || !body.medicationId || !body.dosage || !body.channels || !body.timezone || !body.schedule)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'missing fields' } });

  const nextFireAt = computeNextFireAt({ schedule: body.schedule, timezone: body.timezone });
  const doc = await Reminder.create({
    ...body,
    nextFireAt,
    status: 'ACTIVE',
    createdBy: req.user?._id
  });
  return res.status(201).json(doc);
};

exports.getById = async (req, res) => {
  const doc = await Reminder.findById(req.params.id);
  if (!doc) return res.sendStatus(404);
  res.json(doc);
};

exports.update = async (req, res) => {
  const patch = { ...req.body };
  if (patch.schedule || patch.timezone) {
    const current = await Reminder.findById(req.params.id);
    if (!current) return res.sendStatus(404);
    const schedule = patch.schedule || current.schedule;
    const timezone = patch.timezone || current.timezone;
    patch.nextFireAt = computeNextFireAt({ schedule, timezone, fromDateUtc: new Date() });
  }
  const doc = await Reminder.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!doc) return res.sendStatus(404);
  res.json(doc);
};

exports.cancel = async (req, res) => {
  const doc = await Reminder.findByIdAndUpdate(req.params.id, { status: 'CANCELLED', nextFireAt: null });
  if (!doc) return res.sendStatus(404);
  res.sendStatus(204);
};

exports.listByPatient = async (req, res) => {
  const { status, from, to, page = 1, pageSize = 20 } = req.query;
  const q = { patientId: req.params.patientId };
  if (status) q.status = status;
  if (from || to) q.nextFireAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };

  const [items, total] = await Promise.all([
    Reminder.find(q).sort({ nextFireAt: 1 }).skip((page - 1) * pageSize).limit(+pageSize),
    Reminder.countDocuments(q)
  ]);
  res.json({ items, page: +page, pageSize: +pageSize, total });
};

exports.listAttempts = async (req, res) => {
  const rows = await DeliveryAttempt.find({ reminderId: req.params.id }).sort({ createdAt: -1 });
  res.json(rows);
};

exports.triggerNow = async (req, res) => {
  const reminder = await Reminder.findById(req.params.id);
  if (!reminder) return res.sendStatus(404);
  const result = await sendMedicationAlert(reminder); 
  res.json(result);
};
