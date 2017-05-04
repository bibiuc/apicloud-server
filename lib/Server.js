var http = require('http');
var utils = require('./utils.js');
var _ = require('lodash');
var Express = require('express');
var WebSocket = require('ws');
var debug = require('debug');
var path = require('path');


var CLI_COMMAND = -1;

var Server = function(options) {
  if (!this instanceof Server) return new Server(options);
  options = options || {};
  this.params = options;
  utils.enable(options.level || '*');
  var app = new Express();
  var server = http.createServer(app);
  var socket = new WebSocket.Server({server: server});
  server.listen(this.info().port, _.bind(function() {
    utils.log(utils.getIps(), this.info().port);
  }, this));
  this.__server = server;
  this.__express = app;
  this.__ws = socket;
  this.__projects = {};
  this.__ignores = {};
  this.init(options);
};
Server.prototype.getFilter = (function () {
  var timestampFilter = new utils.TimestampFilter();
  return function () {
    return timestampFilter;
  };
})();
Server.prototype.setFilter = function(filter) {
  if (arguments.length) {
    if (filter instanceof utils.Filter) {
      this.getFilter = function () {
        return filter;
      };
      return this.getFilter();
    }
    if (_.isObject(filter)) {
      var Filter = utils.makeFilterClass(filter);
      var newFilter = new Filter();
      this.getFilter = function () {
        return newFilter;
      };
      return this.getFilter();
    }
    if (_.isString(filter)) {
      switch (filter) {
        case 'timestamp':
          var timestampFilter = new utils.TimestampFilter();
          this.getFilter = function () {
            return timestampFilter;
          };
          break;
        case 'sha1':
          var sha1Filter = new utils.Sha1Filter();
          this.getFilter = function () {
            return sha1Filter;
          };
        default:
          utils.warn('无效的过滤器参数');
          break;
      }
      return this.getFilter();
    }
  }
  utils.warn('获得过滤器过滤器');
  return this.getFilter();
};
Server.prototype.init = function(options) {
  options.projects && this.addProjects(options.projects);
  options.filter && this.setFilter(options.filter);
  this.__ws.on('connection', _.bind(function(socket) {
    var id = socket._ultron.id;
    utils.log('当前连接设备数:%d, 连结的Id：%d, 当前状态: %d', this.__ws.clients.size, id, socket.readyState);
    socket.send(JSON.stringify({
      command : 7,
      port : this.info().port
    }));
    socket.on('error', function (err) {
      utils.error(err);
    });
    socket.on('message', _.bind(function(res){
      res = JSON.parse(res);
      var promise;
      switch (res.command) {
        case CLI_COMMAND:
          promise = this.payload(res.payload, socket);
          if (promise) {
            promise.then(function () {
              socket.close();
            }).catch(function (err) {
              socket.send(JSON.stringify({
                command:CLI_COMMAND,
                payload: {
                  content: JSON.stringify(res.payload) + ':' + err.message,
                  level: 'error'
                }
              }));
              socket.close();
            });
          } else {
            socket.close();
          }
          break;
        case 2:
          utils.log('项目同步开始：%s', res.appid);
          this.readProject(res.appid, res, this.getFilter())
            .then(_.bind(function (files) {
              this.send({
                command: 3,
                list: files,
                timestamp: Math.floor(new Date().getTime() / 1000)
              });
              utils.log('项目同步成功：%s, 文件数：%d', res.appid, files.length);
            }, this))
            .catch(function (err) {
              utils.error('项目同步失败：%s, 原因：%s', res.appid, err.message);
            });
          break;
        case 4:
          socket.send(JSON.stringify({
            command: 4
          }));
          break;
        case 5:
          utils.log(res);
          break;
        case 8:
          this.log(res);
          break;
      }
    }, this));
    socket.on('close', _.bind(function() {
      if (this && this.__ws && this.__ws.clients && socket){
        utils.log('当前连接设备数:%d, 连结的Id：%d, 当前状态: %d', this.__ws.clients.size, id, socket.readyState);
      }
    }, this));
  }, this));
};
Server.prototype.addProjects = function(projects) {
  if (typeof projects == 'string' || arguments.length > 1) {
    projects =  _.toArray(arguments)
  }
  if (!_.isArray(projects) || !projects.length) {
    throw new Error('不合理的参数。');
  }
  var projects = _.map(projects, _.bind(function (project) {
    return utils.getAppInfo(project);
  }, this));
  return Promise.all(projects).then(_.bind(function (res) {
    res = _.flatten(res);
    _.forEach(res, _.bind(function (project) {
      utils.log('project add:', project.join('----'));
      this.__express.use('/' + project[0], Express.static(project[1]));
      this.__projects[project[0]] = project[1];
    }, this));
    return res;
  }, this));
};
Server.prototype.send = function(msg) {
  this.__ws.clients.forEach(function (socket) {
    utils.log('向客户端：%d发送指令：%d', socket._ultron.id, msg.command);
    socket.send(JSON.stringify(msg));
  });
};
Server.prototype.payload = function (opts, socket) {
  switch (opts.method) {
    case 'wifiSync':
      return this.sync(opts.params);
    case 'wifiStop':
      this.close();
      break;
    case 'wifiInfo':
      this.info(socket);
      break;
    case 'wifiLog':
      return this.bindLog(socket);
  }
  console.log(opts);
};
Server.prototype.sync = function(opts) {
  return this.addProjects(opts.project)
    .then(function (res) {
      if (res.length) {
        res = res[0];
        utils.log('文件同步， AppId：%s， 项目路径：%s', res[0], res[1]);
        return {
          command: 1,
          appid: res[0],
          updateAll: opts.updateAll
        };
      }
      throw new Error('这可能不是个APIcloud项目');
    }).then(_.bind(function (msg) {
      if (msg.updateAll) {
        this.getFilter().reset(msg.appid);
      }
      this.send(msg);
    }, this));
};
Server.prototype.close = function () {
  utils.log('关闭服务');
  this.__ws.close();
  this.__server.close();
};
Server.prototype.info = function(socket) {
  var info = {
    ip: utils.getIps(),
    port: this.params.port || 8686
  };
  if (this.__ws && socket) {
    info.clientsCount = this.__ws.clients.size;
    socket.send(JSON.stringify({
      command:CLI_COMMAND,
      payload:info
    }));
  }
  return info;
};
Server.prototype.bindLog = function(socket) {
  socket.log = function(res) {
    socket.send(JSON.stringify({
      command: CLI_COMMAND,
      payload: res
    }));
  };
  return new Promise(_.bind(function(resolve) {
  }, this));
};
Server.prototype.log = function (res) {
  delete res.command;
  this.__ws.clients.forEach(function (socket) {
    socket.log && socket.log(res);
  });
};
Server.prototype.onLog = function (func) {
  this.__ws.on('connection', function(socket) {
    socket.on('message', function(msg) {
      msg = JSON.parse(msg);
      if (msg.command === 8) {
        func(msg);
      }
    });
  });
};
Server.prototype.ignore = function (appid, ignores) {
  if (this.__ignores[appid]) {
    this.__ignores[appid] = this.__ignores[appid].concat(ignores);
  } else {
    this.__ignores[appid] = [].concat(ignores);
  }
};
Server.prototype.readProject = function (appId, cmd, filter) {
  var project = this.__projects[appId];
  if (!project) {
    utils.warn('未添加的项目不能同步');
    return Promise.reject(new Error('未添加的项目不能同步'));
  }
  filter.add(appId, cmd);
  return utils.getProjectFiles(project, this.__ignores[appId])
    .then(_.bind(function (files) {
      return filter.exec(files, appId, project);
    }, this));
};

module.exports = Server;
