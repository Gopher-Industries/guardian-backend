const SpecialistReport = require('../models/SpecialistReport');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const CarePlan = require('../models/CarePlan');
const ManagementPlan = require('../models/ManagementPlan');
const puppeteer = require('puppeteer');
const { buildSpecialistReportHtml } = require('../templates/specialistReportTemplate');

exports.createReport = async (req, res) => {
  try {
    const body = req.body || {};
    const { patientId, reasonForReferral } = body;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required' });
    }

    // --- Specialist: the logged-in doctor creating this report ---
    const specialistUser = await User.findById(req.user._id);
    if (!specialistUser) {
      return res.status(404).json({ error: 'Logged-in doctor not found' });
    }
    const specialistDoctor = await Doctor.findOne({ user: specialistUser._id });

    // --- Patient ---
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // --- Referring doctor ---
    // Patient.assignedDoctor is the referring doctor.
    let referringDoctorUser = null;
    if (patient.assignedDoctor) {
      referringDoctorUser = await User.findById(patient.assignedDoctor);
    }

    // --- Management plan ---
    // use the patient's most recent CarePlan
    // and its ManagementPlan. No rule exists yet for what to do if there's more than one.
    const latestCarePlan = await CarePlan.findOne({ patient: patientId }).sort({ created_at: -1 });
    let managementPlanDoc = null;
    if (latestCarePlan) {
      managementPlanDoc = await ManagementPlan.findOne({ care_plan: latestCarePlan._id }).sort({ created_at: -1 });
    }

    // Auto-fetched values are the defaults; anything the request body explicitly
    // supplies for the same nested field overrides it. 
    const specialistClinic = {
      specialistName: specialistUser.fullname,
      speciality: specialistDoctor?.specialization,
      phone: specialistUser.phone,
      email: specialistUser.email,
      ...body.specialistClinic
    };

    const referringDoctor = {
      fullName: referringDoctorUser?.fullname,
      email: referringDoctorUser?.email,
      phone: referringDoctorUser?.phone,
      ...body.referringDoctor
    };

    const patientDetails = {
      fullName: patient.fullname,
      dob: patient.dateOfBirth,
      ...body.patient
    };

    // Management Plan
    const managementPlan = {
      recommendedTreatment: managementPlanDoc?.management,
      ...body.managementPlan
    };

    const report = await SpecialistReport.create({
      createdBy: req.user._id,
      specialistClinic,
      referringDoctor,
      patient: patientDetails,
      consultation: body.consultation,
      examination: body.examination,
      managementPlan,
      actionItemsForGP: body.actionItemsForGP,
      urgency: body.urgency,
      reasonForReferral,
      status: body.status
    });

    res.status(201).json({ message: 'Specialist report created successfully', report });
  } catch (error) {
    res.status(500).json({ error: 'Error creating report', details: error.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    const reports = await SpecialistReport.find({ createdBy: req.user._id });
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching reports', details: error.message });
  }
};

exports.generateReportPdf = async (req, res) => {
  let browser;
  try {
    const report = await SpecialistReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const html = buildSpecialistReportHtml(report, { appName: 'Guardian Monitor' });

    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = Buffer.from(await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=specialist-report-${report._id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Error generating PDF', details: error.message });
  } finally {
    if (browser) await browser.close();
  }
};