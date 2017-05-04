# apicloud-server
使用express和websocket实现apicloud协议。

# 实例
~~~javascript
var Server = require('apicloud-server');
var server = new Server({ // 或者Server({
    projects: [
        '/path/to/project',
        '/path/to/workspace/*'
    ],                                    //用于设计项目的目录并取得appId绑定 /appId/**/*
    port: 8090,                   //文件服务和socket服务端口
    level: [
        'log', 'warn', 'error'
    ],                                    //log显示的等级。使用debug模块
    filter: 'timestamp'         //过滤器过滤重复的代码可选为String（sha1 和 timestamp）或者 Function构造函数继承于apicloud-server／lib/utils.Filter 或者 Object 将会使用utils.makeFilterClass构造并实例化
});
//log
server.onLog(function(message) {
    console.log(JSON.stringify(message));
});
//sync
setTimeout(function() {
    server.sync({
        project: '/path/to/project',
        updateAll: false
    });
}, 3000);
~~~

# API
## Server(options)
构造函数生成过滤缓存，文件服务和长链接服务。
### options.projects [String||Array<String>] (格式参考[globby](https://github.com/sindresorhus/globby))
项目路径将会自动寻找匹配的文件夹下面的config.xml文件并添加文件服务。
### options.port 监听的文件端口
文件服务和socket服务端口
### options.level
日志显示等级。由[debug](https://github.com/visionmedia/debug)库实现。存在log,warn,error三个等级，此处参数为enable参数。
### options.filter [String（timestamp||sha1）|| Object || Function(utils.Filter)]
String类型有暂时只有两个可选 (timestamp, sha1)
Object类型
    init (Function)用于实现初始化Filter
    reset(appId) (Function)用于重置Filter内AppId对应的缓存
    add(appId, cmd) (Function)用于添加AppId对应的缓存，cmd为自定义或者app传入
    exec(files, appId, project) (Function)用于处理文件并返回最终目录，同步或者异步执行可返回Promise。
Function类型
    构造函数，需要继承自utils.Filter实现以上Object类型对应的方法
## server.setFilter
用于设置过滤器，参数为见options.filter说明。每次使用都会实例化新的过滤器对象。
## server.addProjects(projects)
添加项目参数见options.projects说明。
## server.info
获取系统信息。会返回ipv4地址和端口以及socket连接数
## server.sync(options)
同步项目<br>
##### options.project   必填<br>
##### options.updateAll 默认false
## server.ignore(appid, files)
忽略同步文件
## server.onLog(func)
处理log内容
## server.close()
关闭socket和http服务。
## server.__ws
对应的websocket服务实例
## server.__express
对应的export服务实例.

