const config = require('./config');

console.log('Config file for', process.env.NODE_ENV, ':');
console.log(config);

module.exports = config;
