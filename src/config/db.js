// config/db.js
require('dotenv').config();
const mongoose = require('mongoose');

const mongoDBUrl = process.env.MONGODB_URL;

mongoose.set("strictQuery", false);
mongoose.connect(mongoDBUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

module.exports = mongoose;
