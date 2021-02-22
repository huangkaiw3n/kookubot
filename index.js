const axios = require('axios')
const _ = require('lodash')
const {serializeError} = require('serialize-error')
const qs = require('qs')

const moment = require('moment-timezone')
moment.tz.setDefault('Asia/Singapore')

const schedule = require('node-schedule')

const {
  TELEGRAM_BOT_KEY,
  CHANNEL_ID,
  CHECK_URL,
  SLOT_ID,
} = require('./constants')

let lastCheckTimestamp = moment()
let lastCapacityString = null

// Calls the bw endpoint and retrieve the capacity string based on the slot id
function getCapacityStringBySlotId(slotId) {
  return axios.get(CHECK_URL)
    .then(res => res.data)
    .then(resData => _.get(resData, `subMetadata.${slotId}`))
}

// Capacity string is like 1/20, 4/30, 0/25
// It has capacity if first char > 0
function hasCapacity(capacityString) {
  console.log('Capacity check', capacityString)
  console.log(moment().format())
  const firstChar = _.first(capacityString)
  return firstChar > 0
}

function sendMessageToChannel(message, channelId, options) {
  const queryString = {
    chat_id: channelId,
    text: message,
    ...options
  }
  return axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_KEY}/sendMessage`, qs.stringify(queryString))
}

function notifyHasSlot() {
  const message = 'Go book now!! Got slot'
  return sendMessageToChannel(message, CHANNEL_ID)
}

function notifyError(error) {
  const message = JSON.stringify(serializeError(error), null, 2)
  return sendMessageToChannel(message, CHANNEL_ID)
}

async function checkAndNotify() {
  try {
    // Fetch capacity string
    const capacityString = await getCapacityStringBySlotId(SLOT_ID)

    // Notify channel if there's capacity
    if (hasCapacity(capacityString)) {
      notifyHasSlot()
    }

    lastCapacityString = capacityString
    lastCheckTimestamp = moment()
  } catch (error) {
    notifyError(error)
  }
}

async function heartbeat() {
  const message = `The last check was ${lastCheckTimestamp.calendar()}, with a capacity of ${lastCapacityString}`

  try {
    // Make the heartbeat notification silent
    await sendMessageToChannel(message, CHANNEL_ID, {disable_notification: true})
  } catch (error) {
    notifyError(error)
  }
}

const every5Min = '*/5 * * * *'
const everyHour = '0 * * * *'

// Run once on process start then schedule
checkAndNotify().then(() => heartbeat())

const mainJob = schedule.scheduleJob(every5Min, checkAndNotify)
const heartbeatJob = schedule.scheduleJob(everyHour, heartbeat)
