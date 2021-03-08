const axios = require('axios')
const _ = require('lodash')
const moment = require('moment-timezone')
moment.tz.setDefault('Asia/Singapore')

const {
  sendMessage,
  notifyHasSlot,
  notifyError,
} = require('./Telegram')
const {
  BW_CHECK_URL,
  BW_SLOT_ID,
} = require('./constants')

let lastCheckTimestamp = moment()
let lastCapacityString = null

// Calls the bw endpoint and retrieve the capacity string based on the slot id
function getCapacityStringBySlotId(slotId) {
  return axios.get(BW_CHECK_URL)
    .then(res => res.data)
    .then(resData => _.get(resData, `subMetadata.${slotId}`))
}

// Capacity string is like 1/20, 4/30, 0/25
// It has capacity if first char > 0
function hasCapacity(capacityString) {
  console.log('BW Capacity check', capacityString)
  console.log(moment().format())
  const firstChar = _.first(capacityString)
  return firstChar > 0
}

async function checkAndNotify() {
  try {
    // Fetch capacity string
    const capacityString = await getCapacityStringBySlotId(BW_SLOT_ID)

    // Notify channel if there's capacity
    if (hasCapacity(capacityString)) {
      notifyHasSlot('Boulderworld has slot now! Go book!')
    }

    lastCapacityString = capacityString
    lastCheckTimestamp = moment()
  } catch (error) {
    notifyError(error)
  }
}

async function heartbeat() {
  const message = `The last BW check was ${lastCheckTimestamp.calendar()}, with a capacity of ${lastCapacityString}`

  try {
    // Make the heartbeat notification silent
    await sendMessage(message, {disable_notification: true})
  } catch (error) {
    notifyError(error)
  }
}

module.exports = {
  checkAndNotify,
  heartbeat,
}
