const Player = require('../models/playerModel');
const Game = require('../models/gameModel');
const { postReq } = require('../api');
const { isValidCurrencyProxy, CurrencyAPI } = require('../../utils/common');

const { redisClient: redis, redisDb } = require('../../DB/redis');
const getWalletBalance = async (id, clientId) => {
  const playerInstance = await Player(`${process.env.DbName}-${clientId}`);

  let playerData = await playerInstance.findById(id).lean();

  logger.info(`Player data fetched ------------${JSON.stringify(playerData)}`);
  let data = { sessionToken: playerData.sessionToken };

  const res = await postReq({ consumerId: clientId }, data, 'playerInfo', '');

  console.log('player information is ----------', res);
  let checkValidCurrency,
    isCurrencyValid = false;
  if (process.env.CHECK_VALID_CURRENCY_ON_LOGIN === 'true') {
    checkValidCurrency = await isValidCurrencyProxy(playerData.currency);

    logger.info(`check valid currency is ----------${JSON.stringify(checkValidCurrency)}`);
    if (checkValidCurrency.isValid === true) {
      isCurrencyValid = true;
    }
  }

  const getCurrencyData = await CurrencyAPI(playerData.currency);

  logger.info(`currency data fetched --------${getCurrencyData}`);

  const multiplierData = await redis.lrange(`${redisDb}:Multiplier`, -30, -1);

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
  logger.info(`Data after starting the game --------------getting storee---`);

  const GameInstance = await Game(`${process.env.DbName}-${process.env.CONSUMER_ID}`);

  const gameData = { gameCount: gameCount, totalUsers: totalUsers, totalBet: totalBet, startTime: startTime };

  logger.info(`Game data is -----------${JSON.stringify(gameData)}`);
  const newGame = new GameInstance(gameData);
  const savedGame = await newGame.save();
  return {
    status: 'SUCCESS',
    id: savedGame._id,
  };
};

const saveAtCrash = async (gameId, endTime, totalWin, multiplier) => {
  logger.info('hi --------going to save the game data at crash');

  let data = {
    endTime: endTime,
    totalWin: totalWin,
    multiplier: multiplier,
  };
  const GameInstance = await Game(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
  logger.info('game data going to save after crash in game collection---', data);
  const savedGame = await GameInstance.findByIdAndUpdate({ _id: gameId }, { $set: data });

  logger.info(`Saved game ------------${JSON.stringify(savedGame)}`);

  return { status: 'SUCCESS' };
};

module.exports = { getWalletBalance, saveAtStart, saveAtCrash };
