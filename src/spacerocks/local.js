// Local, client-side of the game. This is just responsible for rendering
// entities, and sending client keypresses up to the server.

'use strict';

import * as entities from './entities';
import {Entity} from './entities';
import * as game from './game';
import * as network from './network';
import * as text from './text';

const titleCharWidth = 32;
const titleCharSpacing = 48;
const titleCharHeight = 64;
var titleTimer = 5;

export var canvas;            // HTML5 canvas element.
export var canvasWidth = 0;   // Current width of the canvas element.
export var canvasHeight = 0;  // Current height of the canvas element.
export var canvasScaleX = 1;  // Scale to transform x coordinates from game space to canvas space.
export var canvasScaleY = 1;  // Scale to transform y coordinates from game space to canvas space.
export var context;           // 2D context for the canvas element.
export var keysMap = {        // Map of key codes to buttons.
  '32': game.BUTTON_FIRE,     // Space.
  '37': game.BUTTON_LEFT,     // Left arrow.
  '38': game.BUTTON_THRUST,   // Up arrow.
  '39': game.BUTTON_RIGHT,    // Right arrow.
  '90': game.BUTTON_FIRE,     // Z.
  '88': game.BUTTON_THRUST    // X.
};
export var loopback = false;  // If true, play locally without a server.
export var socket;            // Socket.IO connection to the server.

// exports.attach = null;
// exports.connect = null;
// exports.init = null;
// exports.drawTitle = null;
// exports.update = null;
// exports.onKeyDown = null;
// exports.onKeyUp = null;
// exports.onMessage = null;
// exports.onResize = null;

var player;

// Attach event listeners and setup the local module. The element
// parameter should be the window object.
export function attach(element) {
  element.addEventListener('load', () => {
    element.addEventListener('keydown', (event) => {
      if (onKeyDown(event.keyCode) === false) {
        event.preventDefault();
      }
    }, false);

    element.addEventListener('keyup', (event) => {
      if (onKeyUp(event.keyCode) === false) {
        event.preventDefault();
      }
    }, false);

    element.addEventListener('resize', (event) => {
      onResize(element.innerWidth, element.innerHeight);
    }, false);

    connect(window.location.origin.replace(/^http/, 'ws'), element);
  }, false);
}

export function connect(host, element) {
  if (host && host.match(/^ws:/)) {
    socket = new WebSocket(host);
    socket.onopen = () => {
      socket.connected = true;
      init(element.innerWidth, element.innerHeight);
    };
    socket.onclose = () => {
      socket.connected = false;
      connect(host, element);
    };
    socket.onmessage = (message) => {
      onMessage(message.data);
    };
  } else {
    loopback = true;
    // broadcast = function() {};
    init(element.innerWidth, element.innerHeight);
  }
}

// Initialize the local renderer. This is called automatically when
// the window has loaded.
export function init(windowWidth, windowHeight) {
  game.init(loopback ? exports : undefined);
  player = game.createPlayer(1);
  canvas = document.getElementsByTagName('canvas')[0];
  onResize(windowWidth, windowHeight);
  (function loop() {
    if (loopback || socket.connected) {
      update();
    }
    setTimeout(loop, 1000 / 30);
  })();
}

export function drawTitle() {
  if (titleTimer > 0) {
    titleTimer = Math.max(0, titleTimer - game.dt);
    context.beginPath();
    text.drawCenteredString('spacerocks', titleCharWidth, titleCharSpacing,
                            titleCharHeight, 0, 0);
    context.stroke();
    context.closePath();
  }
}

export function update() {
  game.update();
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.save();
  context.scale(canvasScaleX, canvasScaleY);
  drawTitle();
  let i = entities.all.length;
  while (i--) {
    entities.all[i].draw(exports);
  }
  context.restore();
}

// The user has pressed a key.
export function onKeyDown(keyCode) {
  let button = keysMap[keyCode];
  if (button !== undefined) {
    if (button === game.BUTTON_THRUST) {
      if (player && player.ship) {
        player.ship.thrusting = true;
      }
    }
    if (loopback) {
      player.onData({
        packet: {name: 'buttonDown'},
        button: button
      });
    } else {
      socket.send(network.packMessage('buttonDown', [button]));
    }
    return true;
  } else {
    return false;
  }
}

// The user has released a key.
export function onKeyUp(keyCode) {
  let button = keysMap[keyCode];
  if (button !== undefined) {
    if (button === game.BUTTON_THRUST) {
      if (player && player.ship) {
        player.ship.thrusting = false;
      }
    }
    if (loopback) {
      player.onData({
        packet: {name: 'buttonUp'},
        button: button
      });
    } else {
      socket.send(network.packMessage('buttonUp', [button]));
    }
    return true;
  } else {
    return false;
  }
}

// We've received a new packet from the server.
// FIXME: It might make more sense for this to be in the game code.
export function onMessage(message) {
  let entity;
  let data = network.unpackMessage(message);
  if (data && data.packet) {
    switch (data.packet.name) {
      case 'ack':
        if (game.version < data.version) {
          window.location.reload();
        }
        player = game.createPlayer(data.playerId);
        break;

      case 'ackShip':
        player.ship = entities.forId[data.entityId];
        break;

      case 'connect':
        game.createPlayer(data.playerId);
        break;

      case 'disconnect':
        game.deletePlayer(data.playerId);
        break;

      case 'entity':
        entity = entities.forId[data.entityId];
        if (entity) {
          entity.x = data.x;
          entity.y = data.y;
          entity.vx = data.vx;
          entity.vy = data.vy;
          entity.angle = data.angle;
          if (entity.scale !== data.scale) {
            entity.setScale(data.scale);
          }
        }
        break;

      case 'entityDied':
        entity = entities.forId[data.entityId];
        if (entity) {
          entity.dead = true;
        }
        break;

      case 'entityPoints':
        entity = entities.forId[data.entityId];
        if (entity) {
          entity.setPoints(data.points);
        }
        break;

      case 'entitySpawned':
        entity = entities.createByType(data.entityType, data.entityId);
        if (entity) {
          entity.spawn(
            data.x, data.y, data.vx, data.vy, data.angle, data.scale,
            data.points);
        }
        break;
    }
  }
}

// The browser window has been resized.
export function onResize(windowWidth, windowHeight) {
  // Fit to the width, but don't exceed our desired size
  canvasWidth = windowWidth - 32;
  if (canvasWidth >= game.width) {
    canvasWidth = game.width;
    canvasHeight = game.height;
  } else {
    canvasHeight = canvasWidth * (game.height / game.width);
  }
  canvasWidth = 2 * Math.floor(canvasWidth / 2);
  canvasHeight = 2 * Math.floor(canvasHeight / 2);
  canvasScaleX = canvasWidth / game.width;
  canvasScaleY = canvasHeight / game.height;

  // Update the canvas element
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.left = ((windowWidth - canvas.width) / 2) + 'px';
  canvas.style.top = ((windowHeight - canvas.height) / 2) + 'px';

  // Recreate the context, because modifying the canvas destroys it
  context = canvas.getContext('2d');
  context.fillStyle = '#000';
  context.strokeStyle = '#fff';

  // Offset by one to trick the canvas into
  // drawing strokes with a hairline width
  context.translate(0.5, 0.5);
}
