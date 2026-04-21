const express = require('express');
const router = express.Router();
const carePlanController = require('../controllers/carePlanController');
const verifyToken = require('../middleware/verifyToken');

router.post('/', verifyToken, carePlanController.createCarePlan);
router.put('/:carePlanId', verifyToken, carePlanController.updateCarePlan);
router.get('/patient/:patientId', verifyToken, carePlanController.getCarePlanByPatient);

module.exports = router;
