/* global setTimeout */
var Async = require('async'),
    PushBullet = require('../lib/pushbullet'),
    errors = require('../lib/errorHandling'),
    workers = {};

var sendNotification = function(results, options) {
    if (options.format === "list") {
        return PushBullet.broadcast.list(
            options.name,
            results.list
        );
    }
    
    if (options.format === "count") {
        return PushBullet.broadcast.note(
            options.name,
            results.count.template.replace(/%s/, results.count.value)
        );
    }
};

var Iterate = function(action, options, id) {
    var method = function(done) {
        // console.log([ id, " has a new iteration." ].join());
        action(function(err, results) {
            if(err) {
                return done(err);
            }
            
            if (results !== false) {
                sendNotification(results, options);
            }

            var wait = options.interval;

            // Different check interval if no results (eg longer)
            // useless yet
            if (results === false) {
                wait = options.interval;
            } else if (results.length < 1) {
                wait = options.interval;
            }

            return setTimeout(function() {
                return method(done);
            }, wait);
        });
    };
    return method;
};

module.exports = function(enabledSites) {
    Async.mapLimit(
        enabledSites,
        3,
        function(enabled, done) {
            var site = null;
            try {
                site = require("./" + enabled.name);
            } catch (ignore) {
                errors.logWarn("Site not found", enabled.name);
            }
            if (site) {
                if (!site.hasOwnProperty('init') || !site.hasOwnProperty('name') || !site.hasOwnProperty('worker')) {
                    site = false;
                }
            }
            return site.init(enabled, function() {
                return done(
                    null,
                    {
                        id: enabled.name,
                        options: {
                            interval: enabled.checkInterval * 1000 * 60,
                            format: enabled.format,
                            name: site.name
                        },
                        worker: site.worker
                    }
                );
            });
        },
        function(err, availableSites) {
            availableSites.forEach(function(site) {
                workers[site.id] = Iterate(
                    site.worker,
                    site.options,
                    site.id
                );
            });
            
            return Async.parallel(workers);
        }
    );
};