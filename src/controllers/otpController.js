const otpService = require("../services/otpService");
const User = require("../models/User");

exports.sendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const userExists = await User.findOne({ where: { email } });
    if (!userExists) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    const otp = await otpService.generateOtp(email);

    if (otp) {
      return res.status(200).json({
        message: "OTP sent successfully",
        status: true,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message, status: false });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const verified = await otpService.verifyOtp(email, otp);

    
    return res.status(200).json({
      message: "OTP verified successfully",
      status: true,
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(400).json({ message: error.message, status: false });
    }
  }
};
