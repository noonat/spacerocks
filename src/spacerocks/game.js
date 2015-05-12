// This is the main logic for the game. It defines our game types (asteroids,
// ships, etc.), and the physics and gameplay for them. This is run by both
// the server and the client, but the server is authoritative.

'use strict';

import * as entities from './entities';
import {Entity} from './entities';
import * as network from './network';
import {angleToRadians} from './util';

const game = exports;

const asteroidSmallScale = 12;      // Small asteroid size.
const asteroidMediumScale = 32;     // Medium asteroid size.
const asteroidLargeScale = 64;      // Large asteroid size.
const asteroidVelocity = 48;        // Large asteroids should move this fast.
const bulletPoints = [              // Points for the bullet entities.
  0.0, 0.0,
  1.0, 1.0
];
const bulletTime = 1.5;             // Bullets automatically disappear after this many seconds.
const bulletVelocity = 320;         // Bullets move this many units per second.
const explosionParticles = 8;       // Explosions will have this many particles.
const explosionTime = 1;            // Explosions will last this many seconds.
const shipBulletTimer = 0.2;        // Don't allow a ship to fire again for this many seconds.
const shipPoints = [                // Points for the ship object.
   0.0, -10.0,
  -7.5,  10.0,
  -4.0,   7.0,
   4.0,   7.0,
   7.5,  10.0
];
const shipThrustPoints = [          // Points for the ship, while thrusting.
   0.0, -10.0,
  -7.5,  10.0,
  -4.0,   7.0,
   4.0,   7.0,
   0.0,  14.0,
  -4.0,   7.0,
   4.0,   7.0,
   7.5,  10.0
];
const shipTurnVelocity = 256;       // Turn this many degrees per second.
const shipThrustVelocity = 128;     // Accelerate this many units per second.
const shipMaxThrustVelocity = 192;  // Move up to this many units per second.
const version = 1;

export var BUTTON_LEFT = 0;
export var BUTTON_RIGHT = 1;
export var BUTTON_THRUST = 2;
export var BUTTON_FIRE = 3;
export var dt = 0;                          // Seconds elapsed since the last frame.
export var time = 0;                        // Current time (absolute), in seconds.
export var lastTime = 0;                    // Time of the last frame.
export var width = 1280;                    // Width of the game world.
export var height = 720;                    // Height of the game world.

export var server = null;

//
//      .   .
//    .       .
//  .           .
//  .           .
//    .       .
//      .   .
//

export class Asteroid extends Entity {
  constructor(id) {
    super(id);
  }

  die() {
    entities.create(Explosion).spawn(this.x, this.y, 0, 0, 0, this.scale);
    super.die();
    let scale = this.scale - 1;
    if (scale < asteroidSmallScale) {
      return;
    } else if (scale < asteroidMediumScale) {
      scale = asteroidSmallScale;
    } else {
      scale = asteroidMediumScale;
    }
    // Backup the old values, since our entity may get reused
    let vlen = Math.sqrt(this.vx * this.vx + this.vy * this.vy) * 3;
    let vrad = Math.atan2(-this.vy, this.vx);
    let x = this.x;
    let y = this.y;
    let f = 0.4; //(0.3 + 0.7 * Math.random())
    let i = 2;
    while (i--) {
      vrad += Math.random() - 0.5;
      let nx =  Math.cos(vrad);
      let ny = -Math.sin(vrad);
      entities.create(Asteroid).spawn(
        x, y, nx * vlen * f, ny * vlen * f, 0, scale);
      f = 1.0 - f;
    }
  }

  spawn(x, y, vx, vy, angle, scale, points) {
    if (scale === undefined) {
      scale = asteroidLargeScale;
    }

    let a, b, c, d, i, il, indexes, radians, radius;

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
        let randomIndex = Math.floor(Math.random() * indexes.length);
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
      let theta = 2 * Math.PI * Math.random();
      vx = asteroidVelocity *  Math.cos(theta);
      vy = asteroidVelocity * -Math.sin(theta);
    }

    super.spawn(x, y, vx, vy, angle, scale, points);
  }
}

Asteroid.createRandom = function(count) {
  while (count--) {
    entities.create(Asteroid).spawn();
  }
};

entities.defineType(Asteroid);

//
// == PEW PEW ==
//

export class Bullet extends Entity {
  constructor(id) {
    super(id);
    this.timeLeft = 0;
  }

  die() {
    this.timeLeft = 0;
    super.die();
  }

  draw(local, points) {
    super.draw(local, points || bulletPoints);
  }

  spawn(x, y, vx, vy, angle, scale, points) {
    if (points === undefined) {
      points = [0, 0, 1, 1];
    }
    this.timeLeft = bulletTime;
    super.spawn(x, y, vx, vy, angle, scale, points);
  }

  update() {
    if (this.dead) {
      return;
    }
    // Bullets should disappear when they run out of time.
    this.timeLeft -= exports.dt;
    if (this.timeLeft < 0) {
      this.die();
      return;
    }
    let ox = this.x;
    let oy = this.y;
    super.update();
    if (game.server) {
      this.setPoints([0, 0, this.x - ox, this.y - oy], undefined, false);
    }
  }
}

entities.defineType(Bullet);

//
// halp... i'm dead
//

// FIXME: Debris could really be entirely client-side.
export class Debris extends Entity {
  constructor(id) {
    super(id);
  }

  spawn(...args) {
    super.spawn(...args);
    this.timeLeft = 1 + Math.random() * 4;
  }

  update() {
    if (this.dead) {
      return;
    }
    this.timeLeft -= game.dt;
    if (this.timeLeft < 0) {
      this.die();
      return;
    }
    super.update();
  }
}

entities.defineType(Debris);

//
// .     .  .     .
//    .        .
//       .  .
//    .  .  .  kaboom
//       .     .
//

export class Explosion extends Entity {
  constructor(id) {
    super(id);
    this.particles = [];
    for (let i = 0; i < explosionParticles; i++) {
      this.particles[i] = {x: 0, y: 0, vx: 0, vy: 0};
    }
  }

  draw(local, points) {
    if (this.dead) {
      return;
    }

    // Override draw completely. We don't actually care about the transmitted
    // points, since explosions don't have to match on different clients. We
    // just generate and draw a random explosion on each client.

    let i = this.particles.length;
    let context = local.context;
    let _x = this.x;
    let _y = this.y;
    let _s = this.scale;
    context.beginPath();
    while (i--) {
      let p = this.particles[i];
      let px = _x + _s * p.x;
      let py = _y + _s * p.y;
      context.moveTo(px, py);
      context.lineTo(px + 1, py + 1);
    }

    // Decreases the brightness of the explosion over its lifetime.
    let f = this.timeLeft / explosionTime;
    let b = Math.round(15 * f * f).toString(16);
    context.strokeStyle = '#' + b + b + b;
    context.stroke();
    context.strokeStyle = '#fff';

    context.closePath();
  }

  spawn(x, y, vx, vy, angle, scale, points) {
    super.spawn(x, y, 0, 0, 0, scale, [x, y]);
    this.timeLeft = explosionTime;
    // Generate a bunch of particles and assign them random velocities.
    let i = this.particles.length;
    while (i--) {
      let p = this.particles[i];
      let r = Math.random() * 2 * Math.PI;
      let v = 2 + Math.random() * 2;
      p.x = p.y = 0;
      p.vx =  Math.cos(r) * v;
      p.vy = -Math.sin(r) * v;
    }
  }

  update() {
    if (this.dead) {
      return;
    }
    // Explosions should disappear when they run out of time.
    this.timeLeft -= exports.dt;
    if (this.timeLeft < 0) {
      this.die();
      return;
    }
    let i = this.particles.length;
    while (i--) {
      let p = this.particles[i];
      p.x += p.vx * game.dt;
      p.y += p.vy * game.dt;
    }
  }
}

entities.defineType(Explosion);

//
//     .
//    . .
//   .   .    VROOM (ssh, i'm in space)
//  .......
// .       .
//

export class Ship extends Entity {
  constructor(id) {
    super(id);
  }

  draw(local, points) {
    if (this.dead) {
      return;
    }
    let thrusting = this.thrusting && (game.time % 0.15) >= 0.07;
    points = points || (thrusting ? shipThrustPoints : shipPoints);
    super.draw(local, points);
  }

  die() {
    this.spawnDebris();
    // If this ship belongs to a player, notify the player that the ship died.
    if (this.player && this.player.ship === this) {
      this.player.onShipDied();
    }
    this.player = undefined;
    super.die();
  }

  // Fire a bullet, if enough time has passed since firing the last one.
  fire() {
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
    let nx =  Math.sin(this.angle * angleToRadians);
    let ny = -Math.cos(this.angle * angleToRadians);
    let bullet = entities.create(Bullet);
    bullet.spawn(
      this.x + nx * 10, this.y + ny * 10,
      nx * bulletVelocity, ny * bulletVelocity);
    bullet.ship = this;
  }

  spawn(x, y, vx, vy, angle, scale, points) {
    if (x === undefined) {
      x = game.width / 2;
    }
    if (y === undefined) {
      y = game.height / 4;
    }
    if (points === undefined) {
      points = shipPoints;
    }
    super.spawn(x, y, vx, vy, angle, scale, points);
    this.bulletTimer = 0;
    this.thrusting = false;
  }

  spawnDebris() {
    entities.create(Explosion).spawn(this.x, this.y, 0, 0, 0, 32);
    // This generates a bunch of debris entities based on the ship's current
    // (rotated) points, giving the appearance of the ship falling apart
    // when it dies.
    let _p = this.points;
    let _pl = this.points.length;
    let cos = Math.cos(this.angle * angleToRadians);
    let sin = Math.sin(this.angle * angleToRadians);
    for (let i = 0; i < _pl; i += 2) {
      let ii = (i + 2) % _pl;
      let x1 = _p[i];
      let y1 = _p[i + 1];
      let x2 = _p[ii];
      let y2 = _p[ii + 1];
      let points = [
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
  }

  stopThrust() {
    this.thrusting = false;
  }

  // Accelerate the ship forward a bit.
  thrust() {
    if (this.dead) {
      return;
    }
    let vx = this.vx;
    let vy = this.vy;
    let vlen;
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
  }

  turnLeft() {
    this.angle = (this.angle - (shipTurnVelocity * exports.dt)) % 360;
  }

  turnRight() {
    this.angle = (this.angle + (shipTurnVelocity * exports.dt)) % 360;
  }

  updateRadius() {
    super.updateRadius();
    // Make the ship's radius a bit smaller than it actually is,
    // to make collisions a little bit more forgiving for the player
    this.radius *= 0.8;
    this.radiusSquared = this.radius * this.radius;
  }
}

entities.defineType(Ship);

// A player (presumably human). This object encapsulates the things that
// a person does (pressing buttons) and ties it to their ship.
export class Player {
  constructor(id) {
    this.id = id;
    this.buttons = {};
    this.nextShipTime = 0;
    this.ship = undefined;
  }

  // Called whenever we get new data for a player. This is triggered when
  // the server receives a network packet from the client.
  onData(data) {
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
  }

  onShipDied() {
    this.ship = undefined;
    this.nextShipTime = exports.time + 5;
  }

  sendData(name, values) {
    if (this.socket) {
      this.socket.send(network.packMessage(name, values));
    }
  }

  update() {
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
  }
}

// The hash of connected players.
export var players = {};

// Create a new player object and add it to the list. This does not make
// any assumptions about id, except that it must be a value object key,
// and must be unique.
export function createPlayer(id) {
  return (players[id] = new Player(id));
}

// Delete a previously created player object, destroying any attached
// objects, if they exist.
export function deletePlayer(id) {
  if (players.hasOwnProperty(id)) {
    let player = players[id];
    if (player.ship) {
      player.ship.die();
    }
    delete players[id];
  }
}

// Initialize the game.
export function init(newServer) {
  server = newServer;
  time = new Date().getTime() / 1000.0;
  update();
}

// Tick one frame of the game world. This moves everything around,
// performs collision checks, etc.
export function update() {
  lastTime = time;
  time = new Date().getTime() / 1000.0;
  dt = time - lastTime;

  if (server) {
    // Create new asteroids if they're all gone.
    // FIXME: Increase number of asteroids based on level
    let j = 0;
    for (let all = Asteroid.all, i = all.length; i--;) {
      if (!all[i].dead) {
        ++j;
      }
    }
    if (j <= 0) {
      Asteroid.createRandom(8);
    }

    // Handle any player input
    for (let id in players) {
      if (players.hasOwnProperty(id)) {
        let player = players[id];
        player.update();
      }
    }
  }

  // Update all the entities.
  for (let all = entities.all, i = all.length; i--;) {
    all[i].update();
  }

  if (server) {
    collide();
  }
}

// Check for entity collisions, and respond with EXTREME PREJUDICE.
export function collide() {
  // Collide the asteroids against the other entities.
  let i = Asteroid.all.length;
  while (i--) {
    let asteroid = Asteroid.all[i];
    if (asteroid.dead) {
      continue;
    }

    // If the asteroid has hit a bullet, kill both of them.
    let j = Bullet.all.length;
    while (j--) {
      let bullet = Bullet.all[j];
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
      let ship = Ship.all[j];
      if (!ship.dead && asteroid.overlaps(ship)) {
        asteroid.die();
        ship.die();
        break;
      }
    }
  }

  i = Bullet.all.length;
  while (i--) {
    let bullet = Bullet.all[i];
    if (bullet.dead) {
      continue;
    }

    let j = Ship.all.length;
    while (j--) {
      let ship = Ship.all[j];
      if (!ship.dead && bullet.ship !== ship && ship.overlaps(bullet)) {
        bullet.die();
        ship.die();
      }
    }
  }
}
