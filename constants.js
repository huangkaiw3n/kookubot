const TELEGRAM_BOT_KEY = process.env.TELEGRAM_BOT_KEY
const CHANNEL_ID = process.env.CHANNEL_ID

const CHECK_URL = "https://www.picktime.com/book/getClassAppSlots?_=1615185300094&locationId=ca204f51-922f-42e3-bdb6-1f8373eb5268&accountKey=566fe29b-2e46-4a73-ad85-c16bfc64b34b&serviceKeys=6a9c21f1-7d99-40c8-9369-642088d7063f&staffKeys=&endDateAndTime=202103312359&v2=true"

const SLOT_ID = "202103151930_bea0f956-36ba-4da5-b71e-3474a4b129e2_0252d90b-ae01-47bf-addb-d405084dff3e"

const HTTP_PORT = process.env.PORT || 3000

module.exports = {
  TELEGRAM_BOT_KEY,
  CHANNEL_ID,
  CHECK_URL,
  SLOT_ID,
  HTTP_PORT,
}
