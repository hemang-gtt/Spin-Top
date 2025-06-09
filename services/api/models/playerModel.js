const mongoose = require('mongoose');
const BalanceDetailsSchema = require('./balanceModel');
const { getModel } = require('../../DB/index');

const playerSchema = new mongoose.Schema(
  {
    // Game launch details (from req.query)
    productId: {
      type: String,
      required: true,
      maxlength: 255,
    },
    lang: {
      type: String,
      required: true,
      length: 2,
    },
    targetChannel: {
      type: String,
      required: true,
      enum: ['desktop', 'mobile'],
      set: (v) => v.toLowerCase(),
    },
    consumerId: {
      type: String,
      required: true,
    },
    lobbyUrl: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: (props) => `${props.value} is not a valid URL`,
      },
    },
    sessionToken: {
      type: String,
      required: true,
      maxlength: 255,
    },
    token: {
      type: String,
    },

    // Player details
    playerId: {
      type: String,
      required: true,
      maxlength: 255,
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
      maxlength: 255,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      length: 3, // ISO-4217 format
    },
    country: {
      type: String,
      required: true,
      length: 2, // ISO-3166-1 alpha-2
    },
    balanceDetails: {
      type: BalanceDetailsSchema,
      default: undefined, // Optional field
    },
    totalGameCount: {
      type: Number,
      default: 0,
    },
    todayGameCount: {
      type: Number,
      default: 0,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
    updatedAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
    lastBet: {
      type: Number,
      default: 0,
    },
    lastWin: {
      type: Number,
      default: 0,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    upgradeSpin: {
      type: Object,
    },
    freeSpin: {
      type: Object,
    },
    campaigns: {
      type: Array,
      default: [],
    },
    resumedGameCurrency: {
      type: String,
      default: '',
    },
    freeSpinRoundId: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = (DbName) => getModel(DbName, 'player', playerSchema);
