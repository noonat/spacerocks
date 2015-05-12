/* jshint node: true */

'use strict';

var browserify = require('browserify-middleware');
var express = require('express');
var http = require('http');
var spacerocks = require('./spacerocks');
var ws = require('ws');

var app = express();
app.get('/client.js', browserify('./client.js'));
app.get('/spacerocks.js', browserify('./spacerocks/index.js'));
app.use(express.static(__dirname + '/'));

var httpServer = http.createServer(app);
httpServer.listen(process.env.PORT || 8080);

var socketServer = new ws.Server({server: httpServer});
spacerocks.server.attach(socketServer);
