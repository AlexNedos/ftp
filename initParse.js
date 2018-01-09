const ParseServer = require('parse-server').ParseServer;
const mongocli = require('mongodb').MongoClient;
const config = require('./cloud/config');
const crypto = require('crypto');
const resolve = require('path').resolve;

const pushCertificatePathDev = __dirname + '/certificates/starbar-push-dev.p12';
const pushCertificatePathProd = __dirname + '/certificates/starbar-push-prod.p12';

const mailgunConfig = {
    module: 'parse-server-mailgun',
    options: {
        // The address that your emails come from
        fromAddress: 'StarBar <noreport@starbar.club>',
        // Your domain from mailgun.com
        domain: 'starbar.club',
        // Your API key from mailgun.com
        apiKey: 'key-95681e0017ff932a25fcb08aa23a017a',

        // Templates for mails
        templates: {
            passwordResetEmail: {
                subject: 'Reset your password',
                pathPlainText: resolve(__dirname, 'mailTemplates/ResetPassword.txt'),
                pathHtml: resolve(__dirname, 'mailTemplates/ResetPassword.html'),
                callback: function(user) {
                    const hash = crypto.createHash('sha256');
                    const token = hash.update(user.get('email') + Date.now()).digest('hex');

                    mongocli.connect(databaseUri, function(err, db) {
                        console.log("Connected correctly to server");
                        let collection = db.collection('_User');
                        collection.updateOne({
                            _id: user.id
                        }, {
                            $set: {
                                tokenResetPassword: token
                            }
                        }, { "multi": true }, (err, doc) => {
                            if (err) console.log('Error >>>', err);
                            console.log('tokenResetPassword update');
                            db.close();
                        });
                    });

                    return {
                        link: `${mailUri}/request_password_reset?token=${token}`
                    }
                }
            },

            verificationEmail: {
                subject: 'Confirm your account',
                pathPlainText: resolve(__dirname, 'mailTemplates/ConfirmPassword.txt'),
                pathHtml: resolve(__dirname, 'mailTemplates/ConfirmPassword.html')
            }
        }
    }
};

const pushConfig = {
    ios: [{
            pfx: pushCertificatePathDev, // Dev PFX or P12
            bundleId: 'ua.avm.socialbar',
            passphrase: '',
            production: false // Dev
        },
        {
            pfx: pushCertificatePathProd, // Prod PFX or P12
            bundleId: 'ua.avm.socialbar',
            passphrase: '',
            production: true // Prod
        }
    ]
};

const initParse = (app, server) => {
    const api = new ParseServer({
        databaseURI: config.DB_URI,
        cloud: __dirname + '/cloud/main.js',
        appId: config.APP_ID,
        masterKey: config.MASTER_KEY,
        serverURL: config.SERVER_URL + config.PARSE_MOUNT,
        liveQuery: {
            classNames: ["User"]
        },
        silent: true,
        appName: 'StarBar',
        // MailGun goes here

        emailAdapter: mailgunConfig,
        push: pushConfig
    });

    app.use('/parse/', api);
}

module.exports = {
	init: initParse,
	initLiveParse: (server) => ParseServer.createLiveQueryServer(server)
}