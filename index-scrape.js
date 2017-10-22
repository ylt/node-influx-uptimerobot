'use strict';
var influx = require('influx'),
  http = require('https'),
  moment = require('moment'),
  _ = require('lodash');

// Input parameters
var configFile = "./config.json"

// Check if a config file was specified
if(process.argv.length > 2){
  configFile = process.argv[2];
}
//
//// Read the config
var config = require(configFile);
var influxdb = influx(config.influx);

function getMonitor(conf){
  return new Promise((resolve, reject) => {
  var options = {
		  hostname: 'api.uptimerobot.com',
		  port: 443,
		  path: '/v2/getMonitors',
		  method: 'POST',
		  headers: {
			    'Content-Type': 'application/json'
			  }
		};
  var postData = {
		  response_times : "1",
		  timezone: "1",
		  format: "json",
		  logs: "1",
		  api_key: config.uptimerobot.apikey
  }

  postData = _.merge({}, postData, conf);

  var req = http.request(options, (response)=>{
    var objectString = "";
    response.on('data', (chunk) => {
       objectString += chunk;
     });

     response.on('end', () => {
      resolve(JSON.parse(objectString));
    })
  });
  req.write(JSON.stringify(postData));
  req.end();
});
}

function processMonitor(response) {
    var offsetSeconds = Number(response.timezone) * 60; // Offset x seconds as from my account preferences
    response.monitors.forEach(function(monitor){

          /*********************************************************************
           *  Response times
           ********************************************************************/
          var responseTimes = monitor.response_times;
          var responseTimePoints = [];
          responseTimes.forEach(function(rt){
            var point = [];
            var timestamp = moment.unix(rt.datetime - offsetSeconds);
            // The value
            point[0] = {value : rt.value, time: timestamp.valueOf()};

            // The tags
            point[1] = {id : monitor.id, friendlyname: monitor.friendly_name};
            responseTimePoints.push(point);
          });
          // Now lets write this server's points
          influxdb.writePoints("responseTime", responseTimePoints, function(err, response){
            if(err){
                console.log(err);
            }
            if(response){
                console.log(response);
            }
          });

        /*********************************************************************
         *  Monitor logs
         ********************************************************************/
         var logs = monitor.logs;
         var logTimePoints = [];
         logs.forEach(function(log){
           var point = [];
           var timestamp = moment.unix(log.datetime - offsetSeconds);
           // The value
           point[0] = {type : log.type, time: timestamp.valueOf(), reason: log.reason.reason+"", reason_detail: log.reason.detail+""};

           // The tags
           point[1] = {id : monitor.id, friendlyname: monitor.friendly_name};

           logTimePoints.push(point);
         });
         logTimePoints.forEach(function(log){
             console.log(JSON.stringify(log));
         });

         //Now lets write this server's points
         influxdb.writePoints("logs", logTimePoints, function(err, response){
             if(err){
                 console.log(err);
             }
             if(response){
                 console.log(response);
             }
         });
    });

}

async function scrape() {
  let monitors = await getMonitor({
    logs: "0",
    response_times: "0"
  });

  for (let monitor of monitors.monitors) {
    let start = moment(monitor.create_datetime * 1000);
    while (start < moment()) {
      let end = start.clone().add(1, 'w');
      console.log(monitor.friendly_name, start, end);

      await getMonitor({
        monitors: monitor.id,
        logs_start_date: start.unix(),
        logs_end_date: end.unix(),
        response_times_start_date: start.unix(),
        response_times_end_date: end.unix()
      }).then((inf)=> {
        processMonitor(inf);
      });

      start = end;
    }
  }
}


scrape();
