const Roster = require('../models/Roster');
const { sendTemplatedEmail } = require('./emailService');

async function getUpcomingShifts() {
  return await Roster.find({
    assignedStaff: { $ne: null }
  }).populate('assignedStaff', 'fullname email');
}

function shouldSendReminder(shift) {
  if (shift.reminderSentAt) {
    return false;
  }

  const now = new Date();
  const shiftStart = new Date(`${shift.date}T${shift.startTime}:00`);
  const hoursUntilShift = (shiftStart - now) / (1000 * 60 * 60);

  return hoursUntilShift > 0 && hoursUntilShift <= 48;
}

async function sendShiftReminder(shift) {
  if (!shift.assignedStaff || !shift.assignedStaff.email) {
    return;
  }

  await sendTemplatedEmail('shift-reminder', {
    to: shift.assignedStaff.email,
    name: shift.assignedStaff.fullname,
    shiftStart: `${shift.date}T${shift.startTime}:00`,
    shiftEnd: `${shift.date}T${shift.endTime}:00`,
    location: shift.location
  });
}

async function markReminderSent(shift) {
  shift.reminderSentAt = new Date();
  await shift.save();
}

async function checkShiftReminders() {
  const shifts = await getUpcomingShifts();

  for (const shift of shifts) {
    try {
      if (!shouldSendReminder(shift)) {
        continue;
      }

      await sendShiftReminder(shift);
      await markReminderSent(shift);

      console.log(
        `Shift reminder sent to ${shift.assignedStaff.email} for shift ${shift.shiftId}`
      );
    } catch (error) {
      console.error(
        `Failed to send reminder for shift ${shift.shiftId}: ${error.message}`
      );
    }
  }
}

module.exports = {
  checkShiftReminders
};