const { CronJob } = require('cron');
const { redisClient: redis, redisDb } = require('../DB/redis');

const { logError } = require('./logs/index');
const { resolvePending } = require('./controllers/pendingController');

let cronList = [];
const startCron = async (isRestarting) => {
  try {
    logger.info(`Starting the cron -------------`);
    let isCronRunning = false;
    if (!isRestarting) {
      isCronRunning = await redis.get(`${redisDb}:isCronRunning`);
      isCronRunning = isCronRunning === 'true' ? true : false;
    }
    if (!isCronRunning && cronList.length === 0) {
      await redis.set(`${redisDb}:isCronRunning`, true);
      cronList.push(new CronJob('*/10 * * * * *', runCronJob, null, true));
    } else {
      logger.info(`Cron is already running `);
    }
  } catch (error) {
    logError(error);
    logger.info(`Error came while starting the cron -------------`);
    throw error;
  }
};

const runCronJob = async () => {
  let lockKey = `${redisDb}:cron-lock`;
  let lockValue = Date.now().toString();
  try {
    logger.info(`Running the cron items --------`);
    logger.info(`lock key is -------${lockKey} and lock value is ---${lockValue}`);
    const acquired = await redis.set(lockKey, lockValue, 'NX', 'EX', 55);
    if (!acquired) {
      logger.info(`Another instance is running `);
      return;
    } else {
      let isAllResolved = await resolvePending();
      if (isAllResolved) {
        logger.info(`All tasks resolved --------------------------`);
        await stopCron();
      }
    }
  } catch (error) {
    // if there any error come in this case then we need to remove few keys from redis , set isCronRunning as false

    // ! will never come here ---------
    // const currentLockValue = await redis.get(lockKey);
    // if (currentLockValue === lockValue) {
    //   await redis.del(lockKey);

    //   logger.info(`Deleted the key ----------------${lockKey}`);
    // }
    // await redis.set(`${redisDb}:isCronRunning`, false);
    logger.info(`Error in cron job------------- `);
  }
};

const stopCron = async () => {
  try {
    // set the key value in redis to be false
    await redis.set(`${redisDb}:isCronRunning`, false);

    cronList.forEach((cron) => cron.stop());
    cronList = [];

    logger.info(`deleting the key `);
    await redis.del(`${redisDb}:cron-lock`);
    logger.info(`All the keys are deleted -----------`);
  } catch (error) {
    logger.info(`Error came while stopping the cron -------------${stopCron}`);
  }
};

module.exports = { startCron };
