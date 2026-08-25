const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const controller = require('../controllers/medicalRecordController');

// TODO: Add receptionist once the role is added to the backend.

/**
 * @swagger
 * /api/v1/medical-records:
 *   post:
 *     summary: Book a medical appointment
 *     description: The logged-in admin's organization is used automatically. The patient and doctor must belong to the same organization as the admin.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [patientId, doctorId, location, appointmentDate, appointmentTime]
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Patient ObjectId
 *               doctorId:
 *                 type: string
 *                 description: Doctor User ObjectId
 *               location:
 *                 type: string
 *                 example: Consultation Room 2
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *                 example: 2026-08-20
 *               appointmentTime:
 *                 type: string
 *                 example: "10:30"
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, doctorId, location]
 *             properties:
 *               patientId:
 *                 type: string
 *               doctorId:
 *                 type: string
 *               location:
 *                 type: string
 *               appointmentDateTime:
 *                 type: string
 *                 format: date-time
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *               appointmentTime:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment booked successfully
 *       400:
 *         description: Invalid input or admin/patient/doctor organization mismatch
 *       403:
 *         description: Only an admin can book an appointment
 *       404:
 *         description: Admin, patient, doctor, or organization not found
 */
router.post(
  '/',
  verifyToken,
  verifyRole(['admin']),
  controller.createAppointment
);

/**
 * @swagger
 * /api/v1/medical-records:
 *   get:
 *     summary: List appointments and medical records
 *     description: Doctors receive records from their organization. Admin/patient access remains limited by backend rules.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [booked, in-progress, completed]
 *       - in: query
 *         name: patient
 *         schema:
 *           type: string
 *       - in: query
 *         name: doctor
 *         schema:
 *           type: string
 *       - in: query
 *         name: organization
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Records returned successfully
 */
router.get(
  '/',
  verifyToken,
  verifyRole(['admin', 'patient', 'doctor']),
  controller.getMedicalRecords
);

/**
 * @swagger
 * /api/v1/medical-records/{id}/start:
 *   patch:
 *     summary: Start a consultation
 *     description: Saves the current time as the consultation start time.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consultation started successfully
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Consultation already started or completed
 */
router.patch(
  '/:id/start',
  verifyToken,
  verifyRole(['admin']),
  controller.startConsultation
);

/**
 * @swagger
 * /api/v1/medical-records/{id}/consultation-data:
 *   get:
 *     summary: Open consultation data for a doctor
 *     description: Returns the patient's medical record, patient details, prescription history and vital history. Only doctors in the same organization can access it.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consultation data returned successfully
 *       403:
 *         description: Doctor is not in the patient's organization
 *       404:
 *         description: Medical record not found
 */
router.get(
  '/:id/consultation-data',
  verifyToken,
  verifyRole(['doctor']),
  controller.getConsultationData
);

/**
 * @swagger
 * /api/v1/medical-records/{id}/complete:
 *   patch:
 *     summary: Complete a consultation
 *     description: Creates Vitals and Prescription records when data is supplied, stores readable text snapshots in Medical Record, links Care Plans, and completes the consultation.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [diagnosis]
 *             properties:
 *               generalNotes:
 *                 type: string
 *                 description: General consultation notes
 *               symptoms:
 *                 type: string
 *                 description: Comma-separated symptoms, e.g. Fever, Headache
 *               temperature:
 *                 type: number
 *                 description: Optional vital - temperature
 *               bloodPressure:
 *                 type: string
 *                 description: Optional vital - blood pressure
 *                 example: 120/80
 *               heartRate:
 *                 type: number
 *                 description: Optional vital - heart rate
 *               respiratoryRate:
 *                 type: number
 *                 description: Optional vital - respiratory rate
 *               oxygenSaturation:
 *                 type: number
 *                 description: Optional vital - oxygen saturation percentage
 *               vitalNotes:
 *                 type: string
 *                 description: Optional notes saved with the Vital record
 *               tests:
 *                 type: string
 *                 description: Tests performed/requested
 *               diagnosis:
 *                 type: string
 *                 example: Viral infection
 *               referrals:
 *                 type: string
 *                 description: Referral information
 *               medicineName:
*                 type: string
*                 description: Medicine name
*                 example: Paracetamol
*               medicineDose:
*                 type: string
*                 description: Medicine dose
*                 example: 500 mg
*               medicineFrequency:
*                 type: string
*                 description: How often the medicine should be taken
*                 example: Twice daily
*               medicineDurationDays:
*                 type: integer
*                 description: Number of days the medicine should be taken
*                 example: 5
*               medicineQuantity:
*                 type: integer
*                 description: Total quantity
*                 example: 10
*               medicineInstructions:
*                 type: string
*                 description: Instructions for the medicine
*                 example: Take after food
*               prescriptionNotes:
*                 type: string
*                 description: General prescription notes
*                 example: Take medicines as directed
 *               carePlanIds:
 *                 type: string
 *                 description: Comma-separated existing Care Plan ObjectIds
 *               recommendations:
 *                 type: string
 *                 description: Doctor recommendations
 *               followUp:
 *                 type: string
 *                 description: Follow-up instructions
 *         application/json:
 *           schema:
 *             type: object
 *             required: [diagnosis]
 *             properties:
 *               generalNotes:
 *                 type: string
 *               symptoms:
 *                 type: array
 *                 items:
 *                   type: string
 *               vitals:
 *                 type: object
 *                 properties:
 *                   temperature:
 *                     type: number
 *                   bloodPressure:
 *                     type: string
 *                   heartRate:
 *                     type: number
 *                   respiratoryRate:
 *                     type: number
 *                   oxygenSaturation:
 *                     type: number
 *                   notes:
 *                     type: string
 *               tests:
 *                 type: string
 *               diagnosis:
 *                 type: string
 *               clinicalNotes:
 *                 type: string
 *               referrals:
 *                 type: string
 *               prescriptions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     notes:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [active, discontinued, completed]
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [name, dose, frequency, durationDays]
 *                         properties:
 *                           name:
 *                             type: string
 *                           dose:
 *                             type: string
 *                           frequency:
 *                             type: string
 *                           durationDays:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                           instructions:
 *                             type: string
 *               carePlans:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Existing Care Plan ObjectIds
 *               recommendations:
 *                 type: string
 *               followUp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Consultation completed successfully
 *       400:
 *         description: Invalid medical information
 *       403:
 *         description: Only the assigned doctor can complete the consultation
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Consultation is not in progress
 */
router.patch(
  '/:id/complete',
  verifyToken,
  verifyRole(['doctor']),
  controller.completeConsultation
);

/**
 * @swagger
 * /api/v1/medical-records/{id}:
 *   get:
 *     summary: Get one appointment or medical record
 *     description: Doctors in the same organization receive private medical details. Other allowed users receive basic appointment information only.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record returned successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Record not found
 */
router.get(
  '/:id',
  verifyToken,
  verifyRole(['admin', 'patient', 'doctor']),
  controller.getMedicalRecordById
);

/**
 * @swagger
 * /api/v1/medical-records/{id}:
 *   patch:
 *     summary: Change a booked appointment
 *     description: The doctor, location or appointment date/time can only be changed before the consultation starts. Organization is fixed automatically.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               doctorId:
 *                 type: string
 *                 description: New doctor User ObjectId. Must belong to the same organization.
 *               location:
 *                 type: string
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *               appointmentTime:
 *                 type: string
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               doctorId:
 *                 type: string
 *                 description: New doctor User ObjectId. Must belong to the same organization.
 *               location:
 *                 type: string
 *               appointmentDateTime:
 *                 type: string
 *                 format: date-time
 *               appointmentDate:
 *                 type: string
 *               appointmentTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment updated successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Consultation has already started
 */
router.patch(
  '/:id',
  verifyToken,
  verifyRole(['admin', 'patient', 'doctor']),
  controller.updateAppointment
);

/**
 * @swagger
 * /api/v1/medical-records/{id}:
 *   delete:
 *     summary: Delete a booked appointment
 *     description: Permanently deletes the appointment only while its status is booked.
 *     tags: [Medical Records]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Appointment deleted successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Consultation has already started
 */
router.delete(
  '/:id',
  verifyToken,
  verifyRole(['admin', 'patient', 'doctor']),
  controller.deleteAppointment
);

module.exports = router;
