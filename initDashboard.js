const ParseDashboard = require('parse-dashboard');
const config = require('./cloud/config');

const allowInsecureHTTP = true;

const initDashboard = (app) => {
	const dashboard = new ParseDashboard({ "apps": [{
	    serverURL: config.SERVER_URL + config.PARSE_MOUNT,
	    appId: config.APP_ID,
	    masterKey: config.MASTER_KEY,
	    appName: "Star Bar"
	  }]
	}, allowInsecureHTTP);

	app.use('/dashboard', dashboard);
}

module.exports = initDashboard;
