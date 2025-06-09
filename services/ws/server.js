global.logger = require('../utils/logger');
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');

const app = require('./app');
const { redisClient: redis, redisPubSub, redisDb } = require('../DB/redis');
const {
  verifyToken,
  verifyCurrentWebSocketSession,
  isValidTwoDecimalNumber,
  isValidBetId,
  generateRandomId,
  calculateMultiplier,
} = require('../utils/common');

const { checkAndSetBalance, checkPreviousBets, verifySingleSession } = require('./Controller/controller.js');
const {
  atomicBetValidationScriptForCurrentRound,
  atomicBetValidationScriptForNextRound,
  atomicCashoutScript,
  cancelBetLuaScript,
} = require('./Scripts/luaScripts.js');

const { rateLimitRequest, checkRepeatButton } = require('./utils/rateLimiter');
const { infoLog } = require('./logs/index.js');
const port = process.env.WEBSOCKET_PORT;

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

let gameRunning = false;
let startTime;
let gameCount = 0;

let ping = false;
let pingException = true;
let pingInterval;

wss.on('connection', async (ws, req) => {
  console.log('ws line 25 i ----------');
  // we will listen all the emitted properties from ws ----
  ws.on('message', async (message) => {
    console.log('listening the message ---------------------');
    try {
      if (pingException) {
        return ws.send(
          JSON.stringify({
            e: 'Server-Error',
            msg: 'Can not process your request, Something went wrong on the server ',
          })
        );
      }
      const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
      const token = params.get('token');
      const userId = params.get('userId');
      const tokenData = jwt.decode(token);

      if (process.env.LOAD_TESTING !== 'true') {
        const isCurrentSession = await verifyCurrentWebSocketSession(token, ws._id);

        console.log('is current session --------------', isCurrentSession);
        if (!token || !userId || !verifyToken(token) || !isCurrentSession) {
          ws.send(JSON.stringify({ e: 'Error', msg: 'Token is invalid or previous session is opened! ' }));

          return ws.terminate;
        } else {
          if (!token || !userId) {
            ws.send(JSON.stringify({ e: 'ERROR', msg: `token is invalid or previous session is opened!` }));
            return ws.terminate();
          }
        }
      }

      const data = JSON.parse(message);

      if (rateLimitRequest(ws, data)) {
        return ws.send(JSON.stringify({ e: 'Invalid', msg: 'Too many requests!' }));
      }

      let wsData = await redis.get(`${redisDb}-user:${userId}`);

      if (!wsData) {
        return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request! User not found!!` }));
      }

      wsData = JSON.parse(wsData);

      // now do validation checks for BET ,  CASHOUT, CANCEL BET

      if (data.e === 'Bet') {
        let isValid = isValidTwoDecimalNumber(data.a);
        let isValidBtn = isValidTwoDecimalNumber(data.btn);

        if (
          !isValid ||
          !isValidBtn ||
          !data.a ||
          !data.btn ||
          data.e ||
          !token ||
          !userId ||
          Number(data.btn) < 1 ||
          Number(data.btn) > 2
        ) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: 'Invalid Request!' }));
        }

        const isValidCurrency = wsData.c === true || wsData.c === 'true';
        if (!isValidCurrency) {
          return ws.send(JSON.stringify({ e: 'ERROR', msg: 'Currency is Invalid!' }));
        }

        if (Number(data.a) < Number(wsData.minStake)) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Bet Amount cannot be less than ${wsData.minStake}` }));
        } else if (Number(data.a) > Number(wsData.maxStake)) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Bet Amount cannot be greater than ${wsData.maxStake}` }));
        }
        if (checkRepeatButton(ws, data)) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Same button repeated. Try different!` }));
        }

        data.a = parseFloat(data.a);
      } else if (data.e === 'Cashout' || data.e === 'CancelBet') {
        let isValid = isValidBetId(data.id);
        let isValidBtn = isValidTwoDecimalNumber(data.btn);
        if (
          !isValid ||
          !isValidBtn ||
          !data.id ||
          !data.btn ||
          !data.e ||
          !token ||
          !userId ||
          Number(data.btn) < 1 ||
          Number(data.btn) > 2
        ) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request!` }));
        }
      }

      if (data.e === 'Bet' && !gameRunning) {
        // game is not running and someone place the bet
        const betId = generateRandomId(4, 5);

        const newBet = { id: betId, bet: data.a, btn: data.btn };

        const roomHash = `{room-${gameCount}}`;
        const playerBetsKey = `${redisDb}:${roomHash}-player`;
        const betDetailKey = `${redisDb}:${roomHash}`;
        const luaResult = await redis.eval(
          atomicBetValidationScriptForCurrentRound,
          1,
          playerBetsKey,
          userId,
          JSON.stringify(newBet)
        );

        if (luaResult === 'MAX_BETS') {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: 'Invalid Request' }));
        }

        if (luaResult === 'DUPLICATE_BET') {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request! Same Id not allowed.` }));
        }

        await redis.hset(
          betDetailKey,
          `${userId}_${betId}`,
          JSON.stringify({ a: data.a, api: 'PENDING', operatorId: tokenData.operatorId })
        );
        console.log(`Player placed a bet: ${data.a}`);

        let response = {
          e: 'BetPlaced',
          id: betId,
          b: updatedBalance.balance,
          a: data.a,
          btn: data.btn,
          msg: `bet is Placed of amount ${data.a}`,
        };

        if (process.env.LOAD_TESTING !== true) {
          const updatedBalance = await checkAndSetBalance(ws, userId, data.a, 'Bet');

          infoLog({
            e: 'BetPlaced',
            id: betId,
            b: updatedBalance.balance,
            a: data.a,
            btn: data.btn,
            msg: `bet is placed of amount ${data.a}`,
          });

          return ws.send(JSON.stringify(response));
        } else {
          return ws.send(JSON.stringify(response));
        }
      } else if (data.e === 'Cashout' && gameRunning) {
        const userField = `${userId}_${data.id}`;
        const multiplier = calculateMultiplier(startTime, Date.now());

        const roomHash = `{room-${gameCount}}`;
        const betKey = `${redisDb}:${roomHash}`;
        const cashoutKey = `${redisDb}:${roomHash}-cashout`;
        const [status, luaMultiplier, luaBetAmountOrMsg] = await redis.eval(
          atomicCashoutScript,
          2,
          betKey,
          cashoutKey,
          userField,
          multiplier.toString(),
          tokenData.operatorId
        );

        console.log('status is -----------------', status);
        if (status !== 1) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request! ${luaBetAmountOrMsg}` }));
        }

        console.log(`Player cashed out at ${luaMultiplier}x`);

        if (process.env.LOAD_TESTING !== 'true') {
          const cashoutAmount = luaBetAmountOrMsg * luaMultiplier;
          const updatedBalance = await checkAndSetBalance(ws, userId, cashoutAmount, 'Cashout');

          console.log('updated balance ------------', updatedBalance);
          if (updatedBalance.status !== 'SUCCESS') return;

          infoLog({
            e: 'CashoutDone',
            b: updatedBalance.balance,
            f: luaMultiplier,
            btn: data.btn,
            msg: `Player cashed out at ${luaMultiplier}x`,
          });

          return ws.send(
            JSON.stringify({
              e: 'CashoutDone',
              b: updatedBalance.balance,
              f: luaMultiplier,
              w: cashoutAmount,
              btn: data.btn,
              msg: `Player cashed out at ${luaMultiplier}x`,
            })
          );
        } else {
          return ws.send(
            JSON.stringify({
              e: 'CashoutDone',
              f: luaMultiplier,
              btn: data.btn,
              msg: `Player cashed out at ${luaMultiplier}x`,
            })
          );
        }
      } else if (data.e === 'Bet') {
        const roomHash = `{room-${gameCount + 1}}`;
        const userKey = `${redisDb}:${roomHash}-player`;
        const betDetailKey = `${redisDb}:${roomHash}`;

        console.log(
          `roomHash----------${roomHash}-----------userKey-----------${userKey} ------bet Details key --------${betDetailKey}`
        );

        // const userKey = `${redisDb}:room-${gameCount + 1}-player`;
        // const userField = userId;
        const betId = generateRandomId(4, 5);
        const betObj = { id: betId, bet: data.a, btn: data.btn };
        const betStr = JSON.stringify(betObj);

        const [status, msg] = await redis.eval(
          atomicBetValidationScriptForNextRound,
          1,
          userKey,
          userId,
          betStr,
          data.btn.toString()
        );

        if (status !== 1) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg }));
        }

        // Save to room bet mapping
        await redis.hset(
          betDetailKey,
          `${userId}_${betId}`,
          JSON.stringify({ a: data.a, api: 'PENDING', operatorId: tokenData.operatorId })
        );

        if (process.env.LOAD_TESTING !== 'true') {
          const updatedBalance = await checkAndSetBalance(ws, userId, data.a, 'Bet');
          if (updatedBalance.status !== 'SUCCESS') return;
          infoLog({
            e: 'WaitingForNextRound',
            id: betId,
            b: updatedBalance.balance,
            a: data.a,
            btn: data.btn,
            msg: 'Waiting For Next Round',
          });
          return ws.send(
            JSON.stringify({
              e: 'WaitingForNextRound',
              id: betId,
              b: updatedBalance.balance,
              a: data.a,
              btn: data.btn,
              msg: 'Waiting For Next Round',
            })
          );
        } else {
          return ws.send(
            JSON.stringify({
              e: 'WaitingForNextRound',
              id: betId,
              a: data.a,
              btn: data.btn,
              msg: 'Waiting For Next Round',
            })
          );
        }
      } else if (data.e === 'CancelBet') {
        const userField = `${userId}_${data.id}`;
        let betKey, userBetsKey, roomHash;

        if (gameRunning) {
          roomHash = `{room-${gameCount + 1}}`;
        } else {
          roomHash = `{room-${gameCount}}`;
        }

        betKey = `${redisDb}:${roomHash}`;
        userBetsKey = `${redisDb}:${roomHash}-player`;

        // Execute Lua script atomically
        const [status, betAmountOrMsg] = await redis.eval(
          cancelBetLuaScript,
          2,
          betKey,
          userBetsKey,
          userField,
          userId,
          data.id
        );

        if (status !== 1) {
          return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request! ${betAmountOrMsg}` }));
        }

        // On success
        if (process.env.LOAD_TESTING !== 'true') {
          const updatedBalance = await checkAndSetBalance(ws, userId, betAmountOrMsg, 'CancelBet');

          console.log('updated balance is -----------', updatedBalance);
          if (updatedBalance.status !== 'SUCCESS') return;

          infoLog({ e: 'BetCancelled', b: updatedBalance.balance, msg: `Bet is Cancelled`, btn: data.btn });
          return ws.send(
            JSON.stringify({ e: 'BetCancelled', b: updatedBalance.balance, msg: `Bet is Cancelled`, btn: data.btn })
          );
        } else {
          return ws.send(JSON.stringify({ e: 'BetCancelled', msg: `Bet is Cancelled`, btn: data.btn }));
        }
      } else {
        console.log('invalid request! no event find --------------');
        return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request!` }));
      }
    } catch (error) {
      console.log(error);
      return ws.send(JSON.stringify({ e: 'Invalid', msg: `Invalid Request!` }));
    }
  });

  // at time of close

  ws.on('close', async () => {
    // someone trying to close the session , remove the data from redis

    const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
    console.log('params are ---------', params);
    const token = params.get('token');
    const userId = params.get('userId');

    console.log('token ---------------', token);

    if (token && userId && verifyToken(token) && process.env.LOAD_TESTING !== 'true') {
      const uuid = await redis.get(`${redisDb}-token:${token}`);

      if (uuid === ws.id) {
        await redis.del(`${redisDb}-token:${token}`);
      }

      console.log('close api called ----------');
    }
  });

  ws.on('error', (error) => {
    console.log(`Error: ` + error);
  });

  if (pingException) {
    ws.send(
      JSON.stringify({ e: 'SERVER-ERROR', msg: `Cannot process your request. something went wrong on the server!` })
    );
    return ws.terminate();
  }
  if (gameCount === 0) {
    let isGameData = await getGameData();
    if (!isGameData) {
      ws.send(
        JSON.stringify({ e: 'SERVER-ERROR', msg: `Cannot process your request. something went wrong on the server!` })
      );
      return ws.terminate();
    }
  }
  const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
  const token = params.get('token');
  const userId = params.get('userId');

  console.log('token is -----------', token);
  console.log('user id is ---------', userId);

  if (process.env.LOAD_TESTING !== 'true') {
    // main logic
    const wsId = uuid.v4();
    ws.id = wsId;
    let session = null;

    if (!token || !userId || !verifyToken(token) || !(session = await verifySingleSession(userId, token, wsId))) {
      // console.log(token, userId, wsId)
      ws.send(JSON.stringify({ e: 'ERROR', msg: `token is invalid or previous session is opened!` }));
      return ws.terminate();
    }
    if (session.c === false || session.c === 'false') {
      return ws.send(JSON.stringify({ e: 'ERROR', msg: `Currency is Invalid!` }));
    }
    // console.log('SESSION::: > ', session);
    ws.send(
      JSON.stringify({
        e: 'User',
        u: session.u,
        b: session.b,
        l: session.l,
        c: session.c,
        range: session.range,
        buttons: session.buttons,
        defaultBet: session.defaultBet,
        multiplier: session.multiplier,
      })
    );
  } else {
    // dummy logic
    if (!token || !userId) {
      ws.send(JSON.stringify({ e: 'ERROR', msg: `token is invalid or previous session is opened!` }));
      return ws.terminate();
    }

    ws.send(JSON.stringify({ e: 'User', u: 'test_user', b: '997.25' }));
  }

  await checkPreviousBets(ws, userId, gameCount, gameRunning);

  if (gameRunning) {
    return ws.send(JSON.stringify({ e: 'OnRunning', ts: startTime, cts: Date.now().toString() }));
  }
});

// Hand shake done --------
server.on('upgrade', (request, socket, head) => {
  console.log('line 84 -------------');

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(port, async () => {
  console.log(`Server is running on the port ----${port}`);
  const channelName = `${process.env.REDIS_DB_NAME}-pubsub`;

  console.log('channel name is --------------', channelName);
  try {
    pingInterval = setInterval(() => {
      if (!ping && !pingException) {
      }
    }, 12 * 1000);

    redisPubSub.subscribe(channelName, (err, count) => {
      if (err) {
        console.log(`Eror in subscribing ------------`, err);
      } else {
        console.log(`Subscribed Successfully! The client is currently connected to ${count} channels---`);
      }
    });

    redisPubSub.on('message', (channel, message) => {
      message = JSON.parse(message);
      if (channel === channelName) {
        pingException = false;
        ping = true; // setting that ping is true
        let data;
        if (message.e === 'OnStart') {
          gameRunning = true;
          startTime = Number(message.ts);
          gameCount = Number(message.l);

          data = { e: message.e, ts: message.ts, l: message.l };
        } else if (message.e === 'On Crash') {
          gameRunning = false;
          gameCount = Number(message.l);
          data = {
            e: message.e,
            ts: message.ts,
            f: message.f,
          };
        }

        if (message.e === 'OnStart' || message.e === 'OnCrash') {
          // send the data to all the clients which are connected by server
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
        } else if (message.e === 'OnReady') {
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          });
        } else if (message.e === 'OnStartUsers' || message.e === 'CashOutUsers') {
          wss.clients.forEach(async (client) => {
            if (client.readyState === WebSocket.OPEN) {
              data = message.users;
              client.send(JSON.stringify(data));
            }
          });
        }
      }
    });

    await getGameData();
  } catch (error) {
    console.log('error is ------', error);
  }
});

async function getGameData() {
  try {
    let game = await redis.hmget(`${redisDb}:Game`, 'StartTime', 'Count', 'isGameRunning');

    if (game) {
      startTime = Number(game[0]);
      gameCount = Number(game[1]);
      gameRunning = game[2] === 'true' ? true : false;
      pingException = false;
    }

    return true;
  } catch (error) {
    console.log('Error connecting in backend --------------');

    return false;
  }
}

let isCleaningUp = false;
function cleanup() {
  if (isCleaningUp) {
    return;
  }

  isCleaningUp = true;
  console.log('initialising the clean up -----------');

  if (pingInterval) {
    clearInterval(pingInterval);

    console.log('ping interval cleared ------------');
  }

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ e: 'Server-Error', msg: 'Server is shutting down.' }), () => {
        client.close(); // close the ws connection from wss
      });
    }
  });
  // close all the web socket connections ----------

  wss.close(() => {
    console.log(`All the web socket server are closed--------`);
    server.close(() => {
      console.log(`Http server closed ------`);
      process.exit(0); // exit the process after the server has closed
    });
  });

  // In case of any delay, force exit after a timeout
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', cleanup); // pm2 process got killed inside docker
process.on('SIGINT', cleanup); // ctrl + c
