const express = require('express');
const { gameLaunch } = require('./helper/playerService');
const { gameLaunchValidationSchema } = require('./validators/gameLaunchValidation');
const { getWalletBalance } = require('./controllers/gameController');
const jwt = require('jsonwebtoken');
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
app.use(express.json());

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

app.post('/api/getBalance', async (req, res) => {
  try {
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

module.exports = app;
