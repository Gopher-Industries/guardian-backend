/**
 * Test database helper.
 *
 * Zero-setup by default: if no external MongoDB is configured, this spins up an
 * in-memory MongoDB (mongodb-memory-server) automatically, so `npm test` works
 * without Docker or a running database. To use your own MongoDB instead, set
 * TEST_MONGODB_URI (or MONGODB_URI) and that connection is used verbatim.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const mongoose = require('mongoose');

// An explicitly configured connection wins; otherwise we self-provision.
const EXTERNAL_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || '';
const LOCAL_FALLBACK = 'mongodb://admin:password@localhost:27018/guardian_test?authSource=admin';

// Exported for any code/tests that reference it (kept for backwards compat).
const TEST_MONGODB_URI = EXTERNAL_URI || LOCAL_FALLBACK;

let mongoMemory = null;   // the in-memory server instance, when used
let resolvedUri = null;   // the URI we actually connected to

/**
 * Decides which MongoDB URI to connect to:
 *   1. an explicit external URI, if provided; otherwise
 *   2. an in-memory MongoDB (downloaded/cached on first use); otherwise
 *   3. the conventional local docker mongo on :27018.
 */
async function resolveUri() {
  if (resolvedUri) return resolvedUri;
  if (EXTERNAL_URI) {
    resolvedUri = EXTERNAL_URI;
    return resolvedUri;
  }

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoMemory = await MongoMemoryServer.create();
    resolvedUri = mongoMemory.getUri();
  } catch (error) {
    // No in-memory server available (offline binary download, etc.):
    // fall back to a conventional local MongoDB.
    // eslint-disable-next-line no-console
    console.warn(
      `[test-db] in-memory MongoDB unavailable (${error.message}); ` +
        `falling back to ${LOCAL_FALLBACK}. Set TEST_MONGODB_URI to override.`
    );
    resolvedUri = LOCAL_FALLBACK;
  }

  return resolvedUri;
}

async function waitForConnectingConnection() {
  if (mongoose.connection.readyState !== 2) return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out while waiting for MongoDB connection')), 15000);
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

  const uri = await resolveUri();

  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 8000,
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
  if (mongoMemory) {
    await mongoMemory.stop();
    mongoMemory = null;
  }
  resolvedUri = null;
}

module.exports = {
  TEST_MONGODB_URI,
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
};
