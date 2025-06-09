const { rng } = require('../../utils/rng');

const capLimit = 1000;
const rtpTarget = 0.96; // Target RTP
const capPoint = rtpTarget / capLimit; // capPoint = rtpTarget / capLimit;
const decimalupto = 2; // Should be greater than 0

const generateCrashPoint = () => {
  // let u = Math.random();
  let u = rng('float', 0, 1, 16); // Assuming up to 16 decimal places for precision

  if (u < capPoint) {
    u = capPoint;
  } else if (u > rtpTarget) {
    u = rtpTarget;
  }
  // return rtp / u;
  let number = parseFloat((rtpTarget / u).toFixed(decimalupto));
  return number;
};

module.exports = { generateCrashPoint };
