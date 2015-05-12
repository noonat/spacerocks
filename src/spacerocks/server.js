// The server-side of the game. It expects server.attach() to be called and
// passed a socket.io server object.

'use strict';

import * as entities from './entities';
import * as game from './game';
import * as network from './network';

export var nextPlayerId = 0;
export var serverSocket = null;

export function attach(newServerSocket) {
  nextPlayerId = 0;
  serverSocket = newServerSocket;
  serverSocket.on('connection', (socket) => {
    socket.sessionId = nextPlayerId++;
    let player = game.createPlayer(socket.sessionId);
    console.log('Player', player.id, 'connected (client',
      socket.sessionId, ')');
    player.socket = socket;
    player.sendData('ack', [player.id, game.version]);
    broadcast('connected', [player.id], player);
    let entity;
    let all = entities.all;
    for (let i = 0, il = all.length; i < il; i++) {
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
    socket.on('close', () => {
      console.log('Player', player.id, 'disconnected');
      game.deletePlayer(player.id);
      broadcast('disconnected', [player.id], player);
    });
    socket.on('message', (message) => {
      player.onData(network.unpackMessage(message));
    });
  });
  game.init(exports);
  (function loop() {
    // FIXME: using nextTick here did bad things, server just hung
    update();
    setTimeout(loop, 1000 / 30);
  })();
}

// Send a network packet to everyone on the server.
export function broadcast(name, values, exceptPlayers) {
  let message = network.packMessage(name, values);
  if (exceptPlayers && exceptPlayers instanceof game.Player) {
    exceptPlayers = [exceptPlayers];
  }
  for (let id in game.players) {
    if (!game.players.hasOwnProperty(id)) {
      continue;
    }
    let player = game.players[id];
    if (exceptPlayers && exceptPlayers.indexOf(player) !== -1) {
      continue;
    }
    try {
      player.socket.send(message);
    } catch (err) {
      // Ignore any errors here.
    }
  }
}

export function update() {
  game.update();
}
