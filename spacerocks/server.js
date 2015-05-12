// The server-side of the game. It expects server.attach() to be called and
// passed a socket.io server object.

/* jshint node: true */
'use strict';

var entities = require('./entities');
var game = require('./game');
var network = require('./network');

exports.attach = function(serverSocket) {
  var _this = this;
  this.nextPlayerId = 0;
  this.serverSocket = serverSocket;
  this.serverSocket.on('connection', function(socket) {
    socket.sessionId = _this.nextPlayerId++;
    var player = game.createPlayer(socket.sessionId);
    console.log('Player', player.id, 'connected (client',
      socket.sessionId, ')');
    player.socket = socket;
    player.sendData('ack', [player.id, game.version]);
    _this.broadcast('connected', [player.id], player);
    var entity;
    var all = entities.all;
    for (var i = 0, il = all.length; i < il; ++i) {
      entity = all[i];
      if (entity && !entity.dead) {
        player.sendData('entitySpawned', [
          entity.constructor.type,
          entity.id,
          entity.x, entity.y,
          entity.vx, entity.vy,
          entity.angle,
          entity.scale,
          entity.points.length
        ].concat(entity.points));
      }
    }
    socket.on('close', function() {
      console.log('Player', player.id, 'disconnected');
      game.deletePlayer(player.id);
      _this.broadcast('disconnected', [player.id], player);
    });
    socket.on('message', function(message) {
      player.onData(network.unpackMessage(message));
    });
  });
  game.init(this);
  (function loop() {
    // FIXME: using nextTick here did bad things, server just hung
    _this.update();
    setTimeout(loop, 1000 / 30);
  })();
};

// Send a network packet to everyone on the server.
exports.broadcast = function(name, values, exceptPlayers) {
  var message = network.packMessage(name, values);
  if (exceptPlayers && exceptPlayers instanceof game.Player) {
    exceptPlayers = [exceptPlayers];
  }
  for (var id in game.players) {
    if (!game.players.hasOwnProperty(id)) {
      continue;
    }
    var player = game.players[id];
    if (exceptPlayers && exceptPlayers.indexOf(player) !== -1) {
      continue;
    }
    try {
      player.socket.send(message);
    } catch (err) {
      // Ignore any errors here.
    }
  }
};

exports.update = function() {
  game.update();
};
