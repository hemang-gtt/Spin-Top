const fs = require('fs');
const path = require('path');
const utilities = require('../../utils/common');

const saveLogs = (message, fileName) => {
  const timestamp = utilities.getTodayDateTime();
  const todayDate = timestamp.split(' ')[0];

  // const fileLinePath = new Error().stack.split("\n")[3].trim().split(" ")[2];
  const fileLinePath = new Error().stack.split('\n')[3].trim();

  const finalMessage = `${timestamp} ~ ${fileLinePath} ~ ${message}\n`;

  // Change Directory on the server outside nodejs server
  const filePath = path.join(__dirname, `${fileName}-${todayDate}.log`);

  fs.appendFile(filePath, finalMessage, (err) => {
    if (err) {
      console.error(`Error writing to ${fileName} file:`, err);
    }
  });
};

exports.infoLog = (message) => {
  saveLogs(message, 'info');
};

exports.logError = (message) => {
  saveLogs(message.stack, 'error');
};

exports.logErrorMessage = (message) => {
  saveLogs(message, 'error');
};

exports.apiLog = (message) => {
  saveLogs(message, 'api');
};

exports.dbLog = (message) => {
  saveLogs(message, 'db');
};

exports.masterLog = (message) => {
  saveLogs(message, 'master');
};
