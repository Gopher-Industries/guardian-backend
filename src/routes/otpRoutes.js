const express = require("express");
const otpController = require("../controllers/otpController");

const router = express.Router();

router.post("/sendOtp", otpController.sendOtp);
router.post("/verifyOtp", otpController.verifyOtp);

module.exports = router;
