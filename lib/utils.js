var os = require('os');
var debug = require('debug');
var path = require('path');
var globby = require('globby');
var fs = require('fs-extra-promise');
var _ = require('lodash');
var sha1 = require('sha1');

var Filter = function () {
  if(! this instanceof Filter) return new Filter();
};
Filter.prototype.add = function (appId, cmd) {
};
Filter.prototype.reset = function (appId) {};
Filter.prototype.exec = function (files, appId, project) {
  files = _.map(files, function (file) {
    return _.replace(file, project, '/' + appId);
  });
  return files;
};
var makeFilterClass = function (prop) {
  var NewFilter = function () {
    if (! this instanceof NewFilter) return new NewFilter();
    Filter.call(this);
    this.init();
  };
  NewFilter.prototype = _.create(Filter.prototype, _.assign({
    constructor: NewFilter,
    init: function () {}
  }, prop));
  return NewFilter;
};

var utils = {
  getIps: function () {
    var ips = [],
      ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details,alias) {
        if (details.family == 'IPv4' && details.address != '127.0.0.1') {
          ips.push(details.address);
        }
      });
    }
    return ips;
  },
  getAppInfo(address) {
    return globby(address, {absolute: true}).then(function (matcheds) {
      var promises = _.map(matcheds, function (matched) {
        return fs.existsAsync(path.join(matched, 'config.xml'))
          .then(function (res) {
            if (res) {
              return fs.readFileAsync(path.join(matched, 'config.xml'));
            } else if (fs.lstatSync(matched).isDirectory()) {
              throw new Error('这可能不是一个APIcloud项目');
            }
            throw new Error('这些不是文件夹');
          }).then(function (config) {
            config = config.toString().match(/widget.*id.*=.*(A[0-9]{13})\"/);
            if(config){
              return config[1];
            }
            throw new Error('这可能不是一个APIcloud项目');
          }).then(function(appId) {
            return [appId, matched];
          }).catch(function (err) {
            utils.warn(matched, err.message);
          });
      });
      return Promise.all(promises);
    }).then(function (res) {
      return _.compact(res);
    });
  },
  enable: function () {
    debug.enable.apply(debug, arguments);
    utils.log = debug('log');
    utils.warn = debug('warn');
    utils.error = debug('error');
  },
  getProjectFiles: function(project, ignore) {
    return fs.readFileAsync(path.join(project, '.syncignore'))
      .then(function (data) {
        return _.toArray(data.toString().match(/^[!#]+$/g));
      })
      .catch(function () {
        return [];
      })
      .then(function (ignores) {
        return globby(
          /^.*\/$/.test(project) ? (project + '**/*') : (project + '/**/*'),
          {nodir: true, absolute: false, realpath: false, ignore: ignores.concat(ignore || [])}
        );
      });
  },
  makeFilterClass: makeFilterClass,
  Filter: Filter,
  TimestampFilter: makeFilterClass({
    init: function() {
      this.__timestamps = {};
    },
    reset(appId) {
      if (appId) {
        this.__timestamps[appId] = -1;
      }
    },
    add: function (appId, cmd) {
      if (!this.__timestamps[appId]) {
        this.__timestamps[appId] = cmd.timestamp || -1;
      }
    },
    exec: function(files, appId, project) {
      var timestamp = this.__timestamps[appId];
      files = _.map(files, _.bind(function (file) {
        var mtimestamp = fs.statSync(file).mtime.getTime() / 1000;
        if (timestamp && mtimestamp < timestamp) {
          return false;
        }
        if (this.__timestamps[appId] && mtimestamp > this.__timestamps[appId]) {
          this.__timestamps[appId] = mtimestamp;
        }
        return _.replace(file, project, '/' + appId);
      }, this));
      return _.compact(files);
    }
  }),
  Sha1Filter: makeFilterClass({
    init: function() {
      this.__sha1s = {};
    },
    reset(appId) {
      if (appId) {
        var appIdRegExp = new RegExp('^!(\/' + appId + ').*').test;
        var sha1s = {};
        for (key in this.__sha1s) {
          if (!appIdRegExp.test(key)) {
            sha1s[key] = this.__sha1s;
          }
        }
        this.__sha1s = sha1s;
      } else {
        this.__timestamps = {};
      }
    },
    add: function(appId, cmd) {
      if (cmd.sha1s) {
        this.__sha1s = _.assign(cmd.sha1s, this.__sha1s);
      }
    },
    exec: function (files, appId, project) {
      files = _.map(files, _.bind(function (file) {
        var syncFile =_.replace(file, project, '/' + appId);
        var sha1 = sha1(fs.readFileSync(file));
        if (this.__sha1s[syncFile] == sha1) {
          return false;
        }
        this.__sha1s = sha1;
        return syncFile;
      }, this));
      return _.compact(files);
    }
  })
};

module.exports = utils;
