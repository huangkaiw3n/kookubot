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
  CC_CHECK_URL,
  CC_WIDGET_POST_STRING,
  CALENDAR_DISPLAY_FORMAT,
} = require('./constants')

let lastCheckTimestamp = moment()
let lastCapacityString = null

// Notification message to send when there's a slot
const NOTIFY_SLOT_MESSAGE = 'CC Funan Mon Apr 5 8pm/8:50pm has slot! https://www.climbcentral.sg/timeslot/ccf'

 // The possible Availability responses when there is space
const ONE_SPACE = '1 space'
const TWO_SPACE = '2 space'
const AVAILABLE = 'Available'

String.prototype.extract = function(prefix, suffix) {
	s = this;
	var i = s.indexOf(prefix);
	if (i >= 0) {
		s = s.substring(i + prefix.length);
	}
	else {
		return '';
	}
	if (suffix) {
		i = s.indexOf(suffix);
		if (i >= 0) {
			s = s.substring(0, i);
		}
		else {
		  return '';
		}
	}
	return s;
};

function removeLineBreaks(stringWithLinebreaks) {
  return stringWithLinebreaks ? stringWithLinebreaks.replace(/(\r\n|\n|\r|\"|<br>)/gm, '') : ''
}

// Calls the CCSH Widget endpoint and retrieve the html string
function getCapacityString() {
  return axios.post(CC_CHECK_URL, `"${CC_WIDGET_POST_STRING}"`)
    .then(res => res.data)
    .then(resData => {
      const htmlString = removeLineBreaks(_.get(resData, 'event_list_html'))
      return htmlString.extract('Thu, March 11, 7 PM to  9:20 PM</td><td><strong>Availability</strong>', '</td><td>')
    })
}

// Has 2 or more capacity
function has2OrMoreCapacity(capacityString) {
  return capacityString === TWO_SPACE || capacityString === AVAILABLE
}

// Has at least 1 capacity
function hasCapacity(capacityString) {
  return capacityString === ONE_SPACE || has2OrMoreCapacity(capacityString)
}

async function checkAndNotify() {
  try {
    // Fetch capacity String
    const capacityString = await getCapacityString()

    // Notify channel if there's capacity
    if (hasCapacity(capacityString)) {
      notifyHasSlot(NOTIFY_SLOT_MESSAGE)
    }

    lastCapacityString = capacityString
    lastCheckTimestamp = moment()
  } catch (error) {
    notifyError(error)
  }
}

async function heartbeat() {
  const message = `The last CC check was ${lastCheckTimestamp.calendar(CALENDAR_DISPLAY_FORMAT)}, with a capacity of ${lastCapacityString}`

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
