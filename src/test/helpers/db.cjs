process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const mongoose = require('mongoose');

const TEST_MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27018/guardian_test?authSource=admin';

async function waitForConnectingConnection() {
  if (mongoose.connection.readyState !== 2) return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out while waiting for MongoDB connection')), 10000);
    mongoose.connection.once('connected', () => {
      clearTimeout(timer);
      resolve();
    });
    mongoose.connection.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function connectTestDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2) {
    await waitForConnectingConnection();
    return mongoose.connection;
  }

  await mongoose.connect(TEST_MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  });

  return mongoose.connection;
}

async function clearTestDb() {
  await connectTestDb();
  await mongoose.connection.db.dropDatabase();
}

async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  TEST_MONGODB_URI,
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
};
