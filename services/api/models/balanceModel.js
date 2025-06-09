const mongoose = require('mongoose');
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

module.exports = BalanceDetailsSchema;
