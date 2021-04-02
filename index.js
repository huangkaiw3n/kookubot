
const schedule = require('node-schedule')
const http = require('http')
const {
  HTTP_PORT,
} = require('./constants')

// const BoulderWorld = require('./BoulderWorld')
const ClimbCentral = require('./ClimbCentral')
// const Bff = require('./Bff')

const everyMin = '*/1 * * * *'
const every12thHour = '0 */12 * * *'

/* ============================= BFF ================================================== */
// Run once on process start
// Bff.checkAndNotify().then(() => Bff.heartbeat())

// Run check schedule in 30s interval using 2 schedules, 1 delayed by 30s
// // This is done because cron can't go sub-minute
// schedule.scheduleJob(everyMin, Bff.checkAndNotify)
// schedule.scheduleJob(everyMin, () => setTimeout(Bff.checkAndNotify, 3000))

// Set heartbeat every 12th hour
// schedule.scheduleJob(every12thHour, Bff.heartbeat)
/* ============================= BFF ================================================== */


/* ===================== BOULDERWORLD ================================================== */
// Run once on process start
// BoulderWorld.checkAndNotify().then(() => BoulderWorld.heartbeat())

// Run check schedule in 30s interval using 2 schedules, 1 delayed by 30s
// This is done because cron can't go sub-minute
// schedule.scheduleJob(everyMin, BoulderWorld.checkAndNotify)
// schedule.scheduleJob(everyMin, () => setTimeout(BoulderWorld.checkAndNotify, 3000))

// Set heartbeat every 12th hour
// schedule.scheduleJob(every12thHour, BoulderWorld.heartbeat)

/* ===================== BOULDERWORLD ================================================== */


/* ===================== CLIMBCENTRAL ================================================== */

ClimbCentral.checkAndNotify().then(() => ClimbCentral.heartbeat())
schedule.scheduleJob(everyMin, ClimbCentral.checkAndNotify)
schedule.scheduleJob(every12thHour, ClimbCentral.heartbeat)

/* ===================== CLIMBCENTRAL ================================================== */


// Attach http port so heroku won't think web dyno failed
http.createServer(function (request, response){
  response.writeHead(200, {'Content-Type':'text/plain'})
  response.end('Okay')
}).listen(HTTP_PORT)

console.log(`Running server at port ${HTTP_PORT}`)
