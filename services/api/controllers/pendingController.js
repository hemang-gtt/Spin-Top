const axios = require('axios');
const Pending = require('../models/pendingModel');
const Win = require('../models/winModel');
const Refund = require('../models/refundModel');

const { logErrorMessage } = require('../logs');

const resolvePending = async () => {
  try {
    logger.info(`Resolving the pending task-----------------`);
    let pendingInstance = await Pending(process.env.DbName);

    let data = await pendingInstance.find();

    console.log('data is ----------', data);

    let isAllResolved = true;
    for (let i = 0; i < data.length; i++) {
      let req = data[i];
      let resp = '';
      let parsedRequest = JSON.parse(req.request);

      let providerName = parsedRequest.consumerId;
      if (req.type === 'win') {
        resp = await pendingWinRequest(parsedRequest, req.type, 0, true, providerName);
      } else if (req.type === 'cancel') {
        resp = await pendingCancelRequest(parsedRequest, req.type, 0, true, providerName);
      }
      if (resp && resp.hasOwnProperty('balance')) {
        const updatedData = {
          apiStatus: 'completed',
          apiResolvedTimeStamp: Math.floor(new Date().getTime() / 1000),
        };

        const pendingInstance = await Pending(process.env.DbName);

        await pendingInstance.findByIdAndDelete(req._id).lean();
      } else {
        isAllResolved = false;
      }
    }
    return isAllResolved;
  } catch (error) {
    logErrorMessage(error);
  }
};

const pendingWinRequest = async (win, requestType, maxRetries, alreadyInPending, providerName) => {
  logger.info(`Win object is --------${JSON.stringify(win)}------request type is -----${JSON.stringify(requestType)}`);

  const winDetails = await pendingPostReq(win, requestType, 0, alreadyInPending, providerName);
  win.responseTransactionId = winDetails.data.processedTxId;
  win.responseBalance = winDetails.data.balance;
  win.balanceDetails = winDetails.data.balanceDetails;
  win.alreadyProcessed = winDetails.data.alreadyProcessed;
  win.createdAt = winDetails.data.createdAt;
  win.txDetails = winDetails.data.txDetails;

  logger.info('data going to save in the win is ---------', win);
  const winInstance = await Win(process.env.DbName + `-${providerName}`);
  const newWin = new winInstance(win);
  await newWin.save();

  logger.info(`Win details data is ------${JSON.stringify(winDetails.data)}`);
  return winDetails.data;
};

const pendingCancelRequest = async (refund, requestType, maxRetries, alreadyInPending, providerName) => {
  logger.info(`Refund object is-----------${JSON.stringify(refund)}`);

  const res = await pendingPostReq(refund, requestType, maxRetries, alreadyInPending);

  refund.createdAt = res.data.createdAt;
  refund.responseTransactionId = res.data.processedTxId;
  refund.responseBalance = res.data.balance;
  refund.alreadyProcessed = res.data.alreadyProcessed;
  refund.balanceDetails = res.data.balanceDetails;
  refund.txDetails = res.data.txDetails;

  logger.info(`Refund object is --------${refund}---------and provider name is ----${providerName}`);

  const refundInstance = await Refund(process.env.DbName + `-${providerName}`);
  const newRefund = new refundInstance(refund);
  await newRefund.save();
  return res.data;
};

const pendingPostReq = async (
  data,
  requestType,
  maxRetries = 0,
  alreadyInPending = false,
  delay = 2000,
  timeout = 10000
) => {
  let headers = {
    'Content-Type': 'application/json',
    'X-Hub-Consumer': data.consumerId,
  };

  let url = process.env.API_BASE_URL + requestType;
  if (requestType === 'campaignWin') {
    url = process.env.API_BASE_URL + 'freeSpins/win';
  }

  try {
    const response = await axios.post(url, data, { headers, timeout });
    return response;
  } catch (error) {
    logger.info(`Error is ------${JSON.stringify(error)}`);
    let res = error?.response?.data;
    let errorRes = {
      response: {
        data: {
          code: res === undefined ? 1 : res.errorCode,
          message: res === undefined ? 'Internal Error' : res.errorMessage,
        },
      },
    };
    throw errorRes;
  }
};

const saveToPending = async (data, requestType, playerId) => {
  try {
    logger.info(`Saving to pending scehma-----------------`);
    const pendingInstance = await Pending(process.env.DbName);
    const pendingObject = {
      userId: playerId,
      type: requestType,
      clientId: data.consumerId, // consumer id is client id here
      transactionId: data.txId,
      request: JSON.stringify(data),
      timestamp: Math.floor(new Date().getTime() / 1000),
    };

    logger.info(`Pending object is -------------${JSON.stringify(pendingObject)}`);
    const pendingTask = new pendingInstance(pendingObject);
    await pendingTask.save();
  } catch (error) {
    logger.info('error is ------------', error);
  }
};

module.exports = { saveToPending, resolvePending };
