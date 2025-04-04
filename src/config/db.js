require('dotenv').config();
const mongoose = require('mongoose');

const mongoDBUrl = process.env.MONGODB_URI;

mongoose.set("strictQuery", false);

const connectDB = async () => {
  try {
    await mongoose.connect(mongoDBUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1); // Exit with failure code
  }
};

connectDB();
module.exports = mongoose;
