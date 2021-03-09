
const schedule = require('node-schedule')
const http = require('http')
const {
  HTTP_PORT,
} = require('./constants')

const BoulderWorld = require('./BoulderWorld')
// const ClimbCentral = require('./ClimbCentral')

const every3Min = '*/3 * * * *'
const everyHour = '0 * * * *'

// Run once on process start then schedule
BoulderWorld.checkAndNotify().then(() => BoulderWorld.heartbeat())
schedule.scheduleJob(every3Min, BoulderWorld.checkAndNotify)
schedule.scheduleJob(everyHour, BoulderWorld.heartbeat)

// ClimbCentral.checkAndNotify().then(() => ClimbCentral.heartbeat())
// schedule.scheduleJob(every3Min, ClimbCentral.checkAndNotify)
// schedule.scheduleJob(everyHour, ClimbCentral.heartbeat)

// Attach http port so heroku won't think web dyno failed
http.createServer(function (request, response){
  response.writeHead(200, {'Content-Type':'text/plain'})
  response.end('Okay')
}).listen(HTTP_PORT)

console.log(`Running server at port ${HTTP_PORT}`)
