const mongoose = require('mongoose');
const { getModel } = require('../../DB/index');

const BalanceDetailsSchema = require('../models/balanceModel');

const winModelSchema = new mongoose.Schema(
  {
    type: {
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
      default: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },

    sideSplit: {
      base: { type: Number, default: 0 },
      side: { type: Number, default: 0 },
    },
    createdAt: {
      type: Date,
      default: Date.now(),
    },
    responseTransactionId: {
      // there side tx id
      type: String,
      required: true,
    },
    responseBalance: {
      type: Number,
      required: true,
    },
    alreadyProcessed: {
      type: Boolean,
      default: false,
    },
    balanceDetails: {
      type: BalanceDetailsSchema,
      default: undefined, // making it optional
    },
    txDetails: {
      type: BalanceDetailsSchema,
      default: undefined, // optional
    },
  },
  {
    timestamps: true,
  }
);

module.exports = (DbName) => getModel(DbName, 'win', winModelSchema);
