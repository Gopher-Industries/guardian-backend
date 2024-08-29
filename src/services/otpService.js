const crypto = require("crypto");
const { Op } = require("sequelize");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const moment = require("moment");

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: false,
  auth: {
    user: process.env.APP_EMAIL,
    pass: process.env.APP_PASS,
  },
});

exports.generateOtp = async (email) => {
  const user = await User.findOne({ where: { email } });

  const currentTime = new Date();

  // Check if OTP generation is disabled due to previous failed attempts
  if (user?.otpDisabledTime && currentTime < user.otpDisabledTime) {
    const remainingTime = Math.ceil(
      (user.otpDisabledTime - currentTime) / 1000
    );
    throw new Error(
      `OTP generation is disabled. Try again in ${remainingTime} seconds.`
    );
  }

  // Generate a new OTP
  const otp = Math.floor(100000 + Math.random() * 900000);

  // Set expiry time (1 minute from now)
  const otpExpiry = new Date(Date.now() + 1 * 60 * 1000);

  // Update the user record with the OTP and expiry
  await User.update(
    { otp, otpExpiry, otpRetries: 2, otpDisabledTime: null },
    { where: { email } }
  );

  // Send OTP via email
  const mailOptions = {
    from: process.env.APP_EMAIL,
    to: email,
    subject: "OTP for Verification",
    text: `Your OTP is ${otp}. It will expire in 60 seconds.`,
  };
  await transporter.sendMail(mailOptions);

  return otp;
};

exports.verifyOtp = async (email, submittedOtp) => {
  try {
    const user = await User.findOne({ where: { email } });
    submittedOtp = parseInt(submittedOtp, 10);

    if (!user) {
      throw new Error("User not found");
    }

    const currentTime = new Date();

    // Check if the OTP has expired
    const otpExpiry = new Date(user.otpExpiry);

    // Log the expiry and current times for debugging
    console.log("OTP EXPIRY DATE:", otpExpiry);
    console.log("Current time:", currentTime);

    if (otpExpiry < currentTime) {
      throw new Error("OTP has expired");
    }

    // Check if the OTP matches
    if (user.otp !== submittedOtp) {
      let retriesLeft = user.otpRetries - 1;

      if (retriesLeft <= 0) {
        // Set the OTP disabled time to 2 minutes from now
        const otpDisabledTime = new Date(Date.now() + 2 * 60 * 1000);

        await User.update(
          { otpRetries: 0, otpDisabledTime },
          { where: { email } }
        );

        throw new Error(
          "Invalid OTP. No retries left. OTP generation disabled for 2 minutes."
        );
      } else {
        // Decrease the retries left
        await User.update(
          { otpRetries: retriesLeft },
          { where: { email } }
        );
        throw new Error(`Invalid OTP. You have ${retriesLeft} retries left.`);
      }
    }

    // OTP is valid, clear it from the database
    await User.update(
      { otp: null, otpExpiry: null, otpRetries: 0, otpDisabledTime: null },
      { where: { email } }
    );

    return true;
  } catch (e) {
    console.error(e);
    throw e;
  }
};
