const { checkShiftReminders } = require('./shiftReminderService');

const CHECK_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

function startShiftReminderScheduler() {
  console.log('Shift reminder scheduler started.');

  // Run once when the server starts
  checkShiftReminders().catch((error) => {
    console.error('Shift reminder check failed:', error.message);
  });

  // Run every 3 hours
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