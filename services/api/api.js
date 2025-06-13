const axios = require('axios');
// const { startCron } = require('./cron');
const { saveToPending } = require('./controllers/pendingController');
const { startCron } = require('./cron');
const retries = process.env.MAX_RETRIES || 3;
const postReq = async (
  player,
  data,
  requestType,
  playerId,
  maxRetries = retries,
  delay = 2000,
  timeout = 1000 * 10
) => {
  logger.info(`Calling ${requestType} api:::::::::::::::::::::::::::::::::::::::::`);

  let headers = {
    'Content-Type': 'application/json',
    'X-Hub-Consumer': player.consumerId,
  };
  let url = process.env.API_BASE_URL + requestType;
  try {
    // if (requestType === 'win') {
    //   let error = {
    //     response: {
    //       data: {
    //         code: 'Invalid.bet',
    //         message: `failing ${requestType} api`,
    //       },
    //     },
    //   };
    //   throw error;
    // }

    let response = await axios.post(url, data, { headers, timeout });
    return response.data;
  } catch (error) {
    logger.info(`Error is-------${error}`);

    if (error?.response?.data?.code === 'invalid.session.key') {
      let finalError = {
        status: error?.response?.data?.code,
        message: error?.response?.data?.message,
      };
      throw finalError;
    }

    if (error?.response?.data?.code === 'invalid.request.data') {
      let finalError = {
        status: error?.response?.data?.code,
        message: error?.response?.data?.message,
      };

      throw finalError;
    }
    if (maxRetries <= 0) {
      logger.info(`Max retries -----------${maxRetries}`);
      if (requestType === 'win' || requestType === 'cancel') {
        let newData = {
          ...data,
          consumerId: player?.consumerId,
        };
        logger.info(`Data going to save in the pending collection ${JSON.stringify(newData)}`);
        await saveToPending(newData, requestType, playerId);
        startCron(false);

        let res = error?.response?.data;
        if (res.hasOwnProperty('code') && res.hasOwnProperty('message')) {
          throw res;
        } else {
          let errorRes = {
            response: { code: 'error.internal', message: 'Internal Error', at: Date.now() },
          };
          throw errorRes;
        }
      }
    } else {
      // we will call again after some delay ---
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
      return postReq(player, data, requestType, playerId, maxRetries - 1, delay, timeout);
    }
    // we will handle it here
    throw error;
  }
};
module.exports = { postReq };
