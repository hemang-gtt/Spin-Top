const mongoose = require('mongoose');
const { getModel } = require('../../DB/index');

const BalanceDetailsSchema = require('../models/balanceModel');

const betModelSchema = new mongoose.Schema({
  sessionToken: {
    type: String,
    required: true,
  },
  playerId: {
    type: String,
    required: true,
  },
  productId: {
    type: String,
    required: true,
  },
  txId: {
    type: String,
    required: true,
  },
  roundId: {
    type: String,
    required: true,
  },
  roundClosed: {
    type: Boolean,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
  },
  createdAt: {
    type: String,
    default: Date.now(),
  },
  responseBalance: {
    type: String,
    required: true,
  },
  responseTransactionId: {
    type: String,
    required: true,
  },
  alreadyProcessed: {
    type: Boolean,
  },
  balanceDetails: {
    type: BalanceDetailsSchema,
    default: undefined, // making it optional
  },
  txDetails: {
    type: BalanceDetailsSchema,
    default: undefined, // optional
  },
});

module.exports = (DbName) => getModel(DbName, 'bet', betModelSchema);
