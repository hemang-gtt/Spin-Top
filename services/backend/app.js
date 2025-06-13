const express = require('express');
const app = express();
const cors = require('cors');
const helmet = require('helmet');

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// CORS handled
const whitelist = [
  'http://192.168.2.195:5501',
  'https://gametimetec.com',
  'https://games.gttcasino.com',
  'https://gttcasino.com',
];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

app.use(cors(corsOptions));

app.use(helmet);

app.get('/health', (req, res, next) => {
  console.log('Health Status is ok : --------');
  return res.status(202).json({
    message: 'System health is ok !',
  });
});

module.exports = app;
