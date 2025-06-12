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
    console.log('player is ----------------', player);
    console.log('data is -----------------', data);

    const playerInfo = await postReq(player, data, 'playerInfo', '');
    console.log('player info is -----------------', playerInfo);

    let response = await gameLaunch(value, playerInfo);
    console.log('game launch done -------------');
    apiLog(`res: GAME_LAUNCH, data: ${JSON.stringify(response)}`);
    const params = new URLSearchParams(response.url.split('?')[1]);
    const userId = params.get('userId');
    const token = params.get('token');

    if (response.hasOwnProperty('errorCode') && response.hasOwnProperty('errorMessage')) {
      return res.status(response.errorCode).json(response);
    }

    console.log('userId is ------------', userId);
    console.log('params are -------', params);
    // ! need to ask why wallet balance here ----

    return res.status(200).json({ response });
  } catch (error) {
    console.log('error is ---------------', error);
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
    console.log('base path is --------===> ', basePath);
    console.log('finding the balance is --------------------');
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token !== process.env.INTERNAL_API_HEADER_TOKEN) {
        return res.status(401).send('Not Authorized!');
      }
    } else {
      return res.status(401).send('Not Authorized!');
    }

    console.log('data coming is ----------', req.body);

    let userId = req?.body?.userId;
    const tokenData = jwt.decode(req?.body?.token);
    console.log('token data is -----------', tokenData);
    let consumerId = tokenData.providerName;

    const balance = await getWalletBalance(userId, consumerId);
    console.log('line 105 is ---------', balance);

    return res.send(balance);
  } catch (error) {
    console.log(error);
    logErrorMessage(error);
    return res.status(401).send('Something went wrong');
  }
});

app.post(`${basePath}/api/webHook`, (req, res) => {
  try {
    console.log(`I got hit ---------web hook got hit -----`);
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
    console.log('data is -----', data);
    const event = data.e;
    const gameCount = data.l;
    const timestamp = data.ts;

    console.log('event is ----------', event);
    console.log('game COunt is ------', gameCount);

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
  console.log('game count is ------------', gameCount);
  console.log('time stamp -------', startTime);
  console.log('api key is -----', `${redisDb}:{room-${gameCount}}`);

  let userBets = await redis.hgetall(`${redisDb}:{room-${gameCount}}`);

  // let sampleuserBets = {
  //   '6842d5dfb72dc3d18592ff08_9wdUW1749711251': '{"a":5,"api":"PENDING"}',
  //   '6842d5dfb72dc3d18592ff08_XKoa1749711252': '{"a":5,"api":"PENDING"}',
  // };
  console.log('user bets are ------', userBets);
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
        console.log('player id is -------', playerId);
        console.log('bet id is -------', betId);
        // const client Id = key.split();

        const playerInstance = await Player(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
        let player = await playerInstance.findById(playerId).lean();
        if (!player) continue;

        let bet = JSON.parse(userBets[key]);
        console.log('bet is ---------', bet);
        let transactionId = 'T' + getRandomNumber(16);
        let betSavedData = await betRequest(transactionId, betId, player, bet, playerId, gameCount);

        console.log('bet saved data is ---------', betSavedData);
        // betAPI(player, bet, betId, playerId, gameCount);

        betCount += parseFloat(bet.a);
      } catch (error) {
        console.log('something went wrong OnStart with userId: ' + key + ', game: ' + gameCount);
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
  console.log('cashout is --------happened -----');
  console.log('hi -------------', multiplier);
  const roomHash = `{room-${gameCount}}`;
  const betKey = `${redisDb}:${roomHash}`;
  console.log('redis key is -----', betKey);
  console.log(`${redisDb}:{room-${gameCount}}-cashout`);

  let userWins = await redis.hgetall(`${redisDb}:{room-${gameCount}}-cashout`);
  let userBets = await redis.hgetall(`${redisDb}:{room-${gameCount}}`);

  console.log('users are -----------', userBets);
  console.log('user wins are ------------', userWins);

  let winCount = 0;
  let clientId;
  for (const key in userWins) {
    if (userWins.hasOwnProperty(key) && userBets.hasOwnProperty(key)) {
      const betObj = JSON.parse(userBets[key]);
      const winData = JSON.parse(userWins[key]);
      console.log('bet obje is --------', betObj, winData);

      console.log('win data is --------', winData);
      clientId = winData.operatorId;
      if (betObj.api === 'SUCCESS') {
        try {
          const userId = key.split('_')[0];
          const gameId = key.split('_')[1];

          console.log('user id ------and game id----', userId, gameId);
          const playerInstance = await Player(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
          let player = await playerInstance.findById(userId).lean();

          if (!player) continue;

          console.log('player is -----------', player);

          let winObj = JSON.parse(userWins[key]);
          let finalMultiplier = Math.floor(parseFloat(winObj.f) * 100);
          let betAmount = Math.floor(parseFloat(winObj.b) * 100);
          let winAmount = (betAmount * finalMultiplier) / 100 / 100;

          console.log('win object is --------', winObj, finalMultiplier, betAmount, winAmount);
          let transactionId = 'T' + getRandomNumber(16);

          await winRequest(transactionId, player, winAmount, gameId, winObj, key, gameCount);

          winCount += winAmount;
        } catch (error) {
          console.log('something went wrong OnCashout with userId: ' + key + ', game: ' + gameCount);
          console.log(error);
        }
      }
    }
  }

  await saveAtCrash(gameId, endTime, winCount, multiplier);
  gameId = '';

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
