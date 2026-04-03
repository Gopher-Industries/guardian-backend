// src/services/notifyRules.js]

const { createAndEmit } = require('./notificationService'); 
const Task = require('../models/Task'); // used only in getTaskPatientId (optional convenience)
const Patient = require('../models/Patient');

// --- small utilities ---
const toId = v => (v && typeof v === 'object' && v._id ? String(v._id) : v ? String(v) : null);

async function safeNotify(userId, title, message) {
  try {
    if (!userId) return;
    await createAndEmit(toId(userId), title, message);
  } catch (_) {
    // swallow: notifications are best-effort and must not affect main flow
  }
}

// --- SUPPORT TICKETS ---

/**
 * Called after a support ticket is created.
 * Notifies the ticket owner (creator). Optionally the actor too.
 */
async function supportTicketCreated({ ticketId, userId, actorId }) {
  const title = 'Support ticket created';
  const msgForOwner = `Your support ticket (${ticketId}) has been created.`;
  await safeNotify(userId, title, msgForOwner);

  if (actorId && toId(actorId) !== toId(userId)) {
    await safeNotify(actorId, 'Ticket created', `You created ticket (${ticketId}).`);
  }
}

/**
 * Called after a support ticket is updated.
 * Notifies the ticket owner about the new status / update.
 */
async function supportTicketUpdated({ ticketId, userId, status, actorId }) {
  const title = 'Support ticket updated';
  const msgForOwner = `Your ticket (${ticketId}) was updated${status ? `: ${status}` : ''}.`;
  await safeNotify(userId, title, msgForOwner);

  if (actorId && toId(actorId) !== toId(userId)) {
    await safeNotify(actorId, 'Ticket updated', `You updated ticket (${ticketId}).`);
  }
}

// --- TASKS ---


async function getTaskPatientId(taskId) {
  try {
    const t = await Task.findById(taskId).lean();
    return t ? toId(t.patient || t.patientId || t.patient_id) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Called after task creation.
 * Notifies the assignee; optionally also the actor.
 */
async function taskCreated({ taskId, patientId, assignedTo, dueDate, actorId }) {
  const title = 'New task assigned';
  const patient = await Patient.findById(patientId).select('fullname').lean()
  const msgForAssignee = `A new task was created ${patient ? ` for ${patient.fullname}` : ''}${
    dueDate ? `, due ${new Date(dueDate).toDateString()}` : ''
  }.`;
  await safeNotify(assignedTo, title, msgForAssignee);

  if (actorId && toId(actorId) !== toId(assignedTo)) {
    await safeNotify(actorId, 'Task created', `You created task (${taskId}).`);
  }
}

/**
 * Called after task update.
 * Notifies the current assignee about the change; optionally also the actor.
 */
async function taskUpdated({ taskId, patientId, assignedTo, status, dueDate, actorId }) {
  const title = 'Task updated';
  const patient = await Patient.findById(patientId).select('fullname').lean()
  const details = [
    patientId ? `patient: ${patient.fullname}` : null,
    status ? `status: ${status}` : null,
    dueDate ? `due: ${new Date(dueDate).toDateString()}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const msgForAssignee = `Task (${taskId}) was updated ${details ? ` (${details})` : ''}.`;

  await safeNotify(assignedTo, title, msgForAssignee);

  if (actorId && toId(actorId) !== toId(assignedTo)) {
    await safeNotify(actorId, 'Task updated', `You updated task (${taskId}).`);
  }
}

/**
 * Called after task deletion.
 * Notifies the last known assignee; optionally also the actor.
 */
async function taskDeleted({ taskId, patientId, assignedTo, actorId }) {
  const title = 'Task removed';
  const patient = await Patient.findById(patientId).select('fullname').lean()
  const msgForAssignee = `Task (${taskId}) was deleted${patient ? ` for ${patient.fullname}` : ''}.`;
  await safeNotify(assignedTo, title, msgForAssignee);

  if (actorId && toId(actorId) !== toId(assignedTo)) {
    await safeNotify(actorId, 'Task removed', `You deleted task (${taskId}).`);
  }
}
// Make sure at top of notifyRules.js:
// const Patient = require('../models/Patient');

async function patientCreated({ patientId, actorId, caretakerId }) {
  const title = 'Patient added';
  let name = String(patientId);
  let dobStr = null;

  try {
    const p = await Patient.findById(patientId)
      .select('fullname dateOfBirth')
      .lean();

    if (p?.fullname) name = p.fullname;
    if (p?.dateOfBirth) {
      const d = new Date(p.dateOfBirth);
      if (!isNaN(d)) dobStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
  } catch (_) {
    // ignore lookup errors; still send a notification
  }

  const msg = `Patient ${name}${dobStr ? ` (DOB: ${dobStr})` : ''} has been added.`;
  const target = caretakerId || actorId; // prefer explicit caretaker, fallback to actor
  await safeNotify(target, title, msg);
}

async function prescriptionCreated({ prescriptionId, patientId }) {
  try {
    const patient = await Patient.findById(patientId).select('caretaker fullname').lean();
    if (!patient) return;

    const title = 'New prescription created';
    const msg = `A new prescription has been created for patient ${patient.fullname}.`;
    await safeNotify(patient.caretaker, title, msg);
  } catch (_) {}
}

module.exports = {
  // Support tickets
  supportTicketCreated,
  supportTicketUpdated,

  // Tasks
  taskCreated,
  taskUpdated,
  taskDeleted,
  patientCreated,

  // Optional utility
  getTaskPatientId,

  // Prescriptions
  prescriptionCreated,

};
