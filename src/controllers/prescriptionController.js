const mongoose = require('mongoose');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');

/**
 * @swagger
 * components:
 *   schemas:
 *     PrescriptionItem:
 *       type: object
 *       required:
 *         - name
 *         - dose
 *         - frequency
 *         - durationDays
 *       properties:
 *         name:
 *           type: string
 *           description: Medicine name
 *           example: Amoxicillin
 *         dose:
 *           type: string
 *           description: Dosage info
 *           example: "500 mg"
 *         frequency:
 *           type: string
 *           description: How often to take it
 *           example: "twice daily"
 *         durationDays:
 *           type: integer
 *           description: Number of days
 *           example: 7
 *         quantity:
 *           type: integer
 *           description: Total tablets or capsules
 *           example: 14
 *         instructions:
 *           type: string
 *           description: Extra guidance
 *           example: "Take after food"
 *
 *     PrescriptionCreateRequest:
 *       type: object
 *       description: Create prescription request body
 *       required:
 *         - items
 *       properties:
 *         patientId:
 *           type: string
 *           description: Patient ObjectId, required if patientName is not provided
 *           example: "68c268a3097a71d5162ac23a"
 *         patientName:
 *           type: string
 *           description: Patient full name, required if patientId is not provided
 *           example: "Asha Patel"
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/PrescriptionItem'
 *         notes:
 *           type: string
 *           description: Optional notes for the prescription
 *           example: "For acute sinusitis"
 *       oneOf:
 *         - required: [patientId]
 *         - required: [patientName]
 */

/**
 * @swagger
 * /api/v1/prescriptions:
 *   post:
 *     summary: Create a new prescription for a patient
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrescriptionCreateRequest'
 *           examples:
 *             minimal:
 *               summary: Minimal valid body
 *               value:
 *                 patientId: "68c268a3097a71d5162ac23a"
 *                 items:
 *                   - name: "Amoxicillin"
 *                     dose: "500 mg"
 *                     frequency: "twice daily"
 *                     durationDays: 7
 *             full:
 *               summary: With optional fields
 *               value:
 *                 patientName: "Asha Patel"
 *                 items:
 *                   - name: "Amoxicillin"
 *                     dose: "500 mg"
 *                     frequency: "twice daily"
 *                     durationDays: 7
 *                     quantity: 14
 *                     instructions: "Take after food"
 *                 notes: "For acute sinusitis"
 *     responses:
 *       201:
 *         description: Prescription created successfully
 *       400:
 *         description: Missing or invalid fields
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Error creating prescription
 */
exports.createPrescription = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        error: 'Unauthorized: missing user context'
      });
    }

    const { patientId, patientName, items, notes } = req.body;

    if (!patientId && !patientName) {
      return res.status(400).json({
        error: 'Either patientId or patientName is required'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'At least one prescription item is required'
      });
    }

    for (const [i, it] of items.entries()) {
      if (!it?.name || !it?.dose || !it?.frequency || !it?.durationDays) {
        return res.status(400).json({
          error: `Item ${i + 1} missing required fields: name, dose, frequency, durationDays`
        });
      }

      if (typeof it.name !== 'string' || !it.name.trim()) {
        return res.status(400).json({
          error: `Item ${i + 1}: medicine name is required and cannot be empty`
        });
      }

      if (typeof it.dose !== 'string' || !it.dose.trim()) {
        return res.status(400).json({
          error: `Item ${i + 1}: dose is required`
        });
      }

      const doseNum = parseFloat(it.dose.replace(/[^0-9.-]+/g, ''));
      if (isNaN(doseNum) || doseNum <= 0) {
        return res.status(400).json({
          error: `Item ${i + 1}: dose must be a positive number`
        });
      }

      if (typeof it.frequency !== 'string' || !it.frequency.trim()) {
        return res.status(400).json({
          error: `Item ${i + 1}: frequency is required`
        });
      }

      if (!Number.isInteger(it.durationDays) || it.durationDays <= 0) {
        return res.status(400).json({
          error: `Item ${i + 1}: durationDays must be a positive integer`
        });
      }

      if (
        it.quantity !== undefined &&
        (!Number.isInteger(it.quantity) || it.quantity <= 0)
      ) {
        return res.status(400).json({
          error: `Item ${i + 1}: quantity must be a positive integer`
        });
      }
    }

    let patient = null;

    if (patientId) {
      if (!mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(400).json({
          error: 'Invalid patientId format'
        });
      }

      patient = await Patient.findById(patientId);
    } else if (patientName) {
      patient = await Patient.findOne({
        fullname: patientName,
        isDeleted: { $ne: true }
      });
    }

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found'
      });
    }

    const prescription = await Prescription.create({
      patient: patient._id,
      prescriber: req.user._id,
      items,
      notes,
      status: 'active'
    });

    return res.status(201).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error creating prescription',
      details: err.message
    });
  }
};

/**
 * @swagger
 * /api/v1/prescriptions/{id}:
 *   get:
 *     summary: Get prescription by ID
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error fetching prescription
 */
exports.getPrescriptionById = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        error: 'Unauthorized: missing user context'
      });
    }

    const prescription = await Prescription.findById(req.params.id)
      .populate('patient', 'fullname gender dateOfBirth organisation')
      .populate('prescriber', 'fullname email organisation');

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    const userId = String(req.user._id);
    const userRole = req.user.role;
    const userOrganisation = req.user.organisation
      ? String(req.user.organisation)
      : null;

    const prescriberId = prescription.prescriber?._id
      ? String(prescription.prescriber._id)
      : null;

    const patientOrganisation = prescription.patient?.organisation
      ? String(prescription.patient.organisation)
      : null;

    const canRead =
      userRole === 'admin' ||
      prescriberId === userId ||
      (userOrganisation &&
        patientOrganisation &&
        userOrganisation === patientOrganisation);

    if (!canRead) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    return res.status(200).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error fetching prescription',
      details: err.message
    });
  }
};

/**
 * @swagger
 * /api/v1/prescriptions/{id}:
 *   patch:
 *     summary: Update prescription by ID
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Prescription updated successfully
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error updating prescription
 */
exports.updatePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const prescription = await Prescription.findByIdAndUpdate(id, updates, {
      new: true
    });

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    return res.status(200).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error updating prescription',
      details: err.message
    });
  }
};

/**
 * @swagger
 * /api/v1/prescriptions/{id}/discontinue:
 *   post:
 *     summary: Discontinue a prescription
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription discontinued successfully
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error discontinuing prescription
 */
exports.discontinuePrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findByIdAndUpdate(
      id,
      { status: 'discontinued' },
      { new: true }
    );

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    return res.status(200).json(prescription);
  } catch (err) {
    return res.status(500).json({
      error: 'Error discontinuing prescription',
      details: err.message
    });
  }
};

/**
 * @swagger
 * /api/v1/prescriptions/{id}:
 *   delete:
 *     summary: Delete prescription by ID
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription deleted successfully
 *       404:
 *         description: Prescription not found
 *       500:
 *         description: Error deleting prescription
 */
exports.deletePrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findByIdAndDelete(id);

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription not found'
      });
    }

    return res.status(200).json({
      message: 'Prescription deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Error deleting prescription',
      details: err.message
    });
  }
};

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions:
 *   get:
 *     summary: List prescriptions for a patient
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, discontinued]
 *         description: Filter prescriptions by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Results per page
 *     responses:
 *       200:
 *         description: List of prescriptions for the patient
 *       400:
 *         description: Invalid patientId format
 *       500:
 *         description: Error listing prescriptions
 */
exports.listPrescriptionsForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({
        error: 'Invalid patientId format'
      });
    }

    const filter = { patient: patientId };
    if (status) {
      filter.status = status;
    }

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter)
        .populate('prescriber', 'fullname email')
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit),
      Prescription.countDocuments(filter)
    ]);

    return res.status(200).json({
      prescriptions,
      pagination: {
        total,
        page: parsedPage,
        pages: Math.ceil(total / parsedLimit),
        limit: parsedLimit
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Error listing prescriptions',
      details: err.message
    });
  }
};
