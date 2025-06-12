const { postReq } = require('../api');

const Win = require('../models/winModel');
const Player = require('../models/playerModel');
const { redisClient: redis, redisDb } = require('../../DB/redis');
const { logErrorMessage } = require('../../ws/logs');

const winRequest = async (transactionId, player, amount, gameId, winObj, key, gameCount) => {
  console.log('inside win controller -----------------');
  console.log('transaction id is ---------', transactionId);
  console.log('player is ----------', player, amount, gameId, winObj, key, gameCount);

  let win = {
    type: 'REAL',
    playerId: player.playerId,
    productId: player.productId,
    txId: transactionId,
    roundId: gameId.toString(), // this should be the _id of game model
    roundClosed: true,
    amount: parseFloat(amount),
    currency: player.currency,
    // side split is optional
  };

  console.log('win is -----------', win);

  try {
    let res = await postReq(player, win, 'win', player._id);

    console.log('response after win api is ------', res);

    win.responseTransactionId = res.processedTxId;
    win.responseBalance = res.balance;
    win.balanceDetails = res.balanceDetails;
    win.alreadyProcessed = res.alreadyProcessed;
    win.createdAt = res.createdAt;
    win.txDetails = res.txDetails;

    logger.info(`Win data saved in model--------${JSON.stringify(win)}`);
    const winInstance = await Win(process.env.DbName + `-${player?.consumerId}`);
    const newWin = new winInstance(win);
    const savedWin = await newWin.save();

    console.log('saved win is ---------', savedWin);

    const playerInstance = await Player(`${process.env.DbName}-${process.env.CONSUMER_ID}`);
    let playerData = await playerInstance.findOneAndUpdate(
      { _id: player._id },
      { $set: { balance: res.balance } },
      { new: true }
    );

    console.log('updaed balance is ---------', playerData.balance);
    winObj.api = 'SUCCESS'; // ! not needed to save

    await redis.hdel(`${redisDb}:{room-${gameCount}}-cashout`, key);
    await redis.hdel(`${redisDb}:{room-${gameCount}}`, key);

    // set
  } catch (error) {
    console.log('error is ----------', error);
    winObj.api = 'ERROR';
    console.log('error came is -----------', error?.response?.data);
    logErrorMessage(`WIN, ${JSON.stringify(error?.response?.data)}, data: ${JSON.stringify(win)}`);
    return error?.response?.data;
  }
};

module.exports = { winRequest };
