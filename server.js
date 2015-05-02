/* jshint node: true */

'use strict';

var express = require('express');
var http = require('http');
var spacerocks = require('./spacerocks');
var ws = require('ws');

var app = express();
app.use(express.static(__dirname + '/'));

var httpServer = http.createServer(app);
httpServer.listen(process.env.port || 8080);

var socketServer = new ws.Server({server: httpServer});
spacerocks.server.attach(socketServer);
