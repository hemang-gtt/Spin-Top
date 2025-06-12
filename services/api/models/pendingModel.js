const mongoose = require('mongoose');
const { getModel } = require('../../DB/index');

const pendingSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  clientId: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Number,
  },
  transactionId: {
    type: String,
  },
  request: {
    type: String,
  },
});

module.exports = (dbname) => getModel(dbname, 'pending', pendingSchema);
