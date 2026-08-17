const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const normalizeName = require("../utils/normalizeName")
const { OTP, generateOTP } = require('../models/OTP');
const { sendPasswordResetEmail, sendPinCodeVerificationEmail } = require('../utils/mailer');


exports.registerUser = async (req, res) => {
  try {
    const { fullname, email, password, role } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({ error: 'All fields (fullname, email, password) are required' });
    }

    var userRole;
    if (role) {
      userRole = await Role.findOne({ name: role.toLowerCase() });
      if (!userRole) {
        return res.status(400).json({ error: role + ' is an invalid role' });
      }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    // Check if the password is at least 6 characters long
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const newUser = new User({
      fullname: fullname,
      email: email,
      password_hash: password
    });

    if (userRole) {
      newUser.role = userRole._id;
    }

    await newUser.save();

    const token = jwt.sign(
      { _id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const userResponse = {
      id: newUser._id,
      fullname: newUser.fullname,
      email: newUser.email,
    };

    if (userRole) {
      userResponse.role = userRole.name;
    }

    res.status(201).json({ message: 'User registered successfully', user: userResponse, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};



exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    if (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined && user.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    const isValidPassword = await bcrypt.compare(req.body.password, user.password_hash);
    if (!isValidPassword) {
      user.failedLoginAttempts = (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined) ? user.failedLoginAttempts + 1 : 1;
      await user.save();
      return res.status(400).json({ error: 'Incorrect email and password combination' });
    }

    user.failedLoginAttempts = 0;
    await user.save();

    const token = jwt.sign(
      { _id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const currentDate = new Date();
    const lastChangeDate = new Date(user.lastPasswordChange);

    const timeDifference = currentDate.getTime() - lastChangeDate.getTime();
    const daysSinceLastChange = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    const daysRemaining = 90 - daysSinceLastChange;

    const userRole = await Role.findOne({ _id: user.role });

    const userResponse = {
      id: user._id,
      fullname: user.fullname,
      email: user.email,
      lastPasswordChange: user.lastPasswordChange,
      created_at: user.created_at,
      updated_at: user.updated_at,
      role: userRole.name,
      twoFactorRequired: userRole.name.toLowerCase() !== 'nurse' // Add twoFactorRequired field
    };

    const response = { user: userResponse, token };

    if (daysRemaining <= 5) {
      response.passwordExpiryReminder = `Your password will expire in ${daysRemaining} days. Please change it soon.`;
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};



exports.sendOTP = async (req, res) => {
    // Temporary bypass for OTP
    return res.status(200).json({ message: 'OTP functionality is temporarily disabled for testing.' });

    // Original OTP logic (inactive due to the testing )
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = await User.findOne({ email: email });
  if (!user) return res.status(400).json({ error: 'User not found' });

  // Generate OTP
  const otp = generateOTP();

  try {
    // Remove any existing OTPs for this email (useful to avoid duplicates)
    await OTP.deleteMany({ email });

    // Create new OTP entry
    const otpEntry = new OTP({ email, otp });
    await otpEntry.save();

    console.log("user full name is: " + user.fullname);
    console.log("user first name is: " + user.fullname.split(" ")[0]);
    console.log("user first[0] name is: " + user.fullname.split(" "));

    const firstName = user.fullname.split(" ")[0];

    // Send OTP email
    await sendPinCodeVerificationEmail(email, firstName, otp);
    res.status(200).json({ message: 'OTP sent to your email address' });
  } catch (error) {
    console.error('Error saving OTP or sending email:', error);
    res.status(500).json({ error: 'Error processing your request' });
  }
};



exports.verifyOTP = async (req, res) => {
    // Temporary bypass for OTP verification
    return res.status(200).json({ message: 'OTP verification bypassed for testing.' });

    // Original OTP verification logic (inactive due to testing)
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // Find the OTP record in the database
    const otpRecord = await OTP.findOne({ email, otp });

    // If no record is found, OTP is invalid or expired
    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Remove the OTP entry after successful verification
    await OTP.deleteOne({ _id: otpRecord._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Error processing your request' });
  }
};



exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).send({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);

    if (!isValidPassword) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    user.password_hash = newPassword;
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};



exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please provide an email' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // TODO? Maybe we should consider returning a success message so attackers can't brute force to find valid email addresses
      return res.status(404).send({ error: 'User not found' });
    }

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    const firstName = user.fullname.split(" ")[0];

    // Send the token to the user's email
    await sendPasswordResetEmail(email, firstName, token);
    res.status(200).json({ message: 'Password reset link sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};



exports.renderPasswordResetPage = (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(400).send('Invalid or expired token');
    }

    // If everything is valid, render the reset password form
    res.render('reset-password', { token });
  } catch (error) {
    res.status(400).send({ error: 'Invalid or expired token' });
  }
};



exports.resetPassword = async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  try {
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);

    if (!user) {
      return res.status(400).send({ error: 'Invalid token or user not found.' });
    }

    user.password_hash = newPassword;
    user.lastPasswordChange = Date.now();
    user.failedLoginAttempts = 0;
    await user.save();

    res.status(200).json({ message: 'Password has been updated successfully' });
  } catch (error) {
    res.status(400).send({ error: 'Invalid or expired token' });
  }
};

exports.searchUser = async (req, res) => {
        try {

        const { search } = req.query;

        // Validate input
        if (!search || search.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Search text is required."
            });
        }

        // Normalize search string
        const normalizedSearch = normalizeName(search);
        

        // Split search into individual words
        const searchTokens = normalizedSearch
    .split(" ")
    .filter(token => token.length > 0);
      

         // Fetch all users
const users = await User.find({}, "_id fullname organization").lean();


        // Find all matching users
        const matchedUsers = users.filter((user) => {

            if (!user.fullname) return false;

            const normalizedStoredName = normalizeName(user.fullname);

const storedTokens = normalizedStoredName.split(" ");
const matches = searchTokens.every((token) => {
    return storedTokens.includes(token);
});
return matches;
        });
        

        // No users found
        if (matchedUsers.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No users found."
            });
        }

        // Return matching users
        return res.status(200).json({
            success: true,
            count: matchedUsers.length,
            users: matchedUsers.map((user) => ({
                userId: user._id,
                fullname: user.fullname
            }))
        });

    } catch (error) {
        console.error("Search user failed:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};