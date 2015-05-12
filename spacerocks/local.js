// Local, client-side of the game. This is just responsible for rendering
// entities, and sending client keypresses up to the server.

/* jshint node: true */
'use strict';

var entities = require('./entities');
var game = require('./game');
var network = require('./network');
var text = require('./text');

var Entity = entities.Entity;

var titleCharWidth = 32;
var titleCharSpacing = 48;
var titleCharHeight = 64;
var titleTimer = 5;

exports.canvas = undefined;           // HTML5 canvas element.
exports.canvasWidth = 0;              // Current width of the canvas element.
exports.canvasHeight = 0;             // Current height of the canvas element.
exports.canvasScaleX = 1;             // Scale to transform x coordinates from game space to canvas space.
exports.canvasScaleY = 1;             // Scale to transform y coordinates from game space to canvas space.
exports.context = undefined;          // 2D context for the canvas element.
exports.keysMap = {                  // Map of key codes to buttons.
  '32': game.BUTTON_FIRE,    // Space.
  '37': game.BUTTON_LEFT,    // Left arrow.
  '38': game.BUTTON_THRUST,  // Up arrow.
  '39': game.BUTTON_RIGHT,   // Right arrow.
  '90': game.BUTTON_FIRE,    // Z.
  '88': game.BUTTON_THRUST   // X.
};
exports.loopback = false;             // If true, play locally without a server.
exports.socket = undefined;           // Socket.IO connection to the server.

exports.attach = null;
exports.connect = null;
exports.init = null;
exports.drawTitle = null;
exports.update = null;
exports.onKeyDown = null;
exports.onKeyUp = null;
exports.onMessage = null;
exports.onResize = null;

var player;

// Attach event listeners and setup the local module. The element
// parameter should be the window object.
exports.attach = function(element) {
  var _this = this;
  element.addEventListener('load', function() {
    element.addEventListener('keydown', function(event) {
      if (_this.onKeyDown(event.keyCode) === false) {
        event.preventDefault();
      }
    }, false);

    element.addEventListener('keyup', function(event) {
      if (_this.onKeyUp(event.keyCode) === false) {
        event.preventDefault();
      }
    }, false);

    element.addEventListener('resize', function(event) {
      _this.onResize(element.innerWidth, element.innerHeight);
    }, false);

    _this.connect(window.location.origin.replace(/^http/, 'ws'), element);
  }, false);
};

exports.connect = function(host, element) {
  var _this = this;
  if (host && host.match(/^ws:/)) {
    _this.socket = new WebSocket(host);
    _this.socket.onopen = function() {
      _this.socket.connected = true;
      _this.init(element.innerWidth, element.innerHeight);
    };
    _this.socket.onclose = function() {
      _this.socket.connected = false;
      _this.connect(host, element);
    };
    _this.socket.onmessage = function(message) {
      _this.onMessage(message.data);
    };
  } else {
    this.loopback = true;
    this.broadcast = function() {};
    this.init(element.innerWidth, element.innerHeight);
  }
};

// Initialize the local renderer. This is called automatically when
// the window has loaded.
exports.init = function(windowWidth, windowHeight) {
  game.init(this.loopback ? this : undefined);
  player = game.createPlayer(1);
  this.canvas = document.getElementsByTagName('canvas')[0];
  this.onResize(windowWidth, windowHeight);
  var _this = this;
  (function loop() {
    if (_this.loopback || _this.socket.connected) {
      _this.update();
    }
    setTimeout(loop, 1000 / 30);
  })();
};

exports.drawTitle = function() {
  if (titleTimer > 0) {
    titleTimer = Math.max(0, titleTimer - game.dt);
    this.context.beginPath();
    text.drawCenteredString('spacerocks', titleCharWidth, titleCharSpacing,
                            titleCharHeight, 0, 0);
    this.context.stroke();
    this.context.closePath();
  }
};

exports.update = function() {
  game.update();
  this.context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
  this.context.save();
  this.context.scale(this.canvasScaleX, this.canvasScaleY);
  this.drawTitle();
  var i = entities.all.length;
  while (i--) {
    entities.all[i].draw(this);
  }
  this.context.restore();
};

// The user has pressed a key.
exports.onKeyDown = function(keyCode) {
  var button = this.keysMap[keyCode];
  if (button !== undefined) {
    if (button === game.BUTTON_THRUST) {
      if (this.player && this.player.ship) {
        this.player.ship.thrusting = true;
      }
    }
    if (this.loopback) {
      player.onData({
        packet: {name: 'buttonDown'},
        button: button
      });
    } else {
      this.socket.send(network.packMessage('buttonDown', [button]));
    }
    return true;
  } else {
    return false;
  }
};

// The user has released a key.
exports.onKeyUp = function(keyCode) {
  var button = this.keysMap[keyCode];
  if (button !== undefined) {
    if (button === game.BUTTON_THRUST) {
      if (this.player && this.player.ship) {
        this.player.ship.thrusting = false;
      }
    }
    if (this.loopback) {
      player.onData({
        packet: {name: 'buttonUp'},
        button: button
      });
    } else {
      this.socket.send(network.packMessage('buttonUp', [button]));
    }
    return true;
  } else {
    return false;
  }
};

// We've received a new packet from the server.
// FIXME: It might make more sense for this to be in the game code.
exports.onMessage = function(message) {
  var entity;
  var data = network.unpackMessage(message);
  if (data && data.packet) {
    switch (data.packet.name) {
      case 'ack':
        if (game.version < data.version) {
          window.location.reload();
        }
        this.player = game.createPlayer(data.playerId);
        break;

      case 'ackShip':
        this.player.ship = entities.forId[data.entityId];
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
};

// The browser window has been resized.
exports.onResize = function(windowWidth, windowHeight) {
  // Fit to the width, but don't exceed our desired size
  this.canvasWidth = windowWidth - 32;
  if (this.canvasWidth >= game.width) {
    this.canvasWidth = game.width;
    this.canvasHeight = game.height;
  } else {
    this.canvasHeight = this.canvasWidth * (game.height / game.width);
  }
  this.canvasWidth = 2 * Math.floor(this.canvasWidth / 2);
  this.canvasHeight = 2 * Math.floor(this.canvasHeight / 2);
  this.canvasScaleX = this.canvasWidth / game.width;
  this.canvasScaleY = this.canvasHeight / game.height;

  // Update the canvas element
  this.canvas.width = this.canvasWidth;
  this.canvas.height = this.canvasHeight;
  this.canvas.style.left = ((windowWidth - this.canvas.width) / 2) + 'px';
  this.canvas.style.top = ((windowHeight - this.canvas.height) / 2) + 'px';

  // Recreate the context, because modifying the canvas destroys it
  this.context = this.canvas.getContext('2d');
  this.context.fillStyle = '#000';
  this.context.strokeStyle = '#fff';

  // Offset by one to trick the canvas into
  // drawing strokes with a hairline width
  this.context.translate(0.5, 0.5);
};
