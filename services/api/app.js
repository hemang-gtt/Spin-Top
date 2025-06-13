const express = require('express');
const { gameLaunch } = require('./helper/playerService');
const { gameLaunchValidationSchema } = require('./validators/gameLaunchValidation');
const { getWalletBalance } = require('./controllers/gameController');
const jwt = require('jsonwebtoken');
const {
  redisClient: redis,
  redisDb,
  deleteAllRedisKeysOfGame,
  deleteAllRedisKeysWithApiSuccess,
} = require('../DB/redis');
const { postReq } = require('./api');
const { apiLog, logErrorMessage } = require('./logs');
const Player = require('./models/playerModel');
const { getRandomNumber } = require('../utils/common');
const { saveAtStart, saveAtCrash } = require('./controllers/gameController');

const { betRequest } = require('./controllers/betController');
const { winRequest } = require('./controllers/winController');
const { startCron } = require('./cron');
const logger = require('../utils/logger');
const app = express();

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json());

startCron(true);

app.get('/', (req, res) => {
  logger.info('Health route --------------');
  console.log('hi ---------------happy man !!!!!!!!!!!!!!!');
  return res.status(200).json({
    message: 'hello world !!!!!!!!!!!!!',
  });
});
const basePath = process.env.BASE_PATH;

app.post(`${basePath}/game/launch`, async (req, res, next) => {
  console.log('hi heloo-------------------------');
  logger.info(`Let's launch the game dude ----------------`);

  try {
    const { error, value } = gameLaunchValidationSchema.validate(req.query);

    // error in launching the game---------
    if (error) {
      return res.status(400).json({
        code: 'invalid.request.data',
        message: 'Invalid request ',
      });
    }

    logger.info(`Value is ------------${JSON.stringify(value)}`);
    const { consumerId, sessionToken } = value;
    let player = { consumerId };
    let data = { sessionToken };
    logger.info(`Player is -----${JSON.stringify(player)} and data is --------${JSON.stringify(data)}`);
    const playerInfo = await postReq(player, data, 'playerInfo', '');

    logger.info(`Player info is -----${JSON.stringify(playerInfo)}`);
    let response = await gameLaunch(value, playerInfo);

    logger.info(`Response is ---------${JSON.stringify(response)}`);
    apiLog(`res: GAME_LAUNCH, data: ${JSON.stringify(response)}`);
    const params = new URLSearchParams(response.url.split('?')[1]);
    const userId = params.get('userId');
    const token = params.get('token');

    if (response.hasOwnProperty('errorCode') && response.hasOwnProperty('errorMessage')) {
      return res.status(response.errorCode).json(response);
    }

    logger.info(`User id and params are -------${userId} and params are -----${params}`);
    // ! need to ask why wallet balance here ----

    return res.status(200).json({ response });
  } catch (error) {
    logger.info(`Error is ----------${JSON.stringify(error)}`);
    const axiosError = error?.response ? error : error?.error; // handles nested errors
    const errorData = axiosError?.response?.data;
    if (errorData) {
      logger.info(`error is --------------${errorData}-`);
      logErrorMessage(JSON.stringify(errorData));
    } else {
      logger.info('Unexpected error structure', JSON.stringify(error));
    }

    return res.status(422).json({ error: errorData || 'Unknown error' });
  }
});

app.post(`${basePath}/api/getBalance`, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token !== process.env.INTERNAL_API_HEADER_TOKEN) {
        return res.status(401).send('Not Authorized!');
      }
    } else {
      return res.status(401).send('Not Authorized!');
    }

    logger.info(`data coming in request body is --------${JSON.stringify(req.body)}`);

    let userId = req?.body?.userId;
    const tokenData = jwt.decode(req?.body?.token);

    logger.info(`Token data fetched ----${JSON.stringify(tokenData, null, 4)}`);
    let consumerId = tokenData.providerName;

    const balance = await getWalletBalance(userId, consumerId);

    logger.info(`Balance is -----------${balance}`);

    return res.send(balance);
  } catch (error) {
    console.log(error);
    logErrorMessage(error);
    return res.status(401).send('Something went wrong');
  }
});

app.post(`${basePath}/api/webHook`, (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token !== process.env.INTERNAL_API_HEADER_TOKEN) {
        return res.status(401).send('Not Authorized!');
      }
    } else {
      return res.status(401).send('Not Authorized!');
    }

    let data = req.body;
    const event = data.e;
    const gameCount = data.l;
    const timestamp = data.ts;

    logger.info(`Web hook api got called ---------event is -------${JSON.stringify(event)}`);

    if (event && event === 'OnStart') {
      OnStart(gameCount, timestamp);
    } else if (event && event === 'OnCrash') {
      Cashouts(gameCount, timestamp, data.m);
    }
    return res.status(200).json({ message: 'Webhook received successfully!' });
  } catch (error) {
    console.log('error ----------', error);
    throw error;
  }
});

async function OnStart(gameCount, startTime) {
  logger.info(`Game count is-----${gameCount} and started at ${startTime} `);
  logger.info('api key is -----', `${redisDb}:{room-${gameCount}}`);

  let userBets = await redis.hgetall(`${redisDb}:{room-${gameCount}}`);

  // let sampleuserBets = {
  //   '6842d5dfb72dc3d18592ff08_9wdUW1749711251': '{"a":5,"api":"PENDING"}',
  //   '6842d5dfb72dc3d18592ff08_XKoa1749711252': '{"a":5,"api":"PENDING"}',
  // };

  logger.info(`User bets are --------${JSON.stringify(userBets)}`);
  let users = await redis.hgetall(`${redisDb}:{room-${gameCount}}-player`);

  let clientId;
  let betCount = 0;
  for (const key in userBets) {
    if (userBets.hasOwnProperty(key)) {
      const betData = JSON.parse(userBets[key]);
      clientId = betData.operatorId;

      try {
        const playerId = key.split('_')[0];
        const betId = key.split('_')[1];
        // const client Id = key.split();

        const playerInstance = await Player(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
        let player = await playerInstance.findById(playerId).lean();
        if (!player) continue;

        let bet = JSON.parse(userBets[key]);
        logger.info(`Bet is -----------${JSON.stringify(bet)}`);
        let transactionId = 'T' + getRandomNumber(16);
        let betSavedData = await betRequest(transactionId, betId, player, bet, playerId, gameCount);

        logger.info(`Data saved in bet Model is ----------${betSavedData}`);

        betCount += parseFloat(bet.a);
      } catch (error) {
        logger.info(`something went wrong OnStart with userId: ${key} + ', game: ' + ${gameCount}`);
        console.log(error);
      }
    }
  }

  // saving the game data at start
  let savedGame = await saveAtStart(gameCount, startTime, Object.keys(users).length, betCount);

  if (savedGame.status && savedGame.status === 'SUCCESS') {
    gameId = savedGame.id; // ! need to ask why ?
  }
}

async function Cashouts(gameCount, endTime, multiplier) {
  handleCashouts(gameCount, endTime, multiplier, true);

  let countToProcessWin = process.env.REDIS_WINSETTLEMENT_COUNT;

  // 1. Get all keys matching the pattern
  const pattern = `${redisDb}:{room-*`;
  const keys = await redis.keys(pattern);

  logger.info(`Keys are -----------${JSON.stringify(keys)}`);

  let remainingWinData = keys.map((str) => str.split('{room-')[1].split('}')[0]).filter((item) => item !== gameCount);
  const remainingGameCount = remainingWinData.slice(0, countToProcessWin);

  for (const count of remainingGameCount) {
    // console.log('COUNT :> ', count)
    handleCashouts(count);
  }
}

async function handleCashouts(gameCount, endTime, multiplier, baseCase = false) {
  logger.info(`Cashout Event happened ::::::::::::::::::::::`);
  const roomHash = `{room-${gameCount}}`;
  const betKey = `${redisDb}:${roomHash}`;
  console.log(`${redisDb}:{room-${gameCount}}-cashout`);

  let userWins = await redis.hgetall(`${redisDb}:{room-${gameCount}}-cashout`);
  let userBets = await redis.hgetall(`${redisDb}:{room-${gameCount}}`);

  logger.info(`Users are -----------${JSON.stringify(userBets)}`);

  logger.info(`User wins are ---------------${JSON.stringify(userWins)}`);

  let winCount = 0;
  let clientId;
  for (const key in userWins) {
    if (userWins.hasOwnProperty(key) && userBets.hasOwnProperty(key)) {
      const betObj = JSON.parse(userBets[key]);
      const winData = JSON.parse(userWins[key]);
      clientId = winData.operatorId;
      if (betObj.api === 'SUCCESS') {
        try {
          const userId = key.split('_')[0];
          const gameId = key.split('_')[1];

          logger.info(`User id -----------${userId}-------gameID is --${gameId}`);
          const playerInstance = await Player(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
          let player = await playerInstance.findById(userId).lean();

          if (!player) continue;

          let winObj = JSON.parse(userWins[key]);
          let finalMultiplier = Math.floor(parseFloat(winObj.f) * 100);
          let betAmount = Math.floor(parseFloat(winObj.b) * 100);
          let winAmount = (betAmount * finalMultiplier) / 100 / 100;
          let transactionId = 'T' + getRandomNumber(16);

          await winRequest(transactionId, player, winAmount, gameId, winObj, key, gameCount);

          if (baseCase === true) winCount += winAmount;
        } catch (error) {
          console.log('something went wrong OnCashout with userId: ' + key + ', game: ' + gameCount);
          console.log(error);
        }
      }
    }
  }
  if (baseCase === true) {
    await saveAtCrash(gameId, endTime, winCount, multiplier);
    gameId = '';
  }

  deleteAllRedisKeysOfGame(gameCount);
  deleteAllRedisKeysWithApiSuccess(gameCount);
}
module.exports = app;

/*
user wins are ------------ {
  '6842d5dfb72dc3d18592ff08_c4r0p1749724470': '{"a":5,"api":"PENDING"}',
  '6842d5dfb72dc3d18592ff08_v3Rn1749724472': '{"a":5,"api":"PENDING"}'
}

user, winAmount, roundId, winObj, key, gameCount

player, winAmount, gameId, winObj, key, gameCount
*/
