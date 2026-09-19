const path = require('path');
const Alert = require('../models/Alert');
const Task = require('../models/Task');
const User = require('../models/User');
const DailyOperationalReport = require('../models/DailyOperationalReport');
const { saveDailyReportPdf } = require('../utils/dailyReportPdf');

function startOfLocalDay(value) {
  if (value !== undefined && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return null;
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  if (value && reportFileDate(date) !== value) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function reportDateLabel(date) {
  return date.toLocaleDateString('en-AU', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

function dateTimeLabel(date) {
  return date.toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function reportFileDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function staffName(staff) {
  if (!staff) return 'Unassigned';
  return staff.fullname || staff.email || String(staff._id);
}

function percentage(completed, total) {
  return total ? Math.round((completed / total) * 100) : 0;
}

function delta(current, previous) {
  const difference = current - (previous || 0);
  return {
    current,
    previous: previous || 0,
    difference,
    direction: difference === 0 ? 'unchanged' : difference > 0 ? 'up' : 'down'
  };
}

function buildPdfSections({ reportDate, signedOffAt, signoffName, signoffUserId, generalNotes, analytics, metrics, comparison }) {
  const comparisonLines = Object.entries(comparison.coreMetrics).map(([name, values]) =>
    `${name}: ${values.current} (previous ${values.previous}; ${values.difference >= 0 ? '+' : ''}${values.difference})`
  );
  const staffLines = metrics.tasksByStaff.length
    ? metrics.tasksByStaff.map((staff) => `${staff.staffName}: ${staff.completed}/${staff.total} completed (${staff.completionRate}%), ${staff.pending} open`)
    : ['No tasks were due on this date.'];
  const urgentLines = metrics.urgentTasks.length
    ? metrics.urgentTasks.map((task) => `${task.description} | patient: ${task.patientName} | assigned: ${task.assignedTo} | due: ${task.dueDate} | ${task.status}`)
    : ['No open high-priority tasks.'];
  const riskLines = Object.keys(metrics.riskDistribution).length
    ? Object.entries(metrics.riskDistribution).map(([type, count]) => `${type}: ${count}`)
    : ['No alerts recorded for this date.'];

  return [
    { heading: 'Guardian Daily Operational Report', lines: [
      `Report date: ${reportDateLabel(reportDate)}`,
      `Generated and signed off: ${dateTimeLabel(signedOffAt)}`,
      `Sign-off: ${signoffName} (user ID: ${signoffUserId})`
    ] },
    { heading: 'Daily Metrics', lines: [
      `Booked appointments: ${metrics.bookedAppointments.value} (${metrics.bookedAppointments.source})`,
      `Cancellations: ${metrics.cancellations.value} (${metrics.cancellations.source})`,
      `Missed appointments: ${metrics.missedAppointments.value} (${metrics.missedAppointments.source})`,
      `Phone time: ${metrics.phoneTimeMinutes.value} minutes (${metrics.phoneTimeMinutes.source})`,
      `Tasks due: ${metrics.totalTasks}; completed: ${metrics.completedTasks}; completion rate: ${metrics.taskCompletionRate}%`
    ] },
    { heading: 'Tasks by Staff', lines: staffLines },
    { heading: 'Urgent Tasks', lines: urgentLines },
    { heading: 'Risk Distribution', lines: riskLines },
    { heading: 'Analytics: Change from Previous Report', lines: comparison.previousReportDate
      ? [`Previous report: ${comparison.previousReportDate}`, ...comparisonLines]
      : ['No earlier generated operational report is available for comparison.'] },
    { heading: 'Analytics Notes', lines: [analytics] },
    { heading: 'General Notes', lines: [generalNotes] }
  ];
}

/**
 * Generate and persist an organisation-wide daily operational PDF.
 *
 * Appointments and phone activity are intentionally labelled "not tracked" until
 * the application has models for those events; the API does not fabricate data.
 */
exports.generatePdf = async (req, res) => {
  try {
    const { reportDate: requestedDate, generalNotes, analytics } = req.body;
    if (typeof generalNotes !== 'string' || !generalNotes.trim() || typeof analytics !== 'string' || !analytics.trim()) {
      return res.status(400).json({ error: 'generalNotes and analytics are required text fields.' });
    }

    const reportDate = startOfLocalDay(requestedDate);
    if (!reportDate) return res.status(400).json({ error: 'reportDate must use YYYY-MM-DD format.' });
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const [signedOffBy, dueTasks, urgentTasks, riskGroups, previousReport] = await Promise.all([
      User.findById(req.user._id).select('fullname email').lean(),
      Task.find({ dueDate: { $gte: reportDate, $lt: nextDay } })
        .populate('caretaker', 'fullname email')
        .populate('nurse_id', 'fullname email')
        .lean(),
      Task.find({ priority: 'high', status: { $in: ['pending', 'in progress'] } })
        .populate('patient', 'fullname')
        .populate('caretaker', 'fullname email')
        .populate('nurse_id', 'fullname email')
        .sort({ dueDate: 1 })
        .lean(),
      Alert.aggregate([
        { $match: { created_at: { $gte: reportDate, $lt: nextDay } } },
        { $group: { _id: '$alert_type', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      DailyOperationalReport.findOne({ reportDate: { $lt: reportDate } })
        .sort({ reportDate: -1, createdAt: -1 })
        .lean()
    ]);

    if (!signedOffBy) return res.status(401).json({ error: 'The signed-in user no longer exists.' });

    const staffMetrics = new Map();
    for (const task of dueTasks) {
      const assignee = task.nurse_id || task.caretaker;
      const key = assignee?._id ? String(assignee._id) : 'unassigned';
      const existing = staffMetrics.get(key) || { staffId: key === 'unassigned' ? null : key, staffName: staffName(assignee), total: 0, completed: 0, pending: 0 };
      existing.total += 1;
      if (task.status === 'completed') existing.completed += 1;
      else existing.pending += 1;
      staffMetrics.set(key, existing);
    }
    const tasksByStaff = Array.from(staffMetrics.values())
      .map((staff) => ({ ...staff, completionRate: percentage(staff.completed, staff.total) }))
      .sort((a, b) => a.staffName.localeCompare(b.staffName));
    const completedTasks = dueTasks.filter((task) => task.status === 'completed').length;
    const riskDistribution = riskGroups.reduce((distribution, group) => {
      distribution[group._id || 'Uncategorised'] = group.count;
      return distribution;
    }, {});
    const openUrgentTasks = urgentTasks.map((task) => ({
      taskId: String(task._id),
      description: task.description,
      patientName: task.patient?.fullname || 'Unknown patient',
      assignedTo: staffName(task.nurse_id || task.caretaker),
      dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-AU') : 'No due date',
      status: task.status
    }));

    const metrics = {
      bookedAppointments: { value: 0, tracked: false, source: 'Not tracked by the current database' },
      cancellations: { value: 0, tracked: false, source: 'Not tracked by the current database' },
      missedAppointments: { value: 0, tracked: false, source: 'Not tracked by the current database' },
      phoneTimeMinutes: { value: 0, tracked: false, source: 'Not tracked by the current database' },
      totalTasks: dueTasks.length,
      completedTasks,
      taskCompletionRate: percentage(completedTasks, dueTasks.length),
      tasksByStaff,
      urgentTasks: openUrgentTasks,
      riskDistribution
    };
    const oldMetrics = previousReport?.metrics || {};
    const comparison = {
      previousReportDate: previousReport ? reportDateLabel(new Date(previousReport.reportDate)) : null,
      coreMetrics: {
        bookedAppointments: delta(metrics.bookedAppointments.value, oldMetrics.bookedAppointments?.value),
        cancellations: delta(metrics.cancellations.value, oldMetrics.cancellations?.value),
        missedAppointments: delta(metrics.missedAppointments.value, oldMetrics.missedAppointments?.value),
        phoneTimeMinutes: delta(metrics.phoneTimeMinutes.value, oldMetrics.phoneTimeMinutes?.value),
        totalTasks: delta(metrics.totalTasks, oldMetrics.totalTasks),
        completedTasks: delta(metrics.completedTasks, oldMetrics.completedTasks),
        openUrgentTasks: delta(metrics.urgentTasks.length, oldMetrics.urgentTasks?.length)
      }
    };

    // The time and signer always come from the authenticated request and server clock,
    // never from values supplied by the caller.
    const signedOffAt = new Date();
    const signoffName = signedOffBy.fullname || signedOffBy.email;
    const fileName = `daily-report-${reportFileDate(reportDate)}-${Date.now()}.pdf`;
    const sections = buildPdfSections({
      reportDate, signedOffAt, signoffName, signoffUserId: String(req.user._id),
      generalNotes: generalNotes.trim(), analytics: analytics.trim(), metrics, comparison
    });
    await saveDailyReportPdf({ fileName, sections });
    const filePath = path.posix.join('/uploads/daily-reports', fileName);

    const report = await DailyOperationalReport.create({
      reportDate,
      generatedBy: req.user._id,
      signoffName,
      signedOffAt,
      generalNotes: generalNotes.trim(),
      analytics: analytics.trim(),
      metrics,
      comparison,
      fileName,
      filePath
    });

    return res.status(201).json({
      message: 'Daily operational report PDF generated successfully.',
      report: {
        id: report._id,
        reportDate,
        signedOffAt,
        signoff: { userId: String(req.user._id), name: signoffName },
        filePath,
        metrics,
        comparison
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to generate daily operational report.', details: error.message });
  }
};
