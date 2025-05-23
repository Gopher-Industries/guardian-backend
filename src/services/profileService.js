async function formatUserProfile(user) {
  return {
    id: user._id,
    name: user.name || user.fullname,
    email: user.email,
    role: user.role,
    lastPasswordChange: user.lastPasswordChange,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

module.exports = { formatUserProfile };