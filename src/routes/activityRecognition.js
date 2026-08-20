const express = require('express');
const router = express.Router();

const ActivityRecognition = require('../models/ActivityRecognition');
const verifyToken = require('../middleware/verifyToken');

const {
  buildScopedRecordFilter,
  validateAccessiblePatient
} = require('../utils/patientAccess');

const {
  createAndEmit
} = require('../services/notificationService');


async function applyPatientFromBody(req, data) {
  const { patientId } = req.body;

  if (!patientId) {
    return { ok: true };
  }

  const access = await validateAccessiblePatient(
    req.user._id,
    patientId
  );

  if (!access.ok) {
    return access;
  }

  data.patient = access.patient._id;

  return {
    ok: true,
    patient: access.patient
  };
}


/**
 * @swagger
 * /api/v1/activity-recognition:
 *   post:
 *     summary: Create an activity recognition record and frontend notification
 *     tags: [ActivityRecognition]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activity_type
 *               - confidence
 *               - detected_at
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: 64f1a2b3c4d5e6f789012345
 *                 description: Optional accessible patient ObjectId to link this activity record to a patient.
 *
 *               wifi_csi_id:
 *                 type: string
 *                 example: 64f1a2b3c4d5e6f789012346
 *                 description: Optional WifiCSI ObjectId linked to this activity record.
 *
 *               activity_type:
 *                 type: string
 *                 example: standing
 *
 *               confidence:
 *                 type: number
 *                 example: 0.97
 *
 *               detected_at:
 *                 type: string
 *                 format: date-time
 *
 *     responses:
 *       201:
 *         description: Activity recognition record created and notification sent successfully.
 *
 *       400:
 *         description: Invalid request.
 *
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *
 *       404:
 *         description: Patient not found.
 */


router.post(
  '/',
  verifyToken,
  async (req, res) => {

    try {

      const {
        wifi_csi_id,
        activity_type,
        confidence,
        detected_at
      } = req.body;


      // -----------------------------------------
      // Validate required fields
      // -----------------------------------------

      if (!activity_type) {

        return res.status(400).json({
          error: 'activity_type is required'
        });

      }


      if (
        confidence === undefined ||
        confidence === null
      ) {

        return res.status(400).json({
          error: 'confidence is required'
        });

      }


      if (!detected_at) {

        return res.status(400).json({
          error: 'detected_at is required'
        });

      }


      // -----------------------------------------
      // Build activity record
      // -----------------------------------------

      const activityData = {

        user_id:
          req.user._id,

        wifi_csi_id:
          wifi_csi_id,

        activity_type:
          activity_type,

        confidence:
          confidence,

        detected_at:
          detected_at

      };


      // -----------------------------------------
      // Optional patient validation
      // -----------------------------------------

      const patientAccess =
        await applyPatientFromBody(
          req,
          activityData
        );


      if (!patientAccess.ok) {

        return res
          .status(patientAccess.status)
          .json({
            error: patientAccess.error
          });

      }


      // -----------------------------------------
      // Save Activity Recognition record
      // -----------------------------------------

      const newActivity =
        new ActivityRecognition(
          activityData
        );


      await newActivity.save();


      console.log('');
      console.log(
        '===== ACTIVITY RECOGNITION ====='
      );

      console.log(
        'Activity ID:',
        newActivity._id
      );

      console.log(
        'Activity:',
        newActivity.activity_type
      );

      console.log(
        'Confidence:',
        newActivity.confidence
      );

      console.log(
        'Detected At:',
        newActivity.detected_at
      );

      console.log(
        '================================'
      );


      // -----------------------------------------
      // Build notification
      // -----------------------------------------

      const confidencePercent =
        Math.round(
          Number(confidence) * 100
        );


      let patientText =
        'the monitored patient';


      if (
        patientAccess.patient &&
        patientAccess.patient.name
      ) {

        patientText =
          patientAccess.patient.name;

      }


      const notificationTitle =
        'Activity Recognition';


      const notificationMessage =
        `Guardian AI detected "${activity_type}" ` +
        `for ${patientText} ` +
        `with ${confidencePercent}% confidence.`;


      // -----------------------------------------
      // Notification recipient
      //
      // For now we notify the authenticated user
      // who submitted the classifier result.
      // -----------------------------------------

      const notification =
        await createAndEmit(

          req.user._id,

          notificationTitle,

          notificationMessage

        );


      console.log(
        'Activity notification created:',
        notification._id
      );


      console.log(
        '================================'
      );

      console.log('');


      // -----------------------------------------
      // Return both records
      // -----------------------------------------

      return res
        .status(201)
        .json({

          message:
            'Activity recognition record saved and notification created successfully.',

          activity:
            newActivity,

          notification:
            notification

        });


    } catch (error) {

      console.error(
        'Activity Recognition POST error:',
        error
      );


      return res
        .status(error.status || 400)
        .json({

          error:
            error.message

        });

    }

  }
);


/**
 * @swagger
 * /api/v1/activity-recognition:
 *   get:
 *     summary: Get activity recognition records
 *     tags: [ActivityRecognition]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional accessible patient ObjectId used to filter linked activity recognition records.
 *
 *     responses:
 *       200:
 *         description: List of activity recognition records.
 *
 *       400:
 *         description: Invalid patientId format.
 *
 *       403:
 *         description: Patient is not accessible to the authenticated user.
 *
 *       404:
 *         description: Patient not found.
 */


router.get(
  '/',
  verifyToken,
  async (req, res) => {

    try {

      const {
        patientId
      } = req.query;


      const scopedFilter =
        await buildScopedRecordFilter(
          req.user._id,
          patientId
        );


      if (!scopedFilter.ok) {

        return res
          .status(scopedFilter.status)
          .json({

            error:
              scopedFilter.error

          });

      }


      const activities =
        await ActivityRecognition.find(
          scopedFilter.filter
        );


      return res
        .status(200)
        .json(
          activities
        );


    } catch (error) {

      console.error(
        'Activity Recognition GET error:',
        error
      );


      return res
        .status(error.status || 400)
        .json({

          error:
            error.message

        });

    }

  }
);


module.exports = router;