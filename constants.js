const TELEGRAM_BOT_KEY = process.env.TELEGRAM_BOT_KEY
const CHANNEL_ID = process.env.CHANNEL_ID

const BW_CHECK_URL = "https://www.picktime.com/book/getClassAppSlots?_=1616385827500&locationId=ca204f51-922f-42e3-bdb6-1f8373eb5268&accountKey=566fe29b-2e46-4a73-ad85-c16bfc64b34b&serviceKeys=6a9c21f1-7d99-40c8-9369-642088d7063f&staffKeys=&endDateAndTime=202103312359&v2=true"
const BW_SLOT_ID = "202103291930_133537f2-7958-41d9-8a9b-e17beaec5506_0252d90b-ae01-47bf-addb-d405084dff3e"

const CC_CHECK_URL = 'https://app.rockgympro.com/b/widget/?a=equery'
const CC_WIDGET_POST_STRING = 'PreventChromeAutocomplete=&random=609ebe2c50ea9&iframeid=rgpiframe609ebe2be487f&mode=e&fctrl_1=offering_guid&offering_guid=7c9070dab3f64c9f8350a0e19b236405&fctrl_2=course_guid&course_guid=&fctrl_3=limited_to_course_guid_for_offering_guid_7c9070dab3f64c9f8350a0e19b236405&limited_to_course_guid_for_offering_guid_7c9070dab3f64c9f8350a0e19b236405=&fctrl_4=show_date&show_date=2021-05-17&fctrl_5=promo_code_7c9070dab3f64c9f8350a0e19b236405&promo_code_7c9070dab3f64c9f8350a0e19b236405=&ftagname_0_pcount-pid-1-4816745=pcount&ftagval_0_pcount-pid-1-4816745=1&ftagname_1_pcount-pid-1-4816745=pid&ftagval_1_pcount-pid-1-4816745=4816745&fctrl_6=pcount-pid-1-4816745&pcount-pid-1-4816745=0&ftagname_0_pcount-pid-1-4815866=pcount&ftagval_0_pcount-pid-1-4815866=1&ftagname_1_pcount-pid-1-4815866=pid&ftagval_1_pcount-pid-1-4815866=4815866&fctrl_7=pcount-pid-1-4815866&pcount-pid-1-4815866=0&ftagname_0_pcount-pid-1-4815867=pcount&ftagval_0_pcount-pid-1-4815867=1&ftagname_1_pcount-pid-1-4815867=pid&ftagval_1_pcount-pid-1-4815867=4815867&fctrl_8=pcount-pid-1-4815867&pcount-pid-1-4815867=0&ftagname_0_pcount-pid-1-4815870=pcount&ftagval_0_pcount-pid-1-4815870=1&ftagname_1_pcount-pid-1-4815870=pid&ftagval_1_pcount-pid-1-4815870=4815870&fctrl_9=pcount-pid-1-4815870&pcount-pid-1-4815870=0&ftagname_0_pcount-pid-1-4815872=pcount&ftagval_0_pcount-pid-1-4815872=1&ftagname_1_pcount-pid-1-4815872=pid&ftagval_1_pcount-pid-1-4815872=4815872&fctrl_10=pcount-pid-1-4815872&pcount-pid-1-4815872=0'

const BFF_CHECK_URL = 'https://app.acuityscheduling.com/schedule.php?action=availableTimes&showSelect=0&fulldate=1&owner=19322912'
const BFF_POST_STRING = 'type=13677944&calendar=3778158&date=2021-04-01&ignoreAppointment='
const BFF_HTML_SLOT_TO_MATCH = '2021-04-01 22:15'

const TIME_DISPLAY_FORMAT = '[Today] [at] h:mm:ss:SS A'
const CALENDAR_DISPLAY_FORMAT = {
  sameDay: TIME_DISPLAY_FORMAT,
  lastDay: TIME_DISPLAY_FORMAT
}

const HTTP_PORT = process.env.PORT || 3000

module.exports = {
  TELEGRAM_BOT_KEY,
  CHANNEL_ID,
  BW_CHECK_URL,
  BW_SLOT_ID,
  CC_CHECK_URL,
  CC_WIDGET_POST_STRING,
  BFF_CHECK_URL,
  BFF_POST_STRING,
  BFF_HTML_SLOT_TO_MATCH,
  CALENDAR_DISPLAY_FORMAT,
  HTTP_PORT,
}
