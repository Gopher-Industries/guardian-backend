const { checkShiftReminders } = require('./shiftReminderService');

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function startShiftReminderScheduler() {
  console.log('Shift reminder scheduler started.');

  // Run once when the server starts
  checkShiftReminders().catch((error) => {
    console.error('Shift reminder check failed:', error.message);
  });

  // Run every 5 minutes
  setInterval(async () => {
    try {
      await checkShiftReminders();
    } catch (error) {
      console.error('Shift reminder check failed:', error.message);
    }
  }, CHECK_INTERVAL);
}

module.exports = {
  startShiftReminderScheduler
};