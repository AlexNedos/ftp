const getHost = () => {
    switch (process.env.NODE_ENV) {
        case 'development':
        case 'production':
            return "localhost";
        case 'local':
            return "195.201.0.2";
        default:
           throw new Error('Wrong NODE_ENV: ' + process.env.NODE_ENV);
    }
};

const getDBName = () => {
    switch (process.env.NODE_ENV) {
        case 'development':
            return 'starbar-dev'
        case 'production':
        case 'local':
            return 'starbar';
        default:
            return null;
    }
}

const DB_NAME = getDBName();
const HOST = getHost();
const PORT = 1337;
const USER = process.argv[process.argv.length - 2];
const PASS = process.argv[process.argv.length - 1]

const config = {
    APP_NAME: "Star Bar",
    PARSE_MOUNT: "/parse",
    PORT,
    APP_ID: "myAppId",
    MASTER_KEY: "bjornsen1488",
    MAIL_URI: "http://starbar.club",
    SERVER_URL: `http://${HOST}:${PORT}`,
    DB_URI: `mongodb://${USER}:${PASS}@${HOST}:27017/${DB_NAME}`
}

module.exports = config;
