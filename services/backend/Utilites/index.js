const { redisClient: redis, redisDB } = require('../../DB/redis');

const generateRandomValue = (randomNumber) => {
  const probability = Math.random();
  if (probability < 0.6) {
    return '0.00';
  } else {
    const randomValue = Math.random() * randomNumber;
    return parseFloat(randomValue).toFixed(2);
  }
};

// removing the duplicate users
const removeDuplicateUser = (obj) => {
  const alreadyUsers = new Set();
  const result = {};

  for (const key in obj) {
    const users = key.split('_')[0];
    if (!alreadyUsers.has(users)) {
      alreadyUsers.add(users);
      result[key] = obj[key];
    }
  }

  return result;
};

const addDummyUsers = (totalUsers, length, randomNumber, isFirstCount) => {
  let totalRequired = 30,
    currentLength = length;
  const randomString = generateRandomValue(7).toString();
  if (currentLength < totalRequired) {
    const dummyEntries = Array.from(
      { length: totalRequired - currentLength },
      (_, i) => (
        (b = parseFloat((Math.random() * 10).toFixed(1) + '5')),
        (m = isFirstCount === true ? 0 : generateRandomValue(randomNumber)),
        { user: `${randomString}****`, bet: b, multiplier: m, cashOut: parseFloat(b * m).toFixed(2) }
      )
    );
    totalUsers.push(...dummyEntries);
  }
  if (currentLength > totalRequired) {
    totalUsers.splice(30);
  }
  // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>', totalUsers.length, totalUsers)
  return totalUsers;
};

const getOnStartAllUsers = async (gameCount, randomNumber, isFirstCount) => {
  let user = await redis.hgetall(`${redisDB}:room-${gameCount}`); //console.log(user)
  let userCahsOut = await redis.hgetall(`${redisDB}:room-${gameCount}-cashout`); //console.log(userCahsOut, 'casout')
  const User = removeDuplicateUser(user);
  const UserCahsOut = removeDuplicateUser(userCahsOut);

  let updated = [],
    isUser = false;
  if (User.length !== null) {
    for (const key in User) {
      if (UserCahsOut.length !== null) {
        for (const cashoutKey in UserCahsOut) {
          if (key === cashoutKey) {
            isUser = true;
            const userId = cashoutKey.split('_')[0];
            const cashoutData = JSON.parse(UserCahsOut[cashoutKey]);
            updated.push({
              user: userId.slice(15).concat('****'),
              bet: cashoutData.b,
              multiplier: cashoutData.f,
              cashOut: Number(parseFloat(cashoutData.f * cashoutData.b).toFixed(2)),
            });
            break;
          }
        }
      }
      if (isUser === false) {
        const userId = key.split('_')[0];
        const betData = JSON.parse(User[key]);
        updated.push({ user: userId.slice(15).concat('****'), bet: betData.a, multiplier: 0, cashOut: 0 });
      }
    }
  }

  const totalUser = updated;
  const updatedTU = addDummyUsers(totalUser, totalUser.length, randomNumber, isFirstCount);
  // isFirstCount = false
  return { TotalUsers: updatedTU };
};

const getCashoutAllUsers = async (gameCount, randomNumber, isFirstCount) => {
  let userCahsOut = await redis.hgetall(`${redisDB}:room-${gameCount}-cashout`);
  const UserCahsOut = removeDuplicateUser(userCahsOut);
  let updated = [];
  if (UserCahsOut.length !== null) {
    for (const key in UserCahsOut) {
      const userId = key.split('_')[0];
      const cashoutData = JSON.parse(UserCahsOut[key]);
      updated.push({
        user: userId.slice(15).concat('****'),
        bet: cashoutData.b,
        multiplier: cashoutData.f,
        cashOut: Number(parseFloat(cashoutData.f * cashoutData.b).toFixed(2)),
      });
    }
  }

  const totalUser = updated;
  const updatedTU = addDummyUsers(totalUser, totalUser.length, randomNumber, isFirstCount);
  // isFirstCount = true;
  return { TotalUsers: updatedTU };
};

module.exports = { getCashoutAllUsers, getOnStartAllUsers, addDummyUsers };
