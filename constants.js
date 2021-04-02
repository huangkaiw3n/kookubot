const TELEGRAM_BOT_KEY = process.env.TELEGRAM_BOT_KEY
const CHANNEL_ID = process.env.CHANNEL_ID

const BW_CHECK_URL = "https://www.picktime.com/book/getClassAppSlots?_=1616385827500&locationId=ca204f51-922f-42e3-bdb6-1f8373eb5268&accountKey=566fe29b-2e46-4a73-ad85-c16bfc64b34b&serviceKeys=6a9c21f1-7d99-40c8-9369-642088d7063f&staffKeys=&endDateAndTime=202103312359&v2=true"
const BW_SLOT_ID = "202103291930_133537f2-7958-41d9-8a9b-e17beaec5506_0252d90b-ae01-47bf-addb-d405084dff3e"

const CCSH_CHECK_URL = 'https://app.rockgympro.com/b/widget/?a=equery'
const CCSH_WIDGET_POST_STRING = 'PreventChromeAutocomplete=&random=6066aeb214868&iframeid=rgpiframe6066aeb1c81fb&mode=e&fctrl_1=offering_guid&offering_guid=7f3e222bae344639836173664e9772ea&fctrl_2=course_guid&course_guid=&fctrl_3=limited_to_course_guid_for_offering_guid_7f3e222bae344639836173664e9772ea&limited_to_course_guid_for_offering_guid_7f3e222bae344639836173664e9772ea=&fctrl_4=show_date&show_date=2021-04-05&fctrl_5=promo_code_7f3e222bae344639836173664e9772ea&promo_code_7f3e222bae344639836173664e9772ea=&ftagname_0_pcount-pid-1-361000=pcount&ftagval_0_pcount-pid-1-361000=1&ftagname_1_pcount-pid-1-361000=pid&ftagval_1_pcount-pid-1-361000=361000&fctrl_6=pcount-pid-1-361000&pcount-pid-1-361000=0&ftagname_0_pcount-pid-1-361001=pcount&ftagval_0_pcount-pid-1-361001=1&ftagname_1_pcount-pid-1-361001=pid&ftagval_1_pcount-pid-1-361001=361001&fctrl_7=pcount-pid-1-361001&pcount-pid-1-361001=0&ftagname_0_pcount-pid-1-361002=pcount&ftagval_0_pcount-pid-1-361002=1&ftagname_1_pcount-pid-1-361002=pid&ftagval_1_pcount-pid-1-361002=361002&fctrl_8=pcount-pid-1-361002&pcount-pid-1-361002=0&ftagname_0_pcount-pid-1-361003=pcount&ftagval_0_pcount-pid-1-361003=1&ftagname_1_pcount-pid-1-361003=pid&ftagval_1_pcount-pid-1-361003=361003&fctrl_9=pcount-pid-1-361003&pcount-pid-1-361003=0&ftagname_0_pcount-pid-1-361004=pcount&ftagval_0_pcount-pid-1-361004=1&ftagname_1_pcount-pid-1-361004=pid&ftagval_1_pcount-pid-1-361004=361004&fctrl_10=pcount-pid-1-361004&pcount-pid-1-361004=0'

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
  CCSH_CHECK_URL,
  CCSH_WIDGET_POST_STRING,
  BFF_CHECK_URL,
  BFF_POST_STRING,
  BFF_HTML_SLOT_TO_MATCH,
  CALENDAR_DISPLAY_FORMAT,
  HTTP_PORT,
}
