const express = require('express');
const config = require('./cloud/config');
const http = require('http');
const initDashboard = require('./initDashboard');
const initParse = require('./initParse');

const app = express();

initDashboard(app);

if (process.env.NODE_ENV !== 'local') {
  initParse.init(app);
}

app.use('/', (req, res) => res.send('I am fine.'));

const httpServer = http.createServer(app);

httpServer.listen(config.PORT, () => {
	console.log('parse-server-example running on port ' + config.PORT+ '.');
});

if (process.env.NODE_ENV !== 'local') {
  // This will enable the Live Query real-time server
  initParse.initLiveParse(httpServer);
}
