const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const normalizeName = require("../utils/normalizeName");
const { OTP, generateOTP, hashOTP, otpMatches, MAX_OTP_ATTEMPTS } = require("../models/otp");
const { sendPasswordResetEmail, sendPinCodeVerificationEmail } = require('../utils/mailer');
const { findAdminOrg } = require('../services/orgService');
const { buildStaffOrgFilter } = require('../utils/staffScope');

// Roles a person may pick when signing up on their own. Admin accounts are
// never created through public registration.
const SELF_REGISTER_ROLES = ['doctor', 'nurse', 'caretaker'];
const DEFAULT_SELF_REGISTER_ROLE = 'caretaker';

// Accounts in these states may not sign in or use role-protected routes.
const BLOCKED_ACCOUNT_STATUSES = ['rejected', 'deactivated'];
exports.BLOCKED_ACCOUNT_STATUSES = BLOCKED_ACCOUNT_STATUSES;

// Same reply for an unknown email and a wrong password, so login can't be
// used to find out which emails have accounts.
const LOGIN_FAILED_MESSAGE = 'Incorrect email and password combination';

// Tokens with a "purpose" are single-use helpers (2FA step, password reset)
// and are rejected by verifyToken as normal access tokens.
const TWO_FACTOR_PURPOSE = '2fa';
const PASSWORD_RESET_PURPOSE = 'password-reset';

// When TWO_FACTOR_ENFORCED=true, roles that need 2FA get a PIN by email at
// login and only receive an access token after /verify-pin. Off by default
// until the web and Android apps have a PIN screen.
const isTwoFactorEnforced = () => String(process.env.TWO_FACTOR_ENFORCED).toLowerCase() === 'true';
const roleNeedsTwoFactor = (roleName) => String(roleName || '').toLowerCase() !== 'nurse';

// Used to spend the same time on unknown emails as on real ones.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function issueOTP(user) {
  const otp = generateOTP();
  await OTP.deleteMany({ email: user.email });
  await OTP.create({ email: user.email, otpHash: hashOTP(otp) });
  const firstName = String(user.fullname || '').split(' ')[0];
  await sendPinCodeVerificationEmail(user.email, firstName, otp);
}

function signAccessToken(user) {
  return jwt.sign(
    { _id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Registers a new user with the provided fullname, email, and password.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullname:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: Password123
 *               role:
 *                 type: string
 *                 example: nurse
 *     responses:
 *       201:
 *         description: User registered successfully.
 *       400:
 *         description: Bad request. Could be due to missing fields or an invalid email/password.
 */
exports.registerUser = async (req, res) => {
  try {
    const { fullname, email, password, role } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({
        error: 'All fields (fullname, email, password) are required'
      });
    }

    const requestedRole = typeof role === 'string' && role.trim()
      ? role.trim().toLowerCase()
      : DEFAULT_SELF_REGISTER_ROLE;

    if (!SELF_REGISTER_ROLES.includes(requestedRole)) {
      return res.status(400).json({
        error: 'Invalid role. Choose doctor, nurse or caretaker.'
      });
    }

    const userRole = await Role.findOne({ name: requestedRole });

    if (!userRole) {
      return res.status(500).json({
        error: 'Role is not set up on the server'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long.'
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        error: 'User already exists with this email'
      });
    }

    const newUser = new User({
      fullname: fullname,
      email: email,
      password_hash: password,

      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null
    });

    newUser.role = userRole._id;

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
      role: userRole.name,
    };

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      token
    });
      } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const approver = await User.findById(req.user._id);

    if (!approver) {
      return res.status(401).json({
        error: 'Logged-in user not found'
      });
    }

    if (String(approver._id) === String(user._id)) {
      return res.status(403).json({
        error: 'You cannot approve your own account'
      });
    }

    // An admin may only approve people who asked to join an organisation they run.
    let adminOrg = null;
    if (user.organization) {
      try {
        adminOrg = await findAdminOrg(approver._id, user.organization);
      } catch (err) {
        adminOrg = null;
      }
    }

    if (!adminOrg) {
      return res.status(403).json({
        error: 'User does not belong to your organization'
      });
    }

    if (user.approvalStatus !== 'pending') {
      return res.status(400).json({
        error: 'User is already approved or is not pending'
      });
    }

    user.approvalStatus = 'approved';
    user.approvedBy = approver._id;
    user.approvedAt = new Date();

    await user.save();

    return res.status(200).json({
      message: 'User approved successfully',
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        approvalStatus: user.approvalStatus,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt
      }
    });

  } catch (error) {
    console.error('Error approving user:', error);

    return res.status(500).json({
      error: error.message
    });
  }
};
 


/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in a user
 *     description: Authenticates a user with the provided email and password.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Successful login with JWT token and user information.
 *       400:
 *         description: Bad request. Incorrect email/password combination or account locked.
 */
exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      await bcrypt.compare(String(req.body.password || ''), DUMMY_PASSWORD_HASH);
      return res.status(400).json({ error: LOGIN_FAILED_MESSAGE });
    }

    if (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined && user.failedLoginAttempts > 4) {
      return res.status(400).json({ error: 'Your account has been flagged and locked. Please reset your password' });
    }

    const isValidPassword = await bcrypt.compare(req.body.password, user.password_hash);
    if (!isValidPassword) {
      user.failedLoginAttempts = (user.failedLoginAttempts !== null && user.failedLoginAttempts !== undefined) ? user.failedLoginAttempts + 1 : 1;
      await user.save();
      return res.status(400).json({ error: LOGIN_FAILED_MESSAGE });
    }

    if (BLOCKED_ACCOUNT_STATUSES.includes(user.approvalStatus)) {
      return res.status(403).json({ error: 'This account is not active. Please contact your organization admin.' });
    }

    user.failedLoginAttempts = 0;
    await user.save();

    const loginRole = await Role.findOne({ _id: user.role });

    // Second step: email a PIN and hand back a short-lived challenge token
    // instead of an access token.
    if (isTwoFactorEnforced() && roleNeedsTwoFactor(loginRole?.name)) {
      await issueOTP(user);
      const challengeToken = jwt.sign(
        { _id: user._id, purpose: TWO_FACTOR_PURPOSE },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.status(200).json({
        twoFactorRequired: true,
        challengeToken,
        message: 'A PIN has been sent to your email address'
      });
    }

    const token = signAccessToken(user);

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


/**
 * @swagger
 * /api/v1/auth/send-pin:
 *   post:
 *     summary: Send OTP for email verification
 *     description: Generates an OTP and sends it to the user's email for verification.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *     responses:
 *       200:
 *         description: OTP sent to your email address.
 *       400:
 *         description: Bad request. Email is required.
 *       500:
 *         description: Internal server error. Error processing the request.
 */
exports.sendOTP = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Same reply whether or not the email has an account.
  const genericReply = { message: 'If that email has an account, a PIN has been sent to it' };

  try {
    const user = await User.findOne({ email });
    if (user && !BLOCKED_ACCOUNT_STATUSES.includes(user.approvalStatus)) {
      await issueOTP(user);
    }
    return res.status(200).json(genericReply);
  } catch (error) {
    console.error('Error saving OTP or sending email:', error.message);
    return res.status(500).json({ error: 'Error processing your request' });
  }
};


/**
 * @swagger
 * /api/v1/auth/verify-pin:
 *   post:
 *     summary: Verify OTP
 *     description: Verifies the OTP sent to the user's email address.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               otp:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: OTP verified successfully.
 *       400:
 *         description: Bad request. Email and OTP are required or invalid/expired OTP.
 *       500:
 *         description: Internal server error. Error processing the request.
 */
exports.verifyOTP = async (req, res) => {
  const { email, otp, challengeToken } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const invalid = () => res.status(400).json({ error: 'Invalid or expired OTP' });
  const expired = () => res.status(401).json({ error: 'Login session expired. Please log in again.' });

  try {
    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) return invalid();

    if (!otpMatches(otp, otpRecord.otpHash)) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        await OTP.deleteOne({ _id: otpRecord._id });
      } else {
        await otpRecord.save();
      }
      return invalid();
    }

    // Each code works once.
    await OTP.deleteOne({ _id: otpRecord._id });

    // Without a challenge token this only confirms the email address.
    if (!challengeToken) {
      return res.status(200).json({ message: 'OTP verified successfully' });
    }

    // With a challenge token from /login, finish signing in.
    let challenge;
    try {
      challenge = jwt.verify(challengeToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return expired();
    }

    const user = await User.findById(challenge._id);
    if (challenge.purpose !== TWO_FACTOR_PURPOSE || !user || user.email !== email
      || BLOCKED_ACCOUNT_STATUSES.includes(user.approvalStatus)) {
      return expired();
    }

    const userRole = await Role.findOne({ _id: user.role });
    return res.status(200).json({
      message: 'OTP verified successfully',
      token: signAccessToken(user),
      user: {
        id: user._id,
        fullname: user.fullname,
        email: user.email,
        lastPasswordChange: user.lastPasswordChange,
        created_at: user.created_at,
        updated_at: user.updated_at,
        role: userRole?.name,
      }
    });
  } catch (error) {
    console.error('Error verifying OTP:', error.message);
    return res.status(500).json({ error: 'Error processing your request' });
  }
};


/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change a user's password
 *     description: Allows a user to change their password by providing the old and new passwords.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: OldPassword123
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *               confirmPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *       400:
 *         description: Bad request. Incorrect old password or new passwords don't match.
 */
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


/**
 * @swagger
 * /api/v1/auth/reset-password-request:
 *   post:
 *     summary: Request a password reset
 *     description: Sends a password reset link to the user's email.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *     responses:
 *       200:
 *         description: Password reset link sent to the user's email.
 *       404:
 *         description: User not found.
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please provide an email' });
    }

    const user = await User.findOne({ email });

    // Same reply whether or not the email has an account.
    if (user) {
      const token = jwt.sign(
        { _id: user._id, purpose: PASSWORD_RESET_PURPOSE },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const firstName = user.fullname.split(" ")[0];

      // Send the token to the user's email
      await sendPasswordResetEmail(email, firstName, token);
    }

    res.status(200).json({ message: 'If that email has an account, a password reset link has been sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   get:
 *     summary: Render password reset page
 *     description: Renders a page for resetting the password using a valid reset token.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         description: JWT reset token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Renders the password reset page.
 *       400:
 *         description: Invalid or expired token.
 */
exports.renderPasswordResetPage = (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Only password-reset tokens may open this page, not login tokens.
    if (!decoded || decoded.purpose !== PASSWORD_RESET_PURPOSE) {
      return res.status(400).send('Invalid or expired token');
    }

    // If everything is valid, render the reset password form
    res.render('reset-password', { token });
  } catch (error) {
    res.status(400).send({ error: 'Invalid or expired token' });
  }
};


/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     description: Resets the user's password using the reset token.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 example: "JWT_TOKEN_HERE"
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123
 *               confirmPassword:
 *                 type: string
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password has been updated successfully.
 *       400:
 *         description: Invalid or expired token, or passwords don't match.
 */
exports.resetPassword = async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  try {
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    // Only password-reset tokens can set a new password, not login tokens.
    const user = decoded && decoded.purpose === PASSWORD_RESET_PURPOSE
      ? await User.findById(decoded._id)
      : null;

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
      

        // Only search people in the caller's own organization(s)
        const orgFilter = await buildStaffOrgFilter(req.user._id);
        if (!orgFilter) {
            return res.status(404).json({
                success: false,
                message: "No users found."
            });
        }

        const users = await User.find(orgFilter, "_id fullname organization").lean();
// First check whether the search text matches a user ID
const userById = users.find(
    user => String(user._id) === search.trim()
);

if (userById) {
    return res.status(200).json({
        success: true,
        count: 1,
        users: [
            {
                userId: userById._id,
                fullname: userById.fullname
            }
        ]
    });
}


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