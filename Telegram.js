const axios = require('axios')
const qs = require('qs')
const {serializeError} = require('serialize-error')

const {
  TELEGRAM_BOT_KEY,
  CHANNEL_ID,
} = require('./constants')

function sendMessage(message, options) {
  const queryString = {
    chat_id: CHANNEL_ID,
    text: message,
    ...options
  }
  return axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_KEY}/sendMessage`, qs.stringify(queryString))
}

function notifyHasSlot(message = 'Go book now!! Got slot') {
  return sendMessage(message)
}

function notifyError(error) {
  const message = JSON.stringify(serializeError(error), null, 2)
  return sendMessage(message)
}

module.exports = {
  sendMessage,
  notifyHasSlot,
  notifyError,
}
