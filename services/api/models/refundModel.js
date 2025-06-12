const mongoose = require('mongoose');
const { getModel } = require('../../DB/index');

const BalanceDetailsSchema = new mongoose.Schema(
  {
    locked: {
      type: Number,
      required: true,
      default: 0,
    },
    bonus: {
      type: Number,
      required: true,
      default: 0,
    },
    main: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false }
);

const refundModelSchema = new mongoose.Schema({
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
  sideSplit: {
    base: { type: Number, default: 0 },
    side: { type: Number, default: 0 },
  },
  currency: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  responseTransactionId: {
    type: String,
    required: true,
  },
  responseBalance: {
    type: Number,
    required: true,
  },
  alreadyProcessed: {
    type: Number,
    required: true,
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

module.exports = (DbName) => getModel(DbName, 'refund', refundModelSchema);
