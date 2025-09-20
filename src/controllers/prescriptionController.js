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
 *           description: Medicine name (required)
 *           example: Amoxicillin
 *         dose:
 *           type: string
 *           description: Dosage info (required)
 *           example: "500 mg"
 *         frequency:
 *           type: string
 *           description: How often to take it (required)
 *           example: "twice daily"
 *         durationDays:
 *           type: integer
 *           description: Number of days (required)
 *           example: 7
 *         quantity:
 *           type: integer
 *           description: Total tablets/capsules (optional)
 *           example: 14
 *         instructions:
 *           type: string
 *           description: Extra guidance (optional)
 *           example: "Take after food"
 *
 *     PrescriptionCreateRequest:
 *       type: object
 *       description: |
 *         ### Required fields
 *         - **items** (array, min 1)
 *         - For each **items[i]**: **name**, **dose**, **frequency**, **durationDays**
 *         - **patientId** **or** **patientName** (at least one must be provided)
 *       required:
 *         - items
 *       properties:
 *         patientId:
 *           type: string
 *           description: Patient ObjectId (required if patientName not provided)
 *           example: "68c268a3097a71d5162ac23a"
 *         patientName:
 *           type: string
 *           description: Patient full name (required if patientId not provided)
 *           example: "Asha Patel"
 *         items:
 *           type: array
 *           minItems: 1
 *           description: Array of prescription items (at least one required)
 *           items:
 *             $ref: '#/components/schemas/PrescriptionItem'
 *         notes:
 *           type: string
 *           description: Optional notes for the prescription
 *           example: "For acute sinusitis"
 *       oneOf:
 *         - required: [patientId]
 *         - required: [patientName]
 *
 * /api/v1/prescriptions:
 *   post:
 *     summary: Create a new prescription for a patient
 *     description: |
 *       ### Required fields (at a glance)
 *       - **items** with at least one item  
 *       - **Each item** must include: **name**, **dose**, **frequency**, **durationDays**  
 *       - **patientId** *or* **patientName**
 *     tags:
 *       - Prescription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: Send as **application/json**. Use patientId when possible.
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
 */
exports.createPrescription = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ error: 'Unauthorized: missing user context' });
    }

    const { patientId, patientName, items, notes } = req.body;

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one prescription item is required' });
    }
    for (const [i, it] of items.entries()) {
      if (!it?.name || !it?.dose || !it?.frequency || !it?.durationDays) {
        return res.status(400).json({
          error: `Item ${i} missing required fields: name, dose, frequency, durationDays`
        });
      }
    }

    // Find patient (by id or name)
    let patient = null;
    if (patientId && mongoose.Types.ObjectId.isValid(patientId)) {
      patient = await Patient.findById(patientId);
    } else if (patientName) {
      patient = await Patient.findOne({ fullname: patientName, isDeleted: { $ne: true } });
    }
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // NOTE: model expects `prescriber`, not `prescribedBy`
    const prescription = await Prescription.create({
      patient: patient._id,
      prescriber: req.user._id,   // <-- key fix
      items,
      notes,
      status: 'active'
    });

    return res.status(201).json(prescription);
  } catch (err) {
    return res.status(500).json({ error: 'Error creating prescription', details: err.message });
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
 *         schema: { type: string }
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription fetched successfully
 *       404:
 *         description: Prescription not found
 */
exports.getPrescriptionById = async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('patient', 'fullname gender dateOfBirth')
      .populate('prescriber', 'fullname email');   // <-- FIX here

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.status(200).json(prescription);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching prescription', details: err.message });
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
 *         schema: { type: string }
 *         description: Prescription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Prescription'
 *     responses:
 *       200:
 *         description: Prescription updated successfully
 *       404:
 *         description: Prescription not found
 */
exports.updatePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const prescription = await Prescription.findByIdAndUpdate(id, updates, { new: true });

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.status(200).json(prescription);
  } catch (err) {
    res.status(500).json({ error: 'Error updating prescription', details: err.message });
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
 *         schema: { type: string }
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription discontinued successfully
 *       404:
 *         description: Prescription not found
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
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.status(200).json(prescription);
  } catch (err) {
    res.status(500).json({ error: 'Error discontinuing prescription', details: err.message });
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
 *         schema: { type: string }
 *         description: Prescription ID
 *     responses:
 *       200:
 *         description: Prescription deleted successfully
 *       404:
 *         description: Prescription not found
 */
exports.deletePrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findByIdAndDelete(id);

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    res.status(200).json({ message: 'Prescription deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting prescription', details: err.message });
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
 *         schema: { type: string }
 *         description: Patient ID
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, discontinued] }
 *         description: Filter prescriptions by status
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *         description: Results per page (default 10)
 *     responses:
 *       200:
 *         description: List of prescriptions for the patient
 */
exports.listPrescriptionsForPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: 'Invalid patientId format' });
    }

    const filter = { patient: patientId };
    if (status) filter.status = status;

    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter)
        .populate('prescriber', 'fullname email')
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      Prescription.countDocuments(filter),
    ]);

    res.status(200).json({
      prescriptions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Error listing prescriptions', details: err.message });
  }
};