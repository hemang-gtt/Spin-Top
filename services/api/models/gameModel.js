const mongoose = require('mongoose');
const { getModel } = require('../../DB/index');

const gameSchema = new mongoose.Schema({
  gameId: {
    type: Number,
    index: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
  },
  multiplier: {
    type: Number,
  },
  totalUsers: {
    type: Number,
    required: true,
  },
  totalBet: {
    type: Number,
    required: true,
  },
  totalWin: {
    type: Number,
  },
  createdDate: {
    type: Date,
    default: new Date(),
  },
});

const Game = (dbName) => getModel(dbName, 'game', gameSchema); //mongoose.model('game', gameSchema);

module.exports = Game;
