const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const verifyToken = require('../middleware/verifyToken');

router.post('/', verifyToken, async (req, res) => {
  try {
    const newAlert = new Alert({
      user_id: req.user._id, 
      alert_type: req.body.alert_type,
      message: req.body.message
    });
    await newAlert.save();
    res.status(201).json(newAlert);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', verifyToken, async (req, res) => {
  try {
    const alerts = await Alert.find({ user_id: req.user._id }); 
    res.status(200).json(alerts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
