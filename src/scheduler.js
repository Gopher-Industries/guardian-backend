const cron = require('node-cron');
const { sendAppointmentReminders } = require('./services/appointmentReminderService');

function startScheduler() {
  // Runs every day at 8:00 AM server time
  cron.schedule('0 8 * * *', async () => {
    console.log('Running scheduled appointment reminder job...');
    try {
      const results = await sendAppointmentReminders();
      console.log(`Appointment reminders processed: ${results.length}`, results);
    } catch (error) {
      console.error('Scheduled appointment reminder job failed:', error.message);
    }
  });

  console.log('Appointment reminder scheduler started (daily at 8:00 AM).');
}

module.exports = { startScheduler };
