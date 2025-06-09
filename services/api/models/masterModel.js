const mongoose = require('mongoose');
const { getModel } = require('../../DB/index');

const masterSchema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  timeStamp: {
    type: Number,
  },
  request: {
    type: String,
  },
  response: {
    type: String,
  },
});

module.exports = (DbName) => getModel(DbName, 'master', masterSchema);
