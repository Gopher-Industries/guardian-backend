/**
 * Guardian Report Service — specialistReportTemplate.js
 *
 */

const { BRAND, escapeHtml, paragraph, detailTable } = require('./baseTemplate');

function sectionHeading(title) {
  return `<h2 style="margin:28px 0 12px 0;font-size:15px;letter-spacing:0.3px;
    color:${BRAND.primaryDark};border-bottom:2px solid ${BRAND.border};padding-bottom:6px">
    ${escapeHtml(title)}
  </h2>`;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });
}

const STATUS_COLOURS = {
  draft: '#B7791F',
  finalised: '#2E8B57',
  'sent to GP': BRAND.primary
};

function statusBadge(status) {
  const colour = STATUS_COLOURS[status] || BRAND.muted;
  return `<span style="display:inline-block;padding:4px 12px;background:${colour};color:#FFFFFF;
    border-radius:12px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px">
    ${escapeHtml(status || 'draft')}
  </span>`;
}

function buildSpecialistReportHtml(report, config = {}) {
  const appName = config.appName || 'Guardian Monitor';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Specialist Report — ${escapeHtml(report.patient?.fullName || '')}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:${BRAND.text}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td style="padding:24px 36px;background:${BRAND.primary}">
        <span style="font-size:20px;font-weight:bold;color:#FFFFFF">${escapeHtml(appName)}</span>
        <span style="float:right;font-size:14px;color:#FFFFFF">Specialist Report</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 36px">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px">
          <tr>
            <td style="font-size:13px;color:${BRAND.muted}">
              Report date: <strong style="color:${BRAND.text}">${escapeHtml(formatDate(report.reportDate))}</strong>
              &nbsp;&middot;&nbsp;
              Urgency: <strong style="color:${BRAND.text};text-transform:capitalize">${escapeHtml(report.urgency || 'routine')}</strong>
            </td>
            <td style="text-align:right">${statusBadge(report.status)}</td>
          </tr>
        </table>

        ${sectionHeading('Specialist Clinic Details')}
        ${detailTable([
          ['Specialist Name', report.specialistClinic?.specialistName],
          ['Clinic Name', report.specialistClinic?.clinicName],
          ['Speciality', report.specialistClinic?.speciality],
          ['Provider Number', report.specialistClinic?.providerNumber],
          ['Address', report.specialistClinic?.address],
          ['Phone', report.specialistClinic?.phone],
          ['Email', report.specialistClinic?.email]
        ])}

        ${sectionHeading('Referring Doctor Details')}
        ${detailTable([
          ['Full Name', report.referringDoctor?.fullName],
          ['Clinic Name', report.referringDoctor?.clinicName],
          ['Provider Number', report.referringDoctor?.providerNumber],
          ['Address', report.referringDoctor?.address],
          ['Phone', report.referringDoctor?.phone],
          ['Email', report.referringDoctor?.email]
        ])}

        ${sectionHeading('Patient Details')}
        ${detailTable([
          ['Full Name', report.patient?.fullName],
          ['Date of Birth', formatDate(report.patient?.dob)],
          ['Medicare Number', report.patient?.medicareNumber],
          ['Address', report.patient?.address],
          ['Contact Number', report.patient?.contactNumber],
          ['Email', report.patient?.email]
        ])}

        ${sectionHeading('Consultation Details')}
        ${detailTable([
          ['Date of Consultation', formatDate(report.consultation?.date)]
        ])}
        ${report.consultation?.history ? paragraph(`<strong>History:</strong> ${escapeHtml(report.consultation.history)}`) : ''}
        ${report.consultation?.currentMedications ? paragraph(`<strong>Current Medications:</strong> ${escapeHtml(report.consultation.currentMedications)}`) : ''}
        ${report.consultation?.allergies ? paragraph(`<strong>Allergies:</strong> ${escapeHtml(report.consultation.allergies)}`) : ''}

        ${sectionHeading('Examination and Findings')}
        ${report.examination?.examinationsPerformed ? paragraph(`<strong>Examinations Performed:</strong> ${escapeHtml(report.examination.examinationsPerformed)}`) : ''}
        ${report.examination?.findings ? paragraph(`<strong>Findings:</strong> ${escapeHtml(report.examination.findings)}`) : ''}
        ${report.examination?.testResults ? paragraph(`<strong>Test Results:</strong> ${escapeHtml(report.examination.testResults)}`) : ''}
        ${report.examination?.diagnosis ? paragraph(`<strong>Diagnosis:</strong> ${escapeHtml(report.examination.diagnosis)}`) : ''}

        ${sectionHeading('Management Plan')}
        ${report.managementPlan?.recommendedTreatment ? paragraph(`<strong>Recommended Treatment:</strong> ${escapeHtml(report.managementPlan.recommendedTreatment)}`) : ''}
        ${report.managementPlan?.furtherInvestigations ? paragraph(`<strong>Further Investigations:</strong> ${escapeHtml(report.managementPlan.furtherInvestigations)}`) : ''}
        ${report.managementPlan?.plannedFollowUp ? paragraph(`<strong>Planned Follow-up:</strong> ${escapeHtml(report.managementPlan.plannedFollowUp)}`) : ''}
        ${report.managementPlan?.dischargeOrOngoingCare ? paragraph(`<strong>Specialist Care / Discharge:</strong> ${escapeHtml(report.managementPlan.dischargeOrOngoingCare)}`) : ''}

        ${sectionHeading('Action Items for GP')}
        ${report.actionItemsForGP?.actionsRequired ? paragraph(`<strong>Actions Required:</strong> ${escapeHtml(report.actionItemsForGP.actionsRequired)}`) : ''}
        ${report.actionItemsForGP?.sharedCareChanges ? paragraph(`<strong>Shared Care Changes:</strong> ${escapeHtml(report.actionItemsForGP.sharedCareChanges)}`) : ''}

      </td>
    </tr>
    <tr>
      <td style="padding:16px 36px;background:${BRAND.page};border-top:1px solid ${BRAND.border}">
        <p style="margin:0;font-size:11px;color:${BRAND.muted}">
          Generated by ${escapeHtml(appName)}. This document contains confidential patient health information.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { buildSpecialistReportHtml };