var Server = require('../index.js');
var WebSocket = require('ws');

var server = new Server({
  projects: ['/Users/xukaixuan/Projects/taxi/passenger-gulp-app/*', '/Users/xukaixuan/Projects/taxi/hx-ser/svn/*']
});
// setTimeout(function () {
//   var ws = new WebSocket('ws://127.0.0.1:' + server.info().port);
//   ws.on('open', function() {
//     ws.send(JSON.stringify({
//       command: 2,
//       appid: 'A6932196309087',
//       timestamp: new Date().getTime() / 1000
//     }));
//   });
// }, 2000);