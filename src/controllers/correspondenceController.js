const mongoose = require('mongoose');
const Correspondence = require('../models/Correspondence');
const Patient = require('../models/Patient');
const User = require('../models/User');

/**
 * @swagger
 * tags:
 *   - name: Correspondence
 *     description: Endpoints for managing correspondence documents
 */

/**
 * @swagger
 * /api/v1/correspondence:
 *   post:
 *     summary: Create a new correspondence document
 *     description: Creates a new correspondence record linked to a patient and optionally a staff member.
 *     tags: [Correspondence]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - type
 *               - direction
 *               - date
 *               - cloudflareObjectKey
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Patient ID
 *               staffId:
 *                 type: string
 *                 nullable: true
 *                 description: Staff ID
 *               type:
 *                 type: string
 *                 enum:
 *                   - letter
 *                   - referral
 *                   - specialist report
 *                   - discharge summary
 *                   - other
 *               description:
 *                 type: string
 *                 nullable: true
 *               direction:
 *                 type: string
 *                 enum:
 *                   - incoming
 *                   - outgoing
 *               date:
 *                 type: string
 *                 format: date
 *               cloudflareObjectKey:
 *                 type: string
 *     responses:
 *       201:
 *         description: Correspondence created successfully
 *       400:
 *         description: Missing or invalid request data
 *       404:
 *         description: Patient or staff member not found
 *       500:
 *         description: Internal server error
 */
exports.createCorrespondence = async (req, res) => {
    try {
        const {
            patientId,
            staffId,
            type,
            description,
            direction,
            date,
            cloudflareObjectKey
        } = req.body;

        if (!patientId || !type || !direction || !date || !cloudflareObjectKey) {
            return res.status(400).json({
                message: 'Missing required fields'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({
                message: 'Invalid patient ID'
            });
        }

        if (staffId && !mongoose.Types.ObjectId.isValid(staffId)) {
            return res.status(400).json({
                message: 'Invalid staff ID'
            });
        }

        const patientExists = await Patient.findById(patientId);

        if (!patientExists) {
            return res.status(404).json({
                message: 'Patient not found'
            });
        }

       if (typeof staffId !== 'undefined') {
            const staffExists = await User.findById(staffId);

            if (!staffExists) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }
        }

        const correspondence = new Correspondence({
            patient: patientId,
            staff: staffId,
            type,
            description,
            direction,
            date,
            cloudflareObjectKey
        });

        await correspondence.save();

        return res.status(201).json({
            message: 'Correspondence created successfully',
            correspondence
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Error creating correspondence',
            details: error.message
        });
    }
};

/**
 * @swagger
 * /api/v1/correspondence/{correspondenceId}:
 *   get:
 *     summary: Get a correspondence document by ID
 *     description: Returns a correspondence document using its ID.
 *     tags: [Correspondence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correspondenceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Correspondence ID
 *     responses:
 *       200:
 *         description: Correspondence retrieved successfully
 *       400:
 *         description: Invalid correspondence ID
 *       404:
 *         description: Correspondence not found
 *       500:
 *         description: Internal server error
 */
exports.getCorrespondenceById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.correspondenceId)) {
            return res.status(400).json({
                message: 'Invalid correspondence ID'
            });
        }

        const correspondence = await Correspondence.findById(req.params.correspondenceId)
            .populate('patient', 'fullname')
            .populate('staff', 'fullname email');

        if (!correspondence) {
            return res.status(404).json({
                message: 'Correspondence not found'
            });
        }

        return res.status(200).json(correspondence);
    } catch (error) {
        return res.status(500).json({
            message: 'Error fetching correspondence',
            details: error.message
        });
    }
};

/**
 * @swagger
 * /api/v1/correspondence/patient/{patientId}:
 *   get:
 *     summary: Get all correspondence documents for a patient
 *     description: Returns all correspondence records associated with a patient.
 *     tags: [Correspondence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Correspondence retrieved successfully
 *       400:
 *         description: Invalid patient ID
 *       500:
 *         description: Internal server error
 */
exports.getCorrespondenceByPatient = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.patientId)) {
            return res.status(400).json({
                message: 'Invalid patient ID'
            });
        }

        const correspondence = await Correspondence.find({
            patient: req.params.patientId
        })
            .populate('patient', 'fullname')
            .populate('staff', 'fullname email')
            .sort({ date: -1 });

        return res.status(200).json(correspondence);
    } catch (error) {
        return res.status(500).json({
            message: 'Error fetching correspondence',
            details: error.message
        });
    }
};

/**
 * @swagger
 * /api/v1/correspondence/staff/{staffId}:
 *   get:
 *     summary: Get all correspondence documents created by a staff member
 *     description: Returns all correspondence records linked to a staff member.
 *     tags: [Correspondence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         description: Staff ID
 *     responses:
 *       200:
 *         description: Correspondence retrieved successfully
 *       400:
 *         description: Invalid staff ID
 *       500:
 *         description: Internal server error
 */
exports.getCorrespondenceByStaff = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.staffId)) {
            return res.status(400).json({
                message: 'Invalid staff ID'
            });
        }

        const correspondence = await Correspondence.find({
            staff: req.params.staffId
        })
            .populate('patient', 'fullname')
            .populate('staff', 'fullname email')
            .sort({ date: -1 });

        return res.status(200).json(correspondence);
    } catch (error) {
        return res.status(500).json({
            message: 'Error fetching correspondence',
            details: error.message
        });
    }
};

/**
 * @swagger
 * /api/v1/correspondence/{correspondenceId}:
 *   patch:
 *     summary: Update a correspondence document
 *     description: Updates an existing correspondence document.
 *     tags: [Correspondence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correspondenceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Correspondence ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Patient ID
 *               staffId:
 *                 type: string
 *                 nullable: true
 *                 description: Staff ID
 *               type:
 *                 type: string
 *                 enum:
 *                   - letter
 *                   - referral
 *                   - specialist report
 *                   - discharge summary
 *                   - other
 *               description:
 *                 type: string
 *                 nullable: true
 *               direction:
 *                 type: string
 *                 enum:
 *                   - incoming
 *                   - outgoing
 *               date:
 *                 type: string
 *                 format: date
 *               cloudflareObjectKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Correspondence updated successfully
 *       400:
 *         description: Invalid correspondence, patient, or staff ID
 *       404:
 *         description: Correspondence not found
 *       500:
 *         description: Internal server error
 */
exports.updateCorrespondence = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.correspondenceId)) {
            return res.status(400).json({
                message: 'Invalid correspondence ID'
            });
        }

        const correspondence = await Correspondence.findById(
            req.params.correspondenceId
        );

        if (!correspondence) {
            return res.status(404).json({
                message: 'Correspondence not found'
            });
        }

        const {
            patientId,
            staffId,
            type,
            description,
            direction,
            date,
            cloudflareObjectKey
        } = req.body;

        if (patientId && !mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({
                message: 'Invalid patient ID'
            });
        }

        if (staffId && !mongoose.Types.ObjectId.isValid(staffId)) {
            return res.status(400).json({
                message: 'Invalid staff ID'
            });
        }

        if (typeof patientId !== 'undefined') {
            const patientExists = await Patient.findById(patientId);

             if (!patientExists) {
            return res.status(404).json({
                    message: 'Patient not found'
                });
            }
        }

        if (typeof staffId !== 'undefined') {
            const staffExists = await User.findById(staffId);

            if (!staffExists) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }
        }

        if (typeof patientId !== 'undefined') {
            correspondence.patient = patientId;
        }

        if (typeof staffId !== 'undefined') {
            correspondence.staff = staffId;
        }

        if (typeof type !== 'undefined') {
            correspondence.type = type;
        }

        if (typeof description !== 'undefined') {
            correspondence.description = description;
        }

        if (typeof direction !== 'undefined') {
            correspondence.direction = direction;
        }

        if (typeof date !== 'undefined') {
            correspondence.date = date;
        }

        if (typeof cloudflareObjectKey !== 'undefined') {
            correspondence.cloudflareObjectKey = cloudflareObjectKey;
        }

        await correspondence.save();

        return res.status(200).json({
            message: 'Correspondence updated successfully',
            correspondence
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Error updating correspondence',
            details: error.message
        });
    }
};

/**
 * @swagger
 * /api/v1/correspondence/{correspondenceId}:
 *   delete:
 *     summary: Delete a correspondence document
 *     description: Deletes a correspondence document by its ID.
 *     tags: [Correspondence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correspondenceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Correspondence ID
 *     responses:
 *       200:
 *         description: Correspondence deleted successfully
 *       400:
 *         description: Invalid correspondence ID
 *       404:
 *         description: Correspondence not found
 *       500:
 *         description: Internal server error
 */
exports.deleteCorrespondence = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.correspondenceId)) {
            return res.status(400).json({
                message: 'Invalid correspondence ID'
            });
        }

        const correspondence = await Correspondence.findById(req.params.correspondenceId);
        
        if (!correspondence) {
            return res.status(404).json({
                message: 'Correspondence not found'
            });
        }

        await correspondence.deleteOne();

        return res.status(200).json({
            message: 'Correspondence deleted successfully'
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Error deleting correspondence',
            details: error.message
        });
    }
};