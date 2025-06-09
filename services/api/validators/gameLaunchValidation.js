const Joi = require('joi');

const gameLaunchValidationSchema = Joi.object({
  productId: Joi.string().max(255).required(),
  sessionToken: Joi.string().max(255).required(),
  lang: Joi.string().required(),
  lobbyUrl: Joi.string().uri(),
  targetChannel: Joi.string().lowercase().valid('desktop', 'mobile').required(),
  consumerId: Joi.string().required(),
  currency: Joi.string().optional(),
});

module.exports = { gameLaunchValidationSchema };
