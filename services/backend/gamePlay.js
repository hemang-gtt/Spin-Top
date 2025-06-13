const { redisClient: redis, redisDb } = require('../DB/redis');
const axios = require('axios');

const { generateCrashPoint } = require('./Utilites/gameMultiplier');
const { addDummyUsers, getCashoutAllUsers, getOnStartAllUsers, updateMultiplier } = require('./Utilites/index');

let gameInterval;
let gameRunning = false;
let startTime;
let gameCount = 0;
let isFirstCount = true;
let randomNumber;
let multiplier = 1.0;

const isSpinTopGame = process.env.IS_SPIN_TOP_GAME == 'true' ? true : false;
const spinTopReadySeconds = Number(process.env.SPINTOP_READY_SEC);

// each time we are increasing 0.1
const calculateMultiplier = (endTime) => {
  let growthRate = 0.1;
  const elapsed = (endTime - startTime) / 1000; // Elapsed time in seconds
  const multiplier = 1.0 * Math.exp(growthRate * elapsed); // Exponential growth
  return parseFloat(multiplier.toFixed(2)); // Limit to 2 decimal places
};

const startGame = async () => {
  gameRunning = true;
  startTime = Date.now();

  if (gameCount === 0) {
    gameCount = Number(await redis.hget(`${redisDb}:Game`, 'Count'));
  }
  if (!gameCount) {
    await redis.hset(`${redisDb}:Game`, 'StartTime', startTime, 'isGameRunning', true, 'Count', 1);
  } else {
    await redis.hset(`${redisDb}:Game`, 'StartTime', startTime, 'isGameRunning', true, 'Count', gameCount);
  }

  logger.info(`Current game count is ----------${gameCount}`);

  randomNumber = generateCrashPoint();
  // randomNumber = 3;

  const startEvent = {
    e: 'OnStart',
    ts: startTime.toString(),
    l: gameCount.toString(),
  };

  const channel = `${process.env.REDIS_DB_NAME}-pubsub`;

  logger.info(`published on start event --------${JSON.stringify(startEvent)}-----on-----${channel}`);

  // redis.publish(channelName, message);  [both should be string because redis does not handle object datatypes]

  await redis.publish(channel, JSON.stringify(startEvent));
  logger.info(`Room ----------------(game number is -----) + ${gameCount} and round will end at -----${randomNumber}`);

  const basePath = process.env.BASE_PATH;
  // !Calling  microservice API handler of on start event
  let url;
  if (basePath === '') {
    url = `${process.env.INTERNAL_API_URL}/${process.env.BASE_PATH}webHook`;
  } else {
    url = `${process.env.INTERNAL_API_URL}/${process.env.BASE_PATH}/webHook`;
  }

  logger.info(
    `Url got hit ----------${JSON.stringify(url)} with internal api header token ${
      process.env.INTERNAL_API_HEADER_TOKEN
    }`
  );
  await axios.post(url, startEvent, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.INTERNAL_API_HEADER_TOKEN}`,
    },
  });

  // add dummy users

  let usersAtFirst = true;
  let totalUser = [];

  usersAtFirst = addDummyUsers(totalUser, 0, 1, isFirstCount);

  logger.info(`Number of users at starting are ----------${usersAtFirst.length}`);

  // publish the message of dummy user
  const onStartPushUserEvent = {
    e: 'OnStartUsers',
    users: { TotalUsers: usersAtFirst },
  };
  await redis.publish(channel, JSON.stringify(onStartPushUserEvent));
  isFirstCount = false;

  let ping = 0;
  let cashOutUsers;

  // trigger this event after 100ms
  gameInterval = setInterval(async () => {
    try {
      ping += 1;
      multiplier = calculateMultiplier(Date.now());

      //  console.log('multiplier now -----------------', multiplier, randomNumber);

      if (multiplier + 0.1 <= randomNumber) {
        // finding all the user who cashed out ------------- // ! How are we handling there win  for the users who cashout -----
        setTimeout(async () => {
          cashOutUsers = await getCashoutAllUsers(gameCount, multiplier, isFirstCount);
        }, 0); // why the delay of 0
      }
      // sending the user who are present in the end
      if (multiplier >= randomNumber) {
        logger.info(`Plane got crashed --------------siuuuuuuuuu-------------`);
        let onCrashEvent = {
          e: 'OnCrash',
          f: randomNumber.toFixed(2).toString(),
          ts: Date.now().toString(),
          l: (gameCount + 1).toString(), // need to send gameCount + 1 for ws
        };
        // !Publishing the msg of on crash
        logger.info(`Publishing the event of on crash to ws --to--${JSON.stringify(channel)}---`);
        redis.publish(channel, JSON.stringify(onCrashEvent));

        //! Publishing the data of cashout user
        if (cashOutUsers) {
          let cashOutUsersEvent = {
            e: 'CashOutUsers',
            users: cashOutUsers,
          };

          // ! Publishing the mssage for cash out user
          redis.publish(channel, JSON.stringify(cashOutUsersEvent));

          isFirstCount = true;
        }

        // ! call microservice api for win
        axios.post(
          url,
          { e: 'OnCrash', ts: Date.now().toString(), l: gameCount.toString(), m: multiplier },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.INTERNAL_API_HEADER_TOKEN}`,
            },
          }
        );

        updateMultiplier(randomNumber);
        // redis.rpush(`${redisDb}:Multiplier`, randomNumber);
        redis.hset(`${redisDb}:Game`, 'Count', gameCount + 1, 'isGameRunning', false);

        gameCount += 1;
        gameRunning = false;
        clearInterval(gameInterval);

        if (isSpinTopGame) {
          sendReady(10 - spinTopReadySeconds); //! need for frontend for animation loading ----
        }

        console.log('time to start the plain again -----------------');
        startNewGameIn(10);
      }

      // ! use for status of web socket --------
      if (ping % 100 === 0) {
        let pingEvent = {
          e: 'Ping',
        };
        //! publishing the event of PING after each 100ms that our socket connection is alive --------

        redis.publish(channel, JSON.stringify(pingEvent));
        ping = 0;
      } else if (ping % 35 === 0) {
        // ! need to ask what are we doing here ------
        setTimeout(async () => {
          let onStartUsers = await getOnStartAllUsers(gameCount, multiplier, isFirstCount);

          if (onStartUsers) {
            let onStartUsersEvent = {
              e: 'OnStartUsers',
              users: onStartUsers,
            };
            redis.publish(channel, JSON.stringify(onStartUsersEvent));
            isFirstCount = false;
          }
        }, 1500);
      }
    } catch (error) {
      logger.info(`Error came in setting the interval ----${JSON.stringify(error)}----`);
      throw error;
    }
  }, 100);

  return true;
};

// Only for spin top
function sendReady(seconds) {
  logger.info(`Spin top is running -----------`);
  setTimeout(async () => {
    await redis.publish(
      `${process.env.REDIS_DB_NAME}-pubsub`,
      JSON.stringify({ e: 'OnReady', ts: Date.now().toString() })
    );
  }, seconds * 1000);
}

function startNewGameIn(seconds) {
  // Launch the start game function after fixed interval -------
  logger.info(`Game going to start again in ${seconds} seconds..........`);
  setTimeout(startGame, seconds * 1000);
}

module.exports = { startGame, startNewGameIn, sendReady };
