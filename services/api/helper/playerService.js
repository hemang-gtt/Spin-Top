const Player = require('../models/playerModel');
const { saveToMaster } = require('../controllers/masterController');
const jwt = require('jsonwebtoken');

const { redisClient: redis, redisDb } = require('../../DB/redis');
const { hasDateChanged, isValidCurrencyProxy, CurrencyAPI } = require('../../utils/common');

const { dbLog } = require('../logs/index');

const gameLaunch = async (payload, playerInfo) => {
  console.log('hi ---------I am helper for player service---------');
  const playerInstance = await Player(process.env.DbName + `-${payload?.consumerId}`);

  const player = await playerInstance
    .findOne({
      playerId: playerInfo.playerId,
    })
    .lean();

  console.log('player is ----------', player);
  dbLog(`GET, req: GAME_LAUNCH, data: ${JSON.stringify(player)}`);

  if (process.env.BYPASS_AUTHENTICATE_SIGNATURE_FOR_TESTING != 'true') {
    if (headerSignature !== signature) {
      return {
        errorCode: 401,
        errorMessage: 'Unauthorized',
      };
    }
  }
  logger.info(`Player found is ---------------`, JSON.stringify(player));

  let responseData = null;
  if (!player) {
    logger.info(`Registering the player ---------------------`);
    responseData = await registerPlayer(payload, playerInfo, playerInstance);
  }
  logger.info(`Login the player -----------`);

  responseData = await updatePlayer(payload, playerInfo, playerInstance, player);

  console.log('respnose iata is --------', responseData);

  let checkValidCurrency,
    isCurrencyValid = true;
  if (!responseData.hasOwnProperty('errorCode')) {
    const params = new URLSearchParams(responseData.url.split('?')[1]);
    const userId = params.get('userId');
    const token = params.get('token');

    console.log('userId ----------', userId);
    console.log('token is ---------', token);

    let wsData = await redis.get(`${redisDb}-user:${userId}`);

    console.log('ws data is -----------', wsData);
    if (wsData) {
      wsData = JSON.parse(wsData);
      await redis.del(`${redisDb}-token:${wsData.t}`);
    }

    console.log('player is line 62 ----------------', player);
    if (process.env.CHECK_VALID_CURRENCY_ON_LOGIN === 'true') {
      checkValidCurrency = await isValidCurrencyProxy(player.currency);
      console.log('check valid currency -----------', checkValidCurrency);

      if (!checkValidCurrency.isValid) {
        isCurrencyValid = false;
      }
    }

    const getCurrencyData = await CurrencyAPI(player.currency);
    let count = await redis.lrange(`${redisDb}:Multiplier`, 0, -1);

    console.log('currency data is -----------', getCurrencyData);
    console.log('count is ------------', count);

    if (count.length > 100) {
      await redis.ltrim(`${redisDb}:Multiplier`, 50, -1);
    }

    const multiplierData = await redis.lrange(`${redisDb}:Multiplier`, -30, -1);
    console.log('multiplier data is ----------------', multiplierData);
    const userData = JSON.stringify({
      u: userId,
      b: player.balance,
      t: token,
      c: isCurrencyValid,
      range: getCurrencyData.range,
      buttons: getCurrencyData.buttons,
      defaultBet: getCurrencyData.defaultBet,
      multiplier: multiplierData.reverse(),
    });

    await redis.set(`${redisDb}-user:${userId}`, userData, 'EX', 3600);

    if (process.env.BYPASS_AUTHENTICATE_SIGNATURE_FOR_TESTING != 'true') {
      if (!checkValidCurrency.isValid) {
        return { status: 'ERROR', message: 'Currency is invalid!' };
      }
    }
    console.log('user data is --------', userData);

    return responseData;
  }
};

const registerPlayer = async (payload, playerInfo, playerInstance) => {
  let playerData = {
    productId: payload.productId,
    lang: payload.lang,
    targetChannel: payload.targetChannel,
    consumerId: payload.consumerId,
    lobbyUrl: payload.lobbyUrl,
    sessionToken: payload.sessionToken,
    token: '',
    country: playerInfo.country,
    balance: playerInfo.balance,
    displayName: playerInfo.displayName,
    currency: playerInfo.currency,
    playerId: playerInfo.playerId,
    balanceDetails: playerInfo?.balanceDetails,
    totalGameCount: 0,
    todayGameCount: 0,
    isBanned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  logger.info(`player data --------${JSON.stringify(playerData)}`);
  dbLog(`Set, req: REGISTER, data:${JSON.stringify(playerData)}`);
  const newPlayer = new playerInstance(playerData);
  let savedPlayer = await newPlayer.save();

  console.log('saved player is ------------', savedPlayer);
  const token = jwt.sign(
    {
      userId: savedPlayer._id,
      providerName: payload?.consumerId,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: '1h' }
  );

  await playerInstance.findOneAndUpdate({ _id: savedPlayer._id }, { $set: { token: token } }, { new: true }).lean();

  dbLog(`SET, req: REGISTER, data: ${JSON.stringify(playerData)}`);

  let response = {
    url: `${process.env.GAME_BASE_URL}?userId=${savedPlayer._id}&token=${token}&locale=${playerData.lang}&api=true&base=${process.env.BASE}&type=${process.env.TYPE}&path=${process.env.BASE_PATH}/`,
  };
  // save this data to master model
  saveToMaster(savedPlayer._id, 'REGISTER', payload, response);

  return response;
};
const updatePlayer = async (payload, playerInfo, playerInstance, existingPlayer) => {
  const token = jwt.sign({ userId: existingPlayer._id, providerName: payload?.consumerId }, process.env.JWT_SECRET_KEY);
  let currentDateAndTime = Math.floor(new Date().getTime() / 1000);

  let isDateChanged = hasDateChanged(currentDateAndTime, existingPlayer.updatedAt);

  let playerData = {
    productId: payload.productId,
    lang: payload.lang,
    targetChannel: payload.targetChannel,
    consumerId: payload.consumerId,
    lobbyUrl: payload.lobbyUrl,
    sessionToken: payload.sessionToken,
    token: token,
    country: playerInfo.country,
    balance: playerInfo.balance,
    displayName: playerInfo.displayName,
    currency: playerInfo.currency,
    playerId: playerInfo.playerId,
    balanceDetails: playerInfo?.balanceDetails,
    totalGameCount: isDateChanged ? 0 : existingPlayer.todayGameCount,
    todayGameCount: isDateChanged ? 0 : existingPlayer.todayGameCount,
    isBanned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  dbLog(`SET, req: LOGIN, playerId: ${existingPlayer._id}, data: ${JSON.stringify(playerData)}`);

  const updatedPlayer = await playerInstance
    .findOneAndUpdate({ _id: existingPlayer._id }, { $set: playerData }, { new: true })
    .lean();

  dbLog(`SET, req: LOGIN, playerId: ${existingPlayer._id}, data: ${JSON.stringify(playerData)}`);

  let response = {
    url: `${process.env.GAME_BASE_URL}?userId=${updatedPlayer._id}&token=${token}&locale=${playerData.lang}&api=true&base=${process.env.BASE}&type=${process.env.TYPE}&path=${process.env.BASE_PATH}/`,
  };

  console.log('respnse is --------------', response);
  saveToMaster(updatedPlayer._id, 'LOGIN', payload, response, existingPlayer);
  return response;
};
module.exports = { gameLaunch };
