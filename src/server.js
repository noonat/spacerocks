'use strict';

import babelify from 'babelify';
import browserify from 'browserify-middleware';
import express from 'express';
import path from 'path';
import ws from 'ws';
import {createServer} from 'http';

import * as spacerocks from './spacerocks';

process.chdir(__dirname);

var app = express();
app.get('/client.js', browserify('./client.js', {
  transform: [babelify]
}));
app.get('/spacerocks.js', browserify('./spacerocks/index.js'));
app.use(express.static(path.resolve(__dirname, '../public')));

var httpPort = process.env.PORT || 8080;
var httpServer = createServer(app);
httpServer.listen(httpPort);

var socketServer = new ws.Server({server: httpServer});
spacerocks.server.attach(socketServer);

console.log('Listening on port %d', httpPort);
