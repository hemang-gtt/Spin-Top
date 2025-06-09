const Player = require('../models/playerModel');
const { saveToMaster } = require('../controllers/masterController');
const jwt = require('jsonwebtoken');

const { hasDateChanged } = require('../../utils/common');

const { dbLog } = require('../logs/index');
const gameLaunch = async (payload, playerInfo) => {
  console.log('hi ---------I am helper for player service---------');
  const playerInstance = await Player(process.env.DbName + `-${payload?.consumerId}`);

  const player = await playerInstance
    .findOne({
      playerId: playerInfo.playerId,
    })
    .lean();

  dbLog(`GET, req: GAME_LAUNCH, data: ${JSON.stringify(player)}`);

  logger.info(`Player found is ---------------`, JSON.stringify(player));

  if (!player) {
    logger.info(`Registering the player ---------------------`);
    return await registerPlayer(payload, playerInfo, playerInstance);
  }
  logger.info(`Login the player -----------`);
  return await updatePlayer(payload, playerInfo, playerInstance, player);
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
    process.env.JWT_SECRET_KEY
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
  console.log('token is -----------', token);
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
