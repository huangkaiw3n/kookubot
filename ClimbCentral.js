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
  CCSH_CHECK_URL,
  CCSH_WIDGET_POST_STRING,
} = require('./constants')

let lastCheckTimestamp = moment()
let lastCapacityString = null


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
  return axios.post(CCSH_CHECK_URL, `"${CCSH_WIDGET_POST_STRING}"`)
    .then(res => res.data)
    .then(resData => {
      const htmlString = removeLineBreaks(_.get(resData, 'event_list_html'))
      return htmlString.extract('Thu, March 11, 7 PM to  9:20 PM</td><td><strong>Availability</strong>', '</td><td>')
    })
}

// Capacity string is like
// 1 space, 2 space, Available, Full.&nbsp;Please make a different selection.
// It has capacity if first char > 0
function has2OrMoreCapacity(capacityString) {
  console.log('CCSH Capacity check', capacityString)
  console.log(moment().format())

  return capacityString === '2 space' || capacityString === 'Available'
}

async function checkAndNotify() {
  try {
    // Fetch capacity String
    const capacityString = await getCapacityString()

    // Notify channel if there's 2 capacity
    if (has2OrMoreCapacity(capacityString)) {
      notifyHasSlot('ANGELA GO BOOK NOW!!!!! https://www.climbcentral.sg/timeslot/ccsh-first-timer')
    }

    lastCapacityString = capacityString
    lastCheckTimestamp = moment()
  } catch (error) {
    notifyError(error)
  }
}

async function heartbeat() {
  const message = `The last CCSH check was ${lastCheckTimestamp.calendar()}, with a capacity of ${lastCapacityString}`

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
