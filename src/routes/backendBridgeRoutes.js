const express = require('express');
const router = express.Router();

const BackendBridgeAlert = require(
  '../models/BackendBridgeAlert'
);


/**
 * @swagger
 * tags:
 *   name: BackendBridge
 *   description: Guardian AI Backend Bridge API
 */


/**
 * @swagger
 * /api/v1/backend-bridge:
 *   post:
 *     summary: Store a Backend Bridge AI alert
 *     tags: [BackendBridge]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject_id
 *               - final_alert
 *               - raw_data
 *             properties:
 *               subject_id:
 *                 type: string
 *                 example: PATIENT_001
 *
 *               note_id:
 *                 type: string
 *                 example: NOTE_001
 *
 *               model:
 *                 type: string
 *                 example: TF-IDF
 *
 *               final_alert:
 *                 type: string
 *                 example: High
 *
 *               combined_score:
 *                 type: number
 *                 example: 0.91
 *
 *               text_concern:
 *                 type: object
 *                 additionalProperties: true
 *
 *               vitals_risk:
 *                 type: object
 *                 additionalProperties: true
 *
 *               anomaly_flag:
 *                 type: boolean
 *                 example: true
 *
 *               anomaly_type:
 *                 type: string
 *                 example: High text concern with stable vitals
 *
 *               borderline:
 *                 type: boolean
 *                 example: false
 *
 *               explanation:
 *                 type: string
 *                 example: High concern detected by Guardian AI.
 *
 *               raw_data:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Complete prediction row received from the AI pipeline.
 *
 *     responses:
 *       201:
 *         description: Backend Bridge alert saved successfully
 *
 *       400:
 *         description: Missing required fields
 *
 *       500:
 *         description: Server error
 */


router.post(
  '/',
  async (req, res) => {

    try {

      const {
        subject_id,
        note_id,
        model,
        final_alert,
        combined_score,
        text_concern,
        vitals_risk,
        anomaly_flag,
        anomaly_type,
        borderline,
        explanation,
        raw_data
      } = req.body;


      if (!subject_id) {

        return res.status(400).json({
          error: 'subject_id is required'
        });

      }


      if (!final_alert) {

        return res.status(400).json({
          error: 'final_alert is required'
        });

      }


      if (!raw_data) {

        return res.status(400).json({
          error: 'raw_data is required'
        });

      }


      const bridgeAlert =
        new BackendBridgeAlert({

          subject_id,

          note_id,

          model,

          final_alert,

          combined_score,

          text_concern,

          vitals_risk,

          anomaly_flag,

          anomaly_type,

          borderline,

          explanation,

          // Complete row from Python
          raw_data

        });


      const savedAlert =
        await bridgeAlert.save();


      console.log('');
      console.log(
        '===== BACKEND BRIDGE ALERT ====='
      );

      console.log(
        'MongoDB ID:',
        savedAlert._id
      );

      console.log(
        'Subject:',
        savedAlert.subject_id
      );

      console.log(
        'Final Alert:',
        savedAlert.final_alert
      );

      console.log(
        'Recorded At:',
        savedAlert.recorded_at
      );

      console.log(
        'Raw fields stored:',
        Object.keys(
          savedAlert.raw_data || {}
        ).length
      );

      console.log(
        '================================'
      );

      console.log('');


      return res.status(201).json({

        message:
          'Backend Bridge alert saved successfully',

        alert:
          savedAlert

      });


    } catch (error) {

      console.error(
        'Backend Bridge POST error:',
        error
      );


      return res.status(500).json({

        error:
          'Failed to save Backend Bridge alert',

        details:
          error.message

      });

    }

  }
);


/**
 * @swagger
 * /api/v1/backend-bridge:
 *   get:
 *     summary: Get Backend Bridge AI alerts
 *     tags: [BackendBridge]
 *     responses:
 *       200:
 *         description: List of Backend Bridge alerts
 *       500:
 *         description: Server error
 */


router.get(
  '/',
  async (req, res) => {

    try {

      const alerts =
        await BackendBridgeAlert
          .find()
          .sort({
            recorded_at: -1
          });


      return res.status(200).json({
        count: alerts.length,
        alerts
      });


    } catch (error) {

      console.error(
        'Backend Bridge GET error:',
        error
      );


      return res.status(500).json({

        error:
          'Failed to retrieve Backend Bridge alerts',

        details:
          error.message

      });

    }

  }
);


module.exports = router;