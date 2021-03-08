const TELEGRAM_BOT_KEY = process.env.TELEGRAM_BOT_KEY
const CHANNEL_ID = process.env.CHANNEL_ID

const BW_CHECK_URL = "https://www.picktime.com/book/getClassAppSlots?_=1615185300094&locationId=ca204f51-922f-42e3-bdb6-1f8373eb5268&accountKey=566fe29b-2e46-4a73-ad85-c16bfc64b34b&serviceKeys=6a9c21f1-7d99-40c8-9369-642088d7063f&staffKeys=&endDateAndTime=202103312359&v2=true"
const BW_SLOT_ID = "202103151930_bea0f956-36ba-4da5-b71e-3474a4b129e2_0252d90b-ae01-47bf-addb-d405084dff3e"

const CCSH_CHECK_URL = 'https://app.rockgympro.com/b/widget/?a=equery'
const CCSH_WIDGET_POST_STRING = 'PreventChromeAutocomplete=&random=6045ac0ddc5d5&iframeid=rgpiframe6045ac0d94c63&mode=e&fctrl_1=offering_guid&offering_guid=a7a63a6ff6384aabb2a5d9151d2c9a08&fctrl_2=course_guid&course_guid=&fctrl_3=limited_to_course_guid_for_offering_guid_a7a63a6ff6384aabb2a5d9151d2c9a08&limited_to_course_guid_for_offering_guid_a7a63a6ff6384aabb2a5d9151d2c9a08=&fctrl_4=show_date&show_date=2021-03-11&fctrl_5=promo_code_a7a63a6ff6384aabb2a5d9151d2c9a08&promo_code_a7a63a6ff6384aabb2a5d9151d2c9a08=&ftagname_0_pcount-pid-1-4815992=pcount&ftagval_0_pcount-pid-1-4815992=1&ftagname_1_pcount-pid-1-4815992=pid&ftagval_1_pcount-pid-1-4815992=4815992&fctrl_6=pcount-pid-1-4815992&pcount-pid-1-4815992=0&ftagname_0_pcount-pid-1-4815993=pcount&ftagval_0_pcount-pid-1-4815993=1&ftagname_1_pcount-pid-1-4815993=pid&ftagval_1_pcount-pid-1-4815993=4815993&fctrl_7=pcount-pid-1-4815993&pcount-pid-1-4815993=0&ftagname_0_pcount-pid-1-4888355=pcount&ftagval_0_pcount-pid-1-4888355=1&ftagname_1_pcount-pid-1-4888355=pid&ftagval_1_pcount-pid-1-4888355=4888355&fctrl_8=pcount-pid-1-4888355&pcount-pid-1-4888355=0&ftagname_0_pcount-pid-1-4852630=pcount&ftagval_0_pcount-pid-1-4852630=1&ftagname_1_pcount-pid-1-4852630=pid&ftagval_1_pcount-pid-1-4852630=4852630&fctrl_9=pcount-pid-1-4852630&pcount-pid-1-4852630=0'

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
  CALENDAR_DISPLAY_FORMAT,
  HTTP_PORT,
}
