const express = require('express');
const app = express();
const helmet = require('helmet');

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(helmet);

app.get('/health', (req, res, next) => {
  console.log('Health Status is ok : --------');
  return res.status(202).json({
    message: 'System health is ok !',
  });
});

module.exports = app;
