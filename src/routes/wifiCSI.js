const express = require('express');
const router = express.Router();
const WifiCSI = require('../models/WifiCSI');
const verifyToken = require('../middleware/verifyToken');

router.post('/', verifyToken, async (req, res) => {
  try {
    const newWifiCSI = new WifiCSI({
      user_id: req.user._id, 
      timestamp: req.body.timestamp,
      csi_data: req.body.csi_data
    });
    await newWifiCSI.save();
    res.status(201).json(newWifiCSI);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', verifyToken, async (req, res) => {
  try {
    const data = await WifiCSI.find({ user_id: req.user._id });
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
