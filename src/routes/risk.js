const router = require('express').Router();
const verifyToken = require('../middleware/verifyToken');
const { assessHumpty, latestHumpty } = require('../controllers/riskController');

router.post('/risk/humpty-dumpty/assess', verifyToken, assessHumpty);
router.get('/risk/humpty-dumpty/latest', verifyToken, latestHumpty);

module.exports = router;
