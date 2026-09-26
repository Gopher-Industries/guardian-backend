const express = require('express');
const router = express.Router();
const BlobStoreController = require('../controllers/BlobStoreController');

/** 
 * @openapi
 * /api/v1/blob_store/upload-url:
 *   post:
 *     tags:
 *       - BLOB STORE
 *     summary: Get a presigned upload URL for a document.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - fileName
 *               - documentType
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: "6a3f8ea9c14556091e6e0e50"
 *               fileName:
 *                 type: string
 *                 example: "referral.pdf"
 *               documentType:
 *                 type: string
 *                 enum: [referrals, letters, specialist-reports]
 *                 example: "referrals"
 *     responses:
 *       200:
 *         description: Presigned upload URL generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 objectKey:
 *                   type: string
 *                 url:
 *                   type: string
 */
router.post('/upload-url', BlobStoreController.HandleFileUploadUrl);


/** 
 * @openapi
 * /api/v1/blob_store/download-url:
 *   get:
 *     tags:
 *       - BLOB STORE
 *     summary: Get a presigned download URL for a document.
 *     parameters:
 *       - in: query
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         example: "6a3f8ea9c14556091e6e0e50"
 *       - in: query
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         example: "referral.pdf"
 *       - in: query
 *         name: documentType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [referrals, letters, specialist-reports]
 *         example: "referrals"
 *       - in: query
 *         name: contentType
 *         required: false
 *         schema:
 *           type: string
 *         example: "application/pdf"
 *     responses:
 *       200:
 *         description: Presigned download URL generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 objectKey:
 *                   type: string
 *                 url:
 *                   type: string
 *       404:
 *         description: Referral file not found.
 *       500:
 *         description: File download failed.
 */
router.get('/download-url', BlobStoreController.HandleFileDownload);

/**
 * @openapi
 * /api/v1/blob_store/list:
 *   get:
 *     tags:
 *       - BLOB STORE
 *     summary: List stored documents.
 *     description: >
 *       Lists documents in R2 storage. If patientId is provided, results are
 *       scoped to that patient's folder; otherwise all objects are returned.
 *     parameters:
 *       - in: query
 *         name: patientId
 *         required: false
 *         schema:
 *           type: string
 *         example: "6a3f8ea9c14556091e6e0e50"
 *     responses:
 *       200:
 *         description: List of matching objects.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 Result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                       size:
 *                         type: number
 *                       lastModified:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Not a valid patient ID.
 *       500:
 *         description: Failed to list referrals.
 */
router.get('/list', BlobStoreController.List);

/** 
 * @openapi
 * /api/v1/blob_store/no_url_upload:
 *   post:
 *     tags:
 *       - BLOB STORE
 *     summary: Generate a referral PDF server-side and upload it directly to storage.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - fileName
 *               - data
 *             properties:
 *               patientId:
 *                 type: string
 *                 example: "6a3f8ea9c14556091e6e0e50"
 *               fileName:
 *                 type: string
 *                 example: "referral.pdf"
 *               data:
 *                 type: object
 *                 description: Data used to generate the referral PDF.
 *     responses:
 *       200:
 *         description: Referral generated and uploaded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 objectKey:
 *                   type: string
 *       400:
 *         description: Missing patientId, fileName, or data.
 *       404:
 *         description: Not a valid patient ID.
 *       500:
 *         description: Failed to generate and upload referral.
 */
router.post('/no_url_upload', BlobStoreController.HandleGenerateReferral);

module.exports = router;