const { LRUCache } = require('lru-cache');
const mongoose = require('mongoose');

const LINK = process.env.MONGO_URI;

const connectionCache = new LRUCache({
  max: 40,
  ttl: 1000 * 60 * 60,
  dispose: async (connection, dbName) => {
    if (connection && typeof connection.close === 'function') {
      await connection.close();
    } else {
      console.warn(`Wrong dbName ${dbName}`);
    }
  },
});

const getDatabaseConnection = async (dbName) => {
  if (connectionCache.has(dbName)) {
    return connectionCache.get(dbName);
  }
  const connection = await mongoose
    .createConnection(LINK, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
    .asPromise();

  logger.info(`connected to database ---${dbName}`);
  connectionCache.set(dbName, connection);
  return connection;
};

const getModel = async (DbName, modelName, schema) => {
  const db = await getDatabaseConnection(DbName);
  return db.model(modelName, schema);
};

module.exports = { getModel, getDatabaseConnection };
