const { dbLog } = require('../logs');
const masterModel = require('../models/masterModel');

const saveToMaster = async (playerId, requestType, req, res, user, providerName) => {
  logger.info(`Inside the master controller --------`);
  const masterInstance = await masterModel(process.env.DbName + `-${req?.consumerId || providerName}`);
  const masterData = {
    playerId: playerId,
    type: requestType,
    timestamp: Math.floor(new Date().getTime() / 1000),
    request: JSON.stringify(req),
    response: JSON.stringify(res),
  };

  console.log('master data is ------------', masterData);
  const master = new masterInstance(masterData);

  dbLog(`GET, req: GAME_LAUNCH, data: ${JSON.stringify(masterData)}`);

  await master.save();
};

module.exports = { saveToMaster };
