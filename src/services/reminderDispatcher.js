// src/services/reminderDispatcher.js
// Responsible for creating a Notification record and sending it
// through the configured notification channels.

const Notification = require('../models/Notification');
const { createAndEmit } = require('./notificationService');

/**
 * Dispatch a single medication reminder.
 * - Persists a Notification row for auditing/history.
 * - Sends the reminder via configured notification channels (default: in_app).
 */
exports.dispatch = async (reminder) => {
  const title = `Medication Reminder: ${reminder.medicationName}`;
  const body =
    reminder.instructions ||
    (reminder.dosage ? `Please take ${reminder.dosage}` : 'Please take your medication');

  // Who should receive this notification?
  // → The user (nurse/caretaker) who created this reminder.
  const targetUserId = reminder.createdBy;
  if (!targetUserId) {
    console.warn('[dispatcher] reminder has no createdBy, skipping:', String(reminder._id));
    return { ok: false, reason: 'no createdBy' };
  }

  // Persist a Notification record (for auditing, listing, or history).
  await Notification.create({
    userId: targetUserId,     // Ensure this matches the Notification model field name
    title,
    message: body,
    meta: {
      reminderId: reminder._id,
      entryReportId: reminder.entryReport
    }
  });

  // Deliver the notification via configured channels (default: in_app).
  const channels = reminder.notifyChannels?.length ? reminder.notifyChannels : ['in_app'];
  for (const ch of channels) {
    try {
      // Currently createAndEmit handles in_app delivery (socket, etc).
      // If extended, different channels (email, SMS, push) can be plugged here.
      await createAndEmit(String(targetUserId), title, body);
    } catch (err) {
      console.warn('[dispatcher] channel failed:', ch, err.message);
    }
  }

  return { ok: true };
};
