const mongoose = require('mongoose');
const MedicalRecord = require('../models/MedicalRecord');
const { sendByOption } = require('./emailService');

function getTomorrowRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 0, 0, 0));
  return { start, end };
}

async function sendAppointmentReminders() {
  const User = mongoose.model('User');
  const { start, end } = getTomorrowRange();

  const appointments = await MedicalRecord.find({
    appointmentDateTime: { $gte: start, $lt: end },
    status: 'booked'
  }).populate('patient').populate('doctor', 'fullname');

  const results = [];

  for (const appt of appointments) {
    const patient = appt.patient;

    if (!patient || !patient.caretaker) {
      results.push({ appointmentId: appt._id, status: 'skipped', reason: 'No caretaker on file' });
      continue;
    }

    const caretaker = await User.findById(patient.caretaker);

    if (!caretaker || !caretaker.email) {
      results.push({ appointmentId: appt._id, status: 'skipped', reason: 'Caretaker has no email' });
      continue;
    }

    try {
      await sendByOption('appointment-reminder', caretaker.email, {
        name: caretaker.fullname,
        clinician: appt.doctor ? appt.doctor.fullname : undefined,
        when: appt.appointmentDateTime.toISOString(),
        location: [appt.clinic, appt.room, appt.location].filter(Boolean).join(', ')
      });
      results.push({ appointmentId: appt._id, status: 'sent', to: caretaker.email });
    } catch (error) {
      results.push({ appointmentId: appt._id, status: 'failed', error: error.message });
    }
  }

  return results;
}

module.exports = { sendAppointmentReminders };
