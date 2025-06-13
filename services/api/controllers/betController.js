const { dbLog, logErrorMessage, apiLog } = require('../../ws/logs');
const { postReq } = require('../api');
const Bet = require('../models/betModel');
const Player = require('../models/playerModel');
const Refund = require('../models/refundModel');
const { redisClient: redis, redisDb } = require('../../DB/redis');
const { getRandomNumber } = require('../../utils/common');

const betRequest = async (transactionId, roundId, player, betJson, playerId, gameCount) => {
  let bet = {
    type: 'Real',
    sessionToken: player.sessionToken,
    playerId: player.playerId,
    productId: player.productId,
    txId: transactionId, // our side unique id is this --------------
    roundId: roundId, // convert it into string
    roundClosed: false, // need to check this
    amount: betJson.a.toString(),
    currency: player.currency,
    timestamp: Math.floor(new Date().getTime() / 1000),
  };

  logger.info(`Bet object send to them ::::::::::::::::::${JSON.stringify(bet)}`);

  try {
    const res = await postReq(player, bet, 'bet', player._id);
    logger.info(`Response after bet API is ----------${JSON.stringify(res)}`);

    bet.responseTransactionId = res.processedTxId; // there transaction Id(Eva Platform side)
    bet.responseBalance = res.balance;
    bet.balanceDetails = res.balanceDetails;
    bet.txDetails = res.txDetails;

    dbLog(`SET, req: BET, playerId: ${player._id}, data: ${JSON.stringify(bet)}`);

    logger.info(`bet data going to save is ----------${JSON.stringify(bet)}`);
    const betInstance = await Bet(process.env.DbName + `-${player?.consumerId}`);
    const newBet = new betInstance(bet);
    const savedBet = await newBet.save();
    const playerInstance = await Player(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
    await playerInstance.findOneAndUpdate({ _id: player._id }, { $set: { balance: res.balance } }, { new: true });
    betJson.api = 'SUCCESS';
    await redis.hset(`${redisDb}:{room-${gameCount}}`, `${playerId}_${roundId}`, JSON.stringify(betJson));

    return res;
  } catch (error) {
    console.log(error);

    betJson.api = 'ERROR';
    await redis.hset(`${redisDb}:{room-${gameCount}}`, `${playerId}_${roundId}`, JSON.stringify(betJson));

    logErrorMessage(`BET, ${JSON.stringify(error)}, data: ${JSON.stringify(bet)}`);

    if (error?.response?.data?.code === 'locked.player') {
      finalError = {
        status: error?.response?.data?.code,
        message: error?.response?.data?.message,
      };
      throw finalError;
    } else {
      logger.info(`Refund controller getting called ------------------`);
      await cancelRequest(player, bet);
    }

    finalError = {
      status: error?.response?.data.code || 'Internal Error',
      message: error?.response?.data?.message || 'Some Issue Occured while Placing the bet',
    };
    return finalError;
  }
};

const cancelRequest = async (player, bet) => {
  let transactionId = 'T' + getRandomNumber(16);
  let refund = {
    playerId: player.playerId,
    productId: player.productId,
    txId: transactionId, // transaction id at our end
    roundId: bet.roundId,
    roundClosed: bet.roundClosed,
    amount: bet.amount,
    sideSplit: bet?.sideSplit, // only send in the case if it exists
    currency: player.currency,
  };

  logger.info(`Refund object is ----------${JSON.stringify(refund)}`);

  try {
    const res = await postReq(player, refund, 'cancel', player._id);

    logger.info(`RESPONSE after refund ----------------${JSON.stringify(res)}`);
    apiLog(`POST req : REFUND -----------------Response is ${JSON.stringify(res)}`);

    refund.createdAt = res.createdAt;
    refund.responseTransactionId = res.processedTxId;
    refund.responseBalance = res.balance;
    refund.alreadyProcessed = res.alreadyProcessed;
    refund.balanceDetails = res.balanceDetails;
    refund.txDetails = res.txDetails;

    logger.info(`refund data going to save in db is ----${refund}`);
    dbLog(`SET, req: Cancel, playerId: ${player._id}, data: ${JSON.stringify(refund)}`);

    const refundInstance = await Refund(process.env.DbName + `-${player?.consumerId}`);
    const newRefund = new refundInstance(refund);
    await newRefund.save();

    return res;
  } catch (error) {
    // if here the issue came then we save it to wallet transaction and will run later with cron
    logErrorMessage(error);
    // saveTransaction.apiError = true;
    // await saveWalletTransaction(saveTransaction, player); // ! we don't need it may be will check

    logger.info(`Error in refund request is ------------`, error);

    return error;
  }
};
module.exports = { betRequest };
