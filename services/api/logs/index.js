const fs = require('fs');
const path = require('path');

const { getTodayDateTime } = require('../../utils/common');

const saveLogs = (message, fileName) => {
  const timeStamp = getTodayDateTime();
  const todayDate = timeStamp.split(' ')[0];
  const fileLinePath = new Error().stack.split('\n')[3].trim();

  const finalMessage = `${timeStamp} ~ ${fileLinePath} ~ ${message}\n`;
  const filePath = path.join(__dirname, `${fileName}-${todayDate}.log`);

  fs.appendFile(filePath, finalMessage, (err) => {
    if (err) {
      console.error(`Error writting to ${fileName} file: `, err);
    }
  });
};

const infoLog = (message) => {
  saveLogs(message, 'info');
};

const logError = (message) => {
  saveLogs(message.stack, 'error');
};

const logErrorMessage = (message) => {
  saveLogs(message, 'error');
};

const apiLog = (message) => {
  saveLogs(message, 'api');
};

const dbLog = (message) => {
  saveLogs(message, 'db');
};

const masterLog = (message) => {
  saveLogs(message, 'master');
};

module.exports = { infoLog, logError, logErrorMessage, apiLog, dbLog, masterLog };
