// This is the main logic for the game. It defines our game types (asteroids,
// ships, etc.), and the physics and gameplay for them. This is run by both
// the server and the client, but the server is authoritative.

/* jshint node: true */
'use strict';

var entities = require('./entities');
var network = require('./network');
var util = require('./util');

var Entity = entities.Entity;
var angleToRadians = util.angleToRadians;
var inherits = util.inherits;

var game = exports;

var asteroidSmallScale = 12;      // Small asteroid size.
var asteroidMediumScale = 32;     // Medium asteroid size.
var asteroidLargeScale = 64;      // Large asteroid size.
var asteroidVelocity = 48;        // Large asteroids should move this fast.
var bulletPoints = [              // Points for the bullet entities.
  0.0, 0.0,
  1.0, 1.0
];
var bulletTime = 1.5;             // Bullets automatically disappear after this many seconds.
var bulletVelocity = 320;         // Bullets move this many units per second.
var explosionParticles = 8;       // Explosions will have this many particles.
var explosionTime = 1;            // Explosions will last this many seconds.
var shipBulletTimer = 0.2;        // Don't allow a ship to fire again for this many seconds.
var shipPoints = [                // Points for the ship object.
   0.0, -10.0,
  -7.5,  10.0,
  -4.0,   7.0,
   4.0,   7.0,
   7.5,  10.0
];
var shipThrustPoints = [          // Points for the ship, while thrusting.
   0.0, -10.0,
  -7.5,  10.0,
  -4.0,   7.0,
   4.0,   7.0,
   0.0,  14.0,
  -4.0,   7.0,
   4.0,   7.0,
   7.5,  10.0
];
var shipTurnVelocity = 256;       // Turn this many degrees per second.
var shipThrustVelocity = 128;     // Accelerate this many units per second.
var shipMaxThrustVelocity = 192;  // Move up to this many units per second.
var version = 1;

exports.BUTTON_LEFT = 0;
exports.BUTTON_RIGHT = 1;
exports.BUTTON_THRUST = 2;
exports.BUTTON_FIRE = 3;
exports.dt = 0;                          // Seconds elapsed since the last frame.
exports.time = 0;                        // Current time (absolute), in seconds.
exports.lastTime = 0;                    // Time of the last frame.
exports.width = 1280;                    // Width of the game world.
exports.height = 720;                    // Height of the game world.

exports.players = null;
exports.createPlayer = null;
exports.deletePlayer = null;

exports.init = null;
exports.update = null;
exports.collide = null;

exports.Asteroid = null;
exports.Bullet = null;
exports.Debris = null;
exports.Explosion = null;
exports.Player = null;
exports.Ship = null;

//
//      .   .
//    .       .
//  .           .
//  .           .
//    .       .
//      .   .
//

function Asteroid(id) {
  Entity.call(this, id);
}
inherits(Asteroid, Entity);
exports.Asteroid = Asteroid;
entities.defineType(Asteroid);

Asteroid.prototype.die = function() {
  entities.create(Explosion).spawn(this.x, this.y, 0, 0, 0, this.scale);
  Entity.prototype.die.call(this);
  var scale = this.scale - 1;
  if (scale < asteroidSmallScale) {
    return;
  } else if (scale < asteroidMediumScale) {
    scale = asteroidSmallScale;
  } else {
    scale = asteroidMediumScale;
  }
  // Backup the old values, since our entity may get reused
  var vlen = Math.sqrt(this.vx * this.vx + this.vy * this.vy) * 3;
  var vrad = Math.atan2(-this.vy, this.vx);
  var x = this.x;
  var y = this.y;
  var f = 0.4; //(0.3 + 0.7 * Math.random())
  var i = 2;
  while (i--) {
    vrad += Math.random() - 0.5;
    var nx =  Math.cos(vrad);
    var ny = -Math.sin(vrad);
    entities.create(Asteroid).spawn(
      x, y, nx * vlen * f, ny * vlen * f, 0, scale);
    f = 1.0 - f;
  }
};

Asteroid.prototype.spawn = function(x, y, vx, vy, angle, scale, points) {
  if (scale === undefined) {
    scale = asteroidLargeScale;
  }

  var a, b, c, d, i, il, indexes, radians, radius;

  if (points === undefined) {
    // Start with an octagon
    a = 1 / 6;
    b = 2 / 6;
    c = 3 / 6;
    d = 4 / 6;
    points = [
       c, -a,  b, -b,  a, -c,
      -a, -c, -b, -b, -c, -a,
      -c,  a, -b,  b, -a,  c,
       a,  c,  b,  b,  c,  a
    ];
    // Now randomly distort some of the points
    indexes = [];
    il = points.length / 2;
    while (il--) {
      indexes[il] = il;
    }
    il = 4;
    while (il--) {
      var randomIndex = Math.floor(Math.random() * indexes.length);
      i = indexes.splice(randomIndex, 1)[0] * 2;
      radians = 2 * Math.PI / points.length * i;
      radius = b + Math.random() * (d - b);
      points[i + 0] = radius *  Math.cos(radians);
      points[i + 1] = radius * -Math.sin(radians);
    }
  }

  if (x === undefined || y === undefined) {
    // Randomize the position somewhere just off the edge of the world
    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? -scale : game.width + scale;
      y = Math.random() * game.height;
    } else {
      x = Math.random() * game.width;
      y = Math.random() < 0.5 ? -scale : game.height + scale;
    }
  }

  if (vx === undefined || vy === undefined) {
    var theta = 2 * Math.PI * Math.random();
    vx = asteroidVelocity *  Math.cos(theta);
    vy = asteroidVelocity * -Math.sin(theta);
  }

  Entity.prototype.spawn.call(this, x, y, vx, vy, angle, scale, points);
};

Asteroid.createRandom = function(count) {
  while (count--) {
    entities.create(Asteroid).spawn();
  }
};

//
// == PEW PEW ==
//

function Bullet(id) {
  Entity.call(this, id);
  this.timeLeft = 0;
}
inherits(Bullet, Entity);
exports.Bullet = Bullet;
entities.defineType(Bullet);

Bullet.prototype.die = function() {
  this.timeLeft = 0;
  Entity.prototype.die.call(this);
};

Bullet.prototype.draw = function(local, points) {
  Entity.prototype.draw.call(this, local, points || bulletPoints);
};

Bullet.prototype.spawn = function(x, y, vx, vy, angle, scale, points) {
  if (points === undefined) {
    points = [0, 0, 1, 1];
  }
  this.timeLeft = bulletTime;
  Entity.prototype.spawn.call(this, x, y, vx, vy, angle, scale, points);
};

Bullet.prototype.update = function() {
  if (this.dead) {
    return;
  }
  // Bullets should disappear when they run out of time.
  this.timeLeft -= exports.dt;
  if (this.timeLeft < 0) {
    this.die();
    return;
  }
  var ox = this.x;
  var oy = this.y;
  Entity.prototype.update.call(this);
  if (game.server) {
    this.setPoints([0, 0, this.x - ox, this.y - oy], undefined, false);
  }
};

//
// halp... i'm dead
//

// FIXME: Debris could really be entirely client-side.
function Debris(id) {
  Entity.call(this, id);
}
inherits(Debris, Entity);
exports.Debris = Debris;
entities.defineType(Debris);

Debris.prototype.spawn = function() {
  Entity.prototype.spawn.apply(this, arguments);
  this.timeLeft = 1 + Math.random() * 4;
};

Debris.prototype.update = function() {
  if (this.dead) {
    return;
  }
  this.timeLeft -= game.dt;
  if (this.timeLeft < 0) {
    this.die();
    return;
  }
  Entity.prototype.update.call(this);
};

//
// .     .  .     .
//    .        .
//       .  .
//    .  .  .  kaboom
//       .     .
//

function Explosion(id) {
  Entity.call(this, id);
  this.particles = [];
  for (var i = 0; i < explosionParticles; ++i) {
    this.particles[i] = {x: 0, y: 0, vx: 0, vy: 0};
  }
}
inherits(Explosion, Entity);
exports.Explosion = Explosion;
entities.defineType(Explosion);

Explosion.prototype.draw = function(local, points) {
  if (this.dead) {
    return;
  }

  // Override draw completely. We don't actually care about the transmitted
  // points, since explosions don't have to match on different clients. We
  // just generate and draw a random explosion on each client.

  var i = this.particles.length;
  var context = local.context;
  var _x = this.x;
  var _y = this.y;
  var _s = this.scale;
  context.beginPath();
  while (i--) {
    var p = this.particles[i];
    var px = _x + _s * p.x;
    var py = _y + _s * p.y;
    context.moveTo(px, py);
    context.lineTo(px + 1, py + 1);
  }

  // Decreases the brightness of the explosion over its lifetime.
  var f = this.timeLeft / explosionTime;
  var b = Math.round(15 * f * f).toString(16);
  context.strokeStyle = '#' + b + b + b;
  context.stroke();
  context.strokeStyle = '#fff';

  context.closePath();
};

Explosion.prototype.spawn = function(x, y, vx, vy, angle, scale, points) {
  Entity.prototype.spawn.call(this, x, y, 0, 0, 0, scale, [x, y]);
  this.timeLeft = explosionTime;
  // Generate a bunch of particles and assign them random velocities.
  var i = this.particles.length;
  while (i--) {
    var p = this.particles[i];
    var r = Math.random() * 2 * Math.PI;
    var v = 2 + Math.random() * 2;
    p.x = p.y = 0;
    p.vx =  Math.cos(r) * v;
    p.vy = -Math.sin(r) * v;
  }
};

Explosion.prototype.update = function() {
  if (this.dead) {
    return;
  }
  // Explosions should disappear when they run out of time.
  this.timeLeft -= exports.dt;
  if (this.timeLeft < 0) {
    this.die();
    return;
  }
  var i = this.particles.length;
  while (i--) {
    var p = this.particles[i];
    p.x += p.vx * game.dt;
    p.y += p.vy * game.dt;
  }
};

//
//     .
//    . .
//   .   .    VROOM (ssh, i'm in space)
//  .......
// .       .
//

function Ship(id) {
  Entity.call(this, id);
}
inherits(Ship, Entity);
exports.Ship = Ship;
entities.defineType(Ship);

Ship.prototype.draw = function(local, points) {
  if (this.dead) {
    return;
  }
  var thrusting = this.thrusting && (game.time % 0.15) >= 0.07;
  points = points || (thrusting ? shipThrustPoints : shipPoints);
  Entity.prototype.draw.call(this, local, points);
};

Ship.prototype.die = function() {
  this.spawnDebris();
  // If this ship belongs to a player, notify the player that the ship died.
  if (this.player && this.player.ship === this) {
    this.player.onShipDied();
  }
  this.player = undefined;
  Entity.prototype.die.call(this);
};

// Fire a bullet, if enough time has passed since firing the last one.
Ship.prototype.fire = function() {
  if (this.dead) {
    return;
  }
  if (exports.time < this.bulletTimer) {
    return;
  }
  this.bulletTimer = exports.time + shipBulletTimer;

  // nx and ny here are the normal vector for our current angle. The normal
  // is used both to figure out the "muzzle" point for the ship, and to
  // calculate the velocity x and y.
  var nx =  Math.sin(this.angle * angleToRadians);
  var ny = -Math.cos(this.angle * angleToRadians);
  var bullet = entities.create(Bullet);
  bullet.spawn(
    this.x + nx * 10, this.y + ny * 10,
    nx * bulletVelocity, ny * bulletVelocity);
  bullet.ship = this;
};

Ship.prototype.spawn = function(x, y, vx, vy, angle, scale, points) {
  if (x === undefined) {
    x = game.width / 2;
  }
  if (y === undefined) {
    y = game.height / 4;
  }
  if (points === undefined) {
    points = shipPoints;
  }
  Entity.prototype.spawn.call(this, x, y, vx, vy, angle, scale, points);
  this.bulletTimer = 0;
  this.thrusting = false;
};

Ship.prototype.spawnDebris = function() {
  entities.create(Explosion).spawn(this.x, this.y, 0, 0, 0, 32);
  // This generates a bunch of debris entities based on the ship's current
  // (rotated) points, giving the appearance of the ship falling apart
  // when it dies.
  var _p = this.points;
  var _pl = this.points.length;
  var cos = Math.cos(this.angle * angleToRadians);
  var sin = Math.sin(this.angle * angleToRadians);
  for (var i = 0; i < _pl; i += 2) {
    var ii = (i + 2) % _pl;
    var x1 = _p[i];
    var y1 = _p[i + 1];
    var x2 = _p[ii];
    var y2 = _p[ii + 1];
    var points = [
      cos * x1 - sin * y1,
      sin * x1 + cos * y1,
      cos * x2 - sin * y2,
      sin * x2 + cos * y2
    ];
    entities.create(Debris).spawn(
      this.x, this.y,
      (this.vx * 0.2) + Math.random() * 8,
      (this.vy * 0.2) + Math.random() * 8,
      0, 1, points);
  }
};

Ship.prototype.stopThrust = function() {
  this.thrusting = false;
};

// Accelerate the ship forward a bit.
Ship.prototype.thrust = function() {
  if (this.dead) {
    return;
  }
  var vx = this.vx;
  var vy = this.vy;
  var vlen;
  // Add velocity along the vector for our forward vector.
  vx += (Math.sin(this.angle * angleToRadians) *
         shipThrustVelocity * exports.dt);
  vy += (-Math.cos(this.angle * angleToRadians) *
         shipThrustVelocity * exports.dt);
  vlen = Math.sqrt(vx * vx + vy * vy);
  // If the length of the new velocity is too high, then it needs to be
  // clipped. This can be done by normalizing it (i.e. scale it down to a
  // length of one) then scaling it back up to the maximum.
  if (vlen > shipMaxThrustVelocity) {
    vx = (vx / vlen) * shipMaxThrustVelocity;
    vy = (vy / vlen) * shipMaxThrustVelocity;
  }
  this.vx = vx;
  this.vy = vy;
  if (!this.thrusting) {
    this.thrusting = true;
    this.thrustingStartTime = game.time;
  }
};

Ship.prototype.turnLeft = function() {
  this.angle = (this.angle - (shipTurnVelocity * exports.dt)) % 360;
};

Ship.prototype.turnRight = function() {
  this.angle = (this.angle + (shipTurnVelocity * exports.dt)) % 360;
};

Ship.prototype.updateRadius = function() {
  Entity.prototype.updateRadius.call(this);
  // Make the ship's radius a bit smaller than it actually is,
  // to make collisions a little bit more forgiving for the player
  this.radius *= 0.8;
  this.radiusSquared = this.radius * this.radius;
};

// A player (presumably human). This object encapsulates the things that
// a person does (pressing buttons) and ties it to their ship.
function Player(id) {
  this.id = id;
  this.buttons = {};
  this.nextShipTime = 0;
  this.ship = undefined;
}
exports.Player = Player;

// Called whenever we get new data for a player. This is triggered when
// the server receives a network packet from the client.
Player.prototype.onData = function(data) {
  if (data && data.packet) {
    switch (data.packet.name) {
      case 'buttonDown':
        this.buttons[data.button] = true;
        break;

      case 'buttonUp':
        this.buttons[data.button] = false;
        break;
    }
  }
};

Player.prototype.onShipDied = function() {
  this.ship = undefined;
  this.nextShipTime = exports.time + 5;
};

Player.prototype.sendData = function(name, values) {
  if (this.socket) {
    this.socket.send(network.packMessage(name, values));
  }
};

Player.prototype.update = function() {
  if (game.server) {
    if (this.ship) {
      // Apply the button states to the ship.
      if (this.buttons[game.BUTTON_LEFT]) {
        this.ship.turnLeft();
      }
      if (this.buttons[game.BUTTON_RIGHT]) {
        this.ship.turnRight();
      }
      if (this.buttons[game.BUTTON_THRUST]) {
        this.ship.thrust();
      } else {
        this.ship.stopThrust();
      }
      if (this.buttons[game.BUTTON_FIRE]) {
        this.ship.fire();
      }
    } else if (exports.time > this.nextShipTime) {
      this.ship = entities.create(Ship);
      this.ship.spawn();
      this.ship.player = this;
      this.sendData('ackShip', [this.id, this.ship.id]);
    }
  }
};

// The hash of connected players.
exports.players = {};

// Create a new player object and add it to the list. This does not make
// any assumptions about id, except that it must be a value object key,
// and must be unique.
exports.createPlayer = function(id) {
  return (this.players[id] = new Player(id));
};

// Delete a previously created player object, destroying any attached
// objects, if they exist.
exports.deletePlayer = function(id) {
  if (this.players.hasOwnProperty(id)) {
    var player = this.players[id];
    if (player.ship) {
      player.ship.die();
    }
    delete this.players[id];
  }
};

// Initialize the game.
exports.init = function(server) {
  this.server = server;
  this.time = new Date().getTime() / 1000.0;
  this.update();
};

// Tick one frame of the game world. This moves everything around,
// performs collision checks, etc.
exports.update = function() {
  var all, i, j;

  this.lastTime = this.time;
  this.time = new Date().getTime() / 1000.0;
  this.dt = this.time - this.lastTime;

  if (this.server) {
    // Create new asteroids if they're all gone.
    // FIXME: Increase number of asteroids based on level
    for (all = Asteroid.all, i = all.length, j = 0; i--;) {
      if (!all[i].dead) {
        ++j;
      }
    }
    if (j <= 0) {
      Asteroid.createRandom(8);
    }

    // Handle any player input
    for (var id in this.players) {
      if (this.players.hasOwnProperty(id)) {
        var player = this.players[id];
        player.update();
      }
    }
  }

  // Update all the entities.
  for (all = entities.all, i = all.length; i--;) {
    all[i].update();
  }

  if (this.server) {
    game.collide();
  }
};

// Check for entity collisions, and respond with EXTREME PREJUDICE.
exports.collide = function() {
  var i, j, bullet, ship;

  // Collide the asteroids against the other entities.
  i = Asteroid.all.length;
  while (i--) {
    var asteroid = Asteroid.all[i];
    if (asteroid.dead) {
      continue;
    }

    // If the asteroid has hit a bullet, kill both of them.
    j = Bullet.all.length;
    while (j--) {
      bullet = Bullet.all[j];
      if (!bullet.dead && asteroid.overlaps(bullet)) {
        asteroid.die();
        bullet.die();
        break;
      }
    }
    if (asteroid.dead) {
      continue;
    }

    // If the asteroid has hit a ship, kill both of them.
    j = Ship.all.length;
    while (j--) {
      ship = Ship.all[j];
      if (!ship.dead && asteroid.overlaps(ship)) {
        asteroid.die();
        ship.die();
        break;
      }
    }
  }

  i = Bullet.all.length;
  while (i--) {
    bullet = Bullet.all[i];
    if (bullet.dead) {
      continue;
    }

    j = Ship.all.length;
    while (j--) {
      ship = Ship.all[j];
      if (!ship.dead && bullet.ship !== ship && ship.overlaps(bullet)) {
        bullet.die();
        ship.die();
      }
    }
  }
};
