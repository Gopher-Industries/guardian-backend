
const Role = require('../models/Role');
const User = require('../models/User');

// POST /api/v1/admin/bootstrap
// Only allowed when there are NO admin users and header X-Install-Token matches INSTALL_TOKEN
exports.bootstrapAdmin = async (req, res) => {
  try {
    // Check if any admin user exists
    const adminRole = await Role.findOne({ name: 'admin' });
    if (adminRole) {
      const count = await User.countDocuments({ role: adminRole._id });
      if (count > 0) {
        return res.status(403).json({
          type: 'about:blank', title: 'Bootstrap disabled (admins exist)', status: 403,
          detail: 'Bootstrap disabled (admins exist)', instance: '/api/v1/admin/bootstrap'
        });
      }
    }

    const token = req.header('X-Install-Token');
    if (!token || token !== process.env.INSTALL_TOKEN) {
      return res.status(401).json({ type: 'about:blank', title: 'Invalid install token', status: 401, detail: 'Invalid install token' });
    }

    const { fullname, email, password } = req.body || {};
    if (!fullname || !email || !password) {
      return res.status(422).json({ error: 'fullname, email and password are required' });
    }

    const minLen = parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10);
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNum   = /[0-9]/.test(password);
    const hasSym   = /[^A-Za-z0-9]/.test(password);
    if (!(password.length >= minLen && hasLower && hasUpper && hasNum && hasSym)) {
      return res.status(422).json({ error: `Password must be at least ${minLen} chars and include upper, lower, number, and symbol` });
    }
    const parts = String(email).toLowerCase().split(/[@._-]+/).filter(Boolean);
    const pl = password.toLowerCase();
    if (parts.some(p => p.length >= 3 && pl.includes(p))) {
      return res.status(422).json({ error: 'Password must not contain parts of the email' });
    }

    const exists = await User.findOne({ email: String(email).toLowerCase() }).lean();
    if (exists) return res.status(409).json({ error: 'Email already exists' });

    // Ensure role exists
    let role = await Role.findOne({ name: 'admin' });
    if (!role) role = await Role.create({ name: 'admin' });

    const user = new User({
      fullname,
      email: String(email).toLowerCase(),
      password_hash: password, // hashed by pre-save
      role: role._id
    });
    await user.save();

    return res.status(201).json({
      message: 'Bootstrap admin created. Share credentials out-of-band and rotate on first login.',
      admin: {
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        role: 'admin',
        failedLoginAttempts: user.failedLoginAttempts,
        lastPasswordChange: user.lastPasswordChange,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (e) {
    console.error('bootstrapAdmin error:', e);
    return res.status(500).json({ error: 'Bootstrap failed' });
  }
};
