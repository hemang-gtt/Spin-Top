const express = require('express');
const { gameLaunch } = require('./helper/playerService');
const { gameLaunchValidationSchema } = require('./validators/gameLaunchValidation');

const { redisClient: redis, redisDb } = require('../DB/redis');
const { postReq } = require('./api');
const { apiLog, logErrorMessage } = require('./logs');
const app = express();

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/', (req, res) => {
  logger.info('Health route --------------');
  console.log('hi ---------------happy man !!!!!!!!!!!!!!!');
  return res.status(200).json({
    message: 'hello world !!!!!!!!!!!!!',
  });
});

app.post('/game/launch', async (req, res, next) => {
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

    const params = new URLSearchParams(response.url.split('?')[1]);
    const userId = params.get('userId');
    const token = params.get('token');

    logger.info(`User id ------------${userId} and token is ------------${token}`);

    let existingToken = await redis.get(`${redisDb}-user:${userId}`);
    logger.info(`Existing token present in redis ---------${existingToken}`);

    if (existingToken) {
      await redis.del(`${redisDb}-user:${userId}`);
    }
    logger.info(`setting the key ${redisDb}-user:${userId}`);
    await redis.set(`${redisDb}-user:${userId}`, token, 'EX', 3600); // 1hr window size

    apiLog(`POST[GAME LAUNCH]: Url generated from the  Game launch Api-----${response}`);

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

module.exports = app;
