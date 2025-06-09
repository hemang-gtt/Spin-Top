require('dotenv').config();
global.logger = require('../utils/logger');

const http = require('http');
const app = require('./app');
const { startNewGameIn } = require('./gamePlay');

const { redisClient: redis, redisDb } = require('../DB/redis');
const server = http.createServer(app);
const port = process.env.BACKEND_PORT;

const { sendReady } = require('./gamePlay');
console.log('port is -----', port);

let gameCount = 0;

const isSpinTopGame = process.env.IS_SPIN_TOP_GAME == 'true' ? true : false;
const spinTopReadySeconds = Number(process.env.SPINTOP_READY_SEC);
const gameStartTimer = process.env.GAME_START_TIMER;

const starter = async (port) => {
  logger.info(`Server is running---${port}`);

  gameCount = Number(await redis.hget(`${redisDb}:Game`, 'Count'));
  if (!gameCount) {
    gameCount = 1;

    await redis.hset(`${redisDb}:Game`, 'StartTime', '', 'isGameRunning', false, 'Count', 1);
  }
  // [publish the event name as : redis-db-pubsub   , "e": "PING"]

  redis.publish(`${process.env.REDIS_DB_NAME}-pubsub`, JSON.stringify({ e: 'PING' }));
  if (isSpinTopGame) {
    console.log('sping top ready seconds ----------------', spinTopReadySeconds);
    sendReady(10 - spinTopReadySeconds);
  }

  console.log('game count is ---------------', gameCount);

  // here we are calling start new game -------------
  startNewGameIn(gameStartTimer);
};

let isCleanUp = false;

function cleanup() {
  if (isCleanUp) {
    return;
  }
  if (gameCount > 0) {
    redis.hset(`${redisDb}:Game`, 'isGameRunning', false, 'Count', gameCount + 1);
  } else {
    redis.hmset(`${redisDb}:Game`, 'isGameRunning', false);
  }

  redis.rpush(`${redisDb}:ErrorGame`, gameCount); // set that some error came in gameplay

  if (gameInterval) {
    clearInterval(gameInterval);
  }

  server.close(() => {
    process.exit(0); // gracefully shut down the server ---
  });
}

process.on('uncaughtException', (err) => {
  console.error(`Unhandled exception -----`, err);

  cleanup();
  process.exit(1);
});
server.listen(port, starter(port));
