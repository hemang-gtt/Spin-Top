global.logger = require('../utils/logger');
require('dotenv').config();

const { getDatabaseConnection } = require('../DB/index');

const app = require('./app');
const http = require('http');

const server = http.createServer(app); // ! should we use https in

const port = process.env.API_PORT;
const DbName = process.env.DbName;

getDatabaseConnection(DbName);

server.listen(port, () => {
  logger.info(`Hello----listening  on the----${port}--`);
});
