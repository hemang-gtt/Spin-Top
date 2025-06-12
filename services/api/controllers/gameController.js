const Player = require('../models/playerModel');
const Game = require('../models/gameModel');
const { postReq } = require('../api');
const { isValidCurrencyProxy, CurrencyAPI } = require('../../utils/common');

const { redisClient: redis, redisDb } = require('../../DB/redis');
const getWalletBalance = async (id, clientId) => {
  console.log('id --------------', id);
  console.log('client id is --------', clientId);

  const playerInstance = await Player(`${process.env.DbName}-${clientId}`);

  let playerData = await playerInstance.findById(id).lean();

  console.log('player is ------------', playerData);
  let data = { sessionToken: playerData.sessionToken };

  const res = await postReq({ consumerId: clientId }, data, 'playerInfo', '');

  console.log('player information is ----------', res);
  let checkValidCurrency,
    isCurrencyValid = false;
  if (process.env.CHECK_VALID_CURRENCY_ON_LOGIN === 'true') {
    console.log('line 26- -------------');
    checkValidCurrency = await isValidCurrencyProxy(playerData.currency);
    console.log('checkValidCurrency :::> ', JSON.stringify(checkValidCurrency));

    console.log('currency is ----------', checkValidCurrency.isValid, typeof checkValidCurrency.isValid);
    if (checkValidCurrency.isValid === true) {
      isCurrencyValid = true;
    }
  }

  const getCurrencyData = await CurrencyAPI(playerData.currency);

  console.log('get currency data is -------', getCurrencyData);

  const multiplierData = await redis.lrange(`${redisDb}:Multiplier`, -30, -1);
  console.log('multiplier data is ---------------', multiplierData);

  let response = {
    status: 'SUCCESS',
    balance: res.balance,
    isValidCurrency: isCurrencyValid,
    multiplier: multiplierData.reverse(),
    message: 'my wallet balance',
    range: getCurrencyData.range,
    buttons: getCurrencyData.buttons,
    defaultBet: getCurrencyData.defaultBet,
  };

  await playerInstance.findOneAndUpdate({ _id: playerData._id }, { $set: { balance: res.balance } });

  return response;
};

const saveAtStart = async (gameCount, startTime, totalUsers, totalBet) => {
  console.log('inside the game stated data is getting save---');

  console.log('game count is ------', gameCount);
  const GameInstance = await Game(`${process.env.DbName}-${process.env.CONSUMER_ID}`);

  const gameData = { gameCount: gameCount, totalUsers: totalUsers, totalBet: totalBet, startTime: startTime };
  console.log('game data going to save in game collection---', gameData);
  const newGame = new GameInstance(gameData);
  const savedGame = await newGame.save();
  return {
    status: 'SUCCESS',
    id: savedGame._id,
  };
};

const saveAtCrash = async (gameId, endTime, totalWin, multiplier) => {
  console.log('hi --------going to save the game data at crash');

  let data = {
    endTime: endTime,
    totalWin: totalWin,
    multiplier: multiplier,
  };
  const GameInstance = await Game(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
  console.log('game data going to save after crash in game collection---', data);
  const savedGame = await GameInstance.findByIdAndUpdate({ _id: gameId }, { $set: data });

  console.log('saved game is -------------', savedGame);

  return { status: 'SUCCESS' };
};

module.exports = { getWalletBalance, saveAtStart, saveAtCrash };
