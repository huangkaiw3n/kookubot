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
  BFF_CHECK_URL,
  BFF_POST_STRING,
  BFF_HTML_SLOT_TO_MATCH,
  CALENDAR_DISPLAY_FORMAT,
} = require('./constants')

let lastCheckTimestamp = moment()
let lastCapacityString = null

// Calls the bff endpoint and retrieve the capacity string based on the slot id
// The response is a html string. When the timeslot has no more space, the row does not appear
function getCapacityStringByPostString(postString) {
  return axios.post(BFF_CHECK_URL, postString)
    .then(res => res.data)
}

// Capacity string is the whole html response of slots available in rows.
// See if the timeslot we want is contained in the html string
function hasCapacity(capacityString) {
  return _.includes(capacityString, BFF_HTML_SLOT_TO_MATCH)
}

async function checkAndNotify() {
  try {
    // Fetch capacity string
    const capacityString = await getCapacityStringByPostString(BFF_POST_STRING)

    // Notify channel if there's capacity
    if (hasCapacity(capacityString)) {
      notifyHasSlot(`BFF ${BFF_HTML_SLOT_TO_MATCH} has slot now! Go book! https://bffclimb.com/book-boulderzone/`)
    }

    lastCapacityString = capacityString
    lastCheckTimestamp = moment()
  } catch (error) {
    notifyError(error)
  }
}

async function heartbeat() {
  const message = `The last BFF check was ${lastCheckTimestamp.calendar(CALENDAR_DISPLAY_FORMAT)}, with a capacity of ${lastCapacityString}`

  try {
    // Make the heartbeat notification silent
    await sendMessage(message, {disable_notification: true})
  } catch (error) {
    notifyError(error)
  }
}

checkAndNotify()

module.exports = {
  checkAndNotify,
  heartbeat,
}
