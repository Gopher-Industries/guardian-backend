// config/db.js
require('dotenv').config();
const mongoose = require('mongoose');
const seedRoles = require('../seedRoles');

const mongoDBUrl = process.env.MONGODB_URL || "mongodb://mongo:gAeHtarfcSqbwPXWfTfFApmKsDEjlMXm@junction.proxy.rlwy.net:15841";

mongoose.set("strictQuery", false);
mongoose.connect(mongoDBUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    console.log('MongoDB connected successfully');

    // Seed roles when the server starts
    await seedRoles();
  })
  .catch(err => console.error('MongoDB connection error:', err));

module.exports = mongoose;

