var angleToRadians = Math.PI / 180;
var clock, entities, game, local, network, server, text;

// Inherit one prototype from another. It uses the native Object.create(),
// if it exists. Otherwise, it hacks it.
function inherits(ctor, superCtor) {
  if (Object.create) {
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false
      }
    });
  } else {
    var proto = function() {};
    proto.prototype = superCtor.prototype;
    ctor.prototype = new proto();
    ctor.prototype.constructor = ctor;
  }
  return ctor;
}

// entities
// --------
//
// This module helps manage generic entities. All of the game types inherit
// from `entities.Entity`. The base class does simple velocity based movement,
// and polygonal rendering and collision testing.
//
// Custom entity classes can be created, an inherit from `Entity` (see
// `Asteroid` and other game classes for an example of this). You must also
// define the entity type, so that it can be synced between server and client:
//
//     entities.defineType(Asteroid);
//
// Once defined, you can construct new entity objects like so:
//
//     var asteroid = entities.create(Asteroid);
//
// A newly constructed entity is considered `dead` (and not rendered or
// updated). You must also call `entity.spawn()` on the entity to bring it
// to life.
//
// Each frame, the server and local client both `entity.update()` on each
// entity in the game. This function updates the position of the entity in
// the world, and performs other game logic. On the client-side, this is
// used to simulate the game between updates from the server.
//
// The `local` client also calls `entity.draw()` on each entity, to render
// it into the canvas.
//
// Various entity types override these methods to provide custom behavior.
//
entities = (function() {
  var exports = {};

  function Entity(id) {
    this.dead = true;
    this.id = id;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.scale = 1;
    this.points = [];
    this.radius = 0;
    this.radiusSquared = 0;
  }
  exports.Entity = Entity;

  Entity.prototype.die = function() {
    this.dead = true;
    if (game.server) {
      game.server.broadcast('entityDied', [this.id]);
    }
  };

  Entity.prototype.draw = function(local, points) {
    if (this.dead) {
      return;
    }
    var context = local.context;
    var _a = this.angle;
    var _s = this.scale;
    var _x = this.x;
    var _y = this.y;
    var _p = points || this.points;
    var _pl = _p.length;
    if (_pl > 0) {
      if (_a) {
        // Only rotate if needed
        context.save();
        context.translate(_x, _y);
        context.rotate(_a * angleToRadians);
        _x = _y = 0;
      }
      context.beginPath();
      if (_pl === 2) {
        // Point (drawn as a short line)
        _x = _x + _s * p[0];
        _y = _y + _s * p[1];
        context.moveTo(_x, _y);
        context.lineTo(_x + 1, _y + 1);
      } else {
        // Line or closed polygon
        context.moveTo(_x + _s * _p[0], _y + _s * _p[1]);
        for (var i = 2; i < _pl; i += 2) {
          context.lineTo(_x + _s * _p[i], _y + _s * _p[i + 1]);
        }
        if (_pl > 4) {
          context.lineTo(_x + _s * _p[0], _y + _s * _p[1]);
        }
      }
      context.stroke();
      context.closePath();
      if (_a) {
        context.restore();
      }
    }
  };

  // Return `true` if this polygon overlaps the other polygon. The line-to-line
  // code comes from .Kevin Lindsey.
  //
  // See: http://www.kevlindev.com/gui/math/intersection/Intersection.js
  Entity.prototype.overlaps = function(other) {
    var pp = other.points;
    var ps = other.scale;
    var px = other.x;
    var py = other.y;
    var _p = this.points;
    var _s = this.scale;
    var _x = this.x;
    var _y = this.y;

    // Do a radius check first.
    var dx = _x - px;
    var dy = _y - py;
    var radius = Math.sqrt(dx * dx + dy * dy);  // FIXME: radiusSquared?
    if (radius > this.radius + other.radius) {
      // Radius didn't overlap, we're good
      return false;
    }

    // For each edge in the *other* entity...
    for (var i = 0, il = pp.length; i < il; i += 2) {
      var a1x = px + ps * pp[i];
      var a1y = px + ps * pp[i + 1];
      var a2x = px + ps * pp[((i + 2) % il)];
      var a2y = py + ps * pp[((i + 2) % il) + 1];
      var n = 0;
      // and, for each line in *this* entity...
      for (var j = 0, jl = _p.length; j < jl; j += 2) {
        // ... check whether that line intersects the other line.
        var b1x = _x + _s * _p[j];
        var b1y = _y + _s * _p[j + 1];
        var b2x = _x + _s * _p[(j + 2) % jl];
        var b2y = _y + _s * _p[(j + 3) % jl];
        var uB = (b2y - b1y) * (a2x - a1x) - (b2x - b1x) * (a2y - a1y);
        if (uB !== 0) {
          var uat = (b2x - b1x) * (a1y - b1y) - (b2y - b1y) * (a1x - b1x);
          var ua = uat / uB;
          if (ua >= 0 && ua <= 1) {
            var ubt = (a2x - a1x) * (a1y - b1y) - (a2y - a1y) * (a1x - b1x);
            var ub = ubt / uB;
            if (ub >= 0 && ub <= 1) {
              return true;  // It intersected
            }
          }
        }
      }
    }
    // No intersections
    return false;
  };

  // Change the points for the entity's polygon. This method should be
  // called instead of editing the points directly, to ensure that the
  // radius is updated.
  Entity.prototype.setPoints = function(points, scale, broadcast) {
    this.points = points;
    if (scale !== undefined) {
      this.scale = scale;
    }
    this.updateRadius();
    if (game.server && broadcast !== false) {
      game.server.broadcast('entityPoints', [
        this.id,
        this.points.length
      ].concat(this.points));
    }
  };

  // Set the entity's `scale`. Updates the `radius`, like `setPoints()` above.
  Entity.prototype.setScale = function(scale) {
    this.scale = scale;
    this.updateRadius();
  };

  // Spawn an entity into the game world. New entities are dead until
  // this is called, and dead entities can be respawned using it.
  Entity.prototype.spawn = function(x, y, vx, vy, angle, scale, points) {
    this.dead = false;
    this.x = x || 0;
    this.y = y || 0;
    this.vx = vx || 0;
    this.vy = vy || 0;
    this.angle = angle || 0;
    if (points !== undefined) {
      this.setPoints(points, scale !== undefined ? scale : this.scale, false);
    } else if (scale !== undefined) {
      this.setScale(scale);
    }
    if (game.server) {
      game.server.broadcast('entitySpawned', [
        this.constructor.type,
        this.id,
        this.x, this.y,
        this.vx, this.vy,
        this.angle,
        this.scale,
        this.points.length
      ].concat(this.points));
    }
  };

  // Simulates the entity for one tick of the world. This updates the position
  // of the entity using its current velocity, and wraps the position around
  // if the entity has gone out of the game bounds.
  //
  // On the server, this also sends an update packet to the client for the
  // entity. This could be done more intelligently if all the update packets
  // were rolled up, and only values that changed were sent.
  Entity.prototype.update = function() {
    if (this.dead) {
      return;
    }

    this.x += this.vx * game.dt;
    this.y += this.vy * game.dt;

    if (this.x < -this.radius) {
      this.x = game.width + this.radius;
    }
    if (this.y < -this.radius) {
      this.y = game.height + this.radius;
    }
    if (this.x > game.width + this.radius) {
      this.x = -this.radius;
    }
    if (this.y > game.height + this.radius) {
      this.y = -this.radius;
    }

    if (game.server) {
      game.server.broadcast('entity', [
        this.id,
        this.x, this.y,
        this.vx, this.vy,
        this.angle,
        this.scale
      ]);
    }
  };

  // Recalculates the entities `radius` and `radiusSquared`, based on its
  // current polygonal shape. These values are used to do early rejection in
  // the overlap tests, so it's important to keep them up to date.
  Entity.prototype.updateRadius = function() {
    var maxRadiusSquared = 0;
    var _p = this.points;
    var _s = this.scale;
    for (var i = 0, il = _p.length; i < il; i += 2) {
      var x = _s * _p[i];
      var y = _s * _p[i + 1];
      var radiusSquared = x * x + y * y;
      if (maxRadiusSquared < radiusSquared) {
        maxRadiusSquared = radiusSquared;
      }
    }
    this.radiusSquared = maxRadiusSquared;
    this.radius = Math.sqrt(this.radiusSquared);
  };

  // Array of all the entites in the world.
  exports.all = [];

  // Map of entity object by ID. On the server, array index and entity ID
  // match, but this might not necessarily be true on the client.
  exports.forId = {};

  // Array of entity constructor methods. The index in this array is used
  // as the entity `type` in the spawn packets, so it's important that this
  // array be in sync on the server and client.
  exports.types = [];

  // Create a new entity using the given constructor.
  exports.create = function(ctor, id) {
    var entity;
    if (id === undefined) {
      // Clients assign an entity the ID given to them by the server (in the
      // entity network packet). Servers just generate it.
      id = this.findDeadId(ctor);
      if (id === undefined) {
        id = this.all.length;
      }
    }
    entity = this.forId[id];
    if (entity === undefined) {
      entity = this.forId[id] = new ctor(id);
      this.all[this.all.length] = entity;
      ctor.all[ctor.all.length] = entity;
    }
    return entity;
  };

  // Create a new entity, looking up the constructor by it's type index.
  // This is used for entitySpawn packets on the client.
  exports.createByType = function(type, id) {
    var ctor = this.types[type];
    if (ctor !== undefined) {
      return this.create(ctor, id);
    } else {
      return undefined;
    }
  };

  // Define a new type of entity.
  exports.defineType = function(ctor) {
    if (!ctor.type) {
      ctor.all = [];
      ctor.type = this.types.length;
      ctor.create = function() {
        return Entity.create(ctor);
      };
      this.types[ctor.type] = ctor;
    }
  };

  // Try to find an existing entity that is dead. This is used to that we
  // can reuse old entities instead of creating a bunch of new ones.
  exports.findDeadId = function(ctor) {
    for (var i = 0, il = this.all.length; i < il; ++i) {
      var entity = this.all[i];
      if (entity && entity.constructor.type === ctor.type && entity.dead) {
        return entity.id;
      }
    }
    return undefined;
  };

  return exports;
})();

// This is the main logic for the game. It defines our game types (asteroids,
// ships, etc.), and the physics and gameplay for them. This is run by both
// the server and the client, but the server is authoritative.
//
game = (function() {
  var Entity = entities.Entity;

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

  var exports = {
    BUTTON_LEFT: 0,
    BUTTON_RIGHT: 1,
    BUTTON_THRUST: 2,
    BUTTON_FIRE: 3,
    dt: 0,                          // Seconds elapsed since the last frame.
    time: 0,                        // Current time (absolute), in seconds.
    lastTime: 0,                    // Time of the last frame.
    width: 1280,                    // Width of the game world.
    height: 720                     // Height of the game world.
  };

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
        i = indexes.splice(Math.floor(Math.random() * indexes.length), 1) * 2;
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
      theta = 2 * Math.PI * Math.random();
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

  return exports;
})();

// Local, client-side of the game. This is just responsible for rendering
// entities, and sending client keypresses up to the server.
//
local = (function() {
  var Entity = entities.Entity;

  var titleCharWidth = 32;
  var titleCharSpacing = 48;
  var titleCharHeight = 64;
  var titleTimer = 5;

  var exports = {
    canvas: undefined,         // HTML5 canvas element.
    canvasWidth: 0,            // Current width of the canvas element.
    canvasHeight: 0,           // Current height of the canvas element.
    canvasScaleX: 1,           // Scale to transform x coordinates from game space to canvas space.
    canvasScaleY: 1,           // Scale to transform y coordinates from game space to canvas space.
    context: undefined,        // 2D context for the canvas element.
    keysMap: {                 // Map of key codes to buttons.
      32: game.BUTTON_FIRE,    // Space.
      37: game.BUTTON_LEFT,    // Left arrow.
      38: game.BUTTON_THRUST,  // Up arrow.
      39: game.BUTTON_RIGHT,   // Right arrow.
      90: game.BUTTON_FIRE,    // Z.
      88: game.BUTTON_THRUST   // X.
    },
    loopback: false,           // If true, play locally without a server.
    socket: undefined          // Socket.IO connection to the server.
  };

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

      var host = window.location.origin.replace(/^http/, 'ws');
      _this.socket = new WebSocket(host);
      if (_this.socket.transport) {
        _this.socket.connect();
        _this.socket.on('connect', function() {
          _this.init(element.innerWidth, element.innerHeight);
        });
        _this.socket.on('message', function(message) {
          _this.onMessage(message);
        });
        _this.socket.on('close', function() {
          _this.socket.connect();
        });
      } else {
        _this.loopback = true;
        _this.broadcast = function() {};
        _this.init(element.innerWidth, element.innerHeight);
      }
    }, false);
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

  return exports;
})();

// Helper methods for byte packing values into a string. WebSockets only
// allows you to send strings, so you have to turn other types (floats, etc.)
// into a string first.
//
// FIXME: This networking layer is a lot more complex than it needs to be
// because jspack only allows for fixed format strings. Could simplify it a
// lot with villian's struct.coffee, but would need to add support for floats
// and doubles.
//
network = (function() {
  var packets = {};
  var packetsByName = {};
  var packetIndex = 0;

  var exports = {};

  // Define a simple static-length packet.
  exports.definePacket = function(name, format, keys) {
    var packet;

    function _pack(values) {
      return jspack.Pack(packet.format, values);
    }

    function _unpack(bytes) {
      var object = {packet: packet};
      var keys = packet.keys;
      var values = jspack.Unpack(packet.format, bytes);
      if (values) {
        for (var i = 0, il = keys.length; i < il; ++i) {
          object[keys[i]] = values[i];
        }
      }
      return object;
    }
    packet = this.defineCustomPacket(name, _pack, _unpack);
    packet.format = format;
    packet.keys = keys;
    return packet;
  };

  // Define a complex variable-length packet, with it's own custom pack and
  // unpack functions. This is used for packets like point updates, where we
  // don't know up front how long they will be.
  // FIXME: If jspack could do a streaming need this wouldn't be needed.
  exports.defineCustomPacket = function(name, pack, unpack) {
    var packet = {
      index: ++packetIndex,
      name: name,
      pack: pack,
      unpack: unpack
    };
    packets[packetIndex] = packet;
    packetsByName[packet.name] = packet;
    return packet;
  };

  // Get a packet object by it's numeric index.
  exports.getPacketByIndex = function(index) {
    if (packets.hasOwnProperty(index)) {
      return packets[index];
    } else {
      return undefined;
    }
  };

  // Get a packet object by it's string name.
  exports.getPacketByName = function(name) {
    if (packetsByName.hasOwnProperty(name)) {
      return packetsByName[name];
    } else {
      return undefined;
    }
  };

  // Byte pack multiple arguments into a string.
  exports.packMessage = function(name, values) {
    var packet = this.getPacketByName(name);
    if (!packet) {
      throw new Error('Invalid packet name "' + name + '"');
    }
    values.unshift(packet.index);
    var bytes = packet.pack.call(packet, values);
    var message = '';
    for (var i = 0, il = bytes.length; i < il; ++i) {
      message += String.fromCharCode(bytes[i]);
    }
    return message;
  };

  // Unpack a string into an object.
  exports.unpackMessage = function(message) {
    var i, il, bytes, packet, object, keys, values;
    bytes = [];
    for (i = 0, il = message.length; i < il; ++i) {
      bytes[i] = message.charCodeAt(i);
    }
    values = jspack.Unpack('B', bytes);
    if (!values) {
      return undefined;
    }
    packet = this.getPacketByIndex(values[0]);
    if (packet) {
      return packet.unpack(bytes);
    }
    return undefined;
  };

  // Server telling the client what their player id is.
  exports.definePacket('ack', 'BLL', [
    'packetIndex',
    'playerId',
    'version'
  ]);

  // Server telling the client what their ship's entity id is.
  exports.definePacket('ackShip', 'BLL', [
    'packetIndex',
    'playerId',
    'entityId'
  ]);

  // A new player has connected to the server.
  exports.definePacket('connected', 'BL', [
    'packetIndex',
    'playerId'
  ]);

  // A player has disconnected from the server.
  exports.definePacket('disconnected', 'BL', [
    'packetIndex',
    'playerId'
  ]);

  // Client telling the server that they are pressing a button.
  exports.definePacket('buttonDown', 'BB', [
    'packetIndex',
    'button'
  ]);

  // Client telling the server that they have released a button.
  exports.definePacket('buttonUp', 'BB', [
    'packetIndex',
    'button'
  ]);

  // Server to client update for an existing entity.
  exports.definePacket('entity', 'BLdddddd', [
    'packetIndex',
    'entityId',
    'x', 'y',
    'vx', 'vy',
    'angle',
    'scale'
  ]);

  // Server telling client that an existing entity has died.
  exports.definePacket('entityDied', 'BL', [
    'packetIndex',
    'entityId'
  ]);

  // Server telling client what the polygonal shape is for an entity.
  exports.defineCustomPacket('entityPoints',
    function _packPoints(values) {
      var format = 'BLL';
      var i = values.length - 3;
      while (i--) {
        format += 'd';
      }
      return jspack.Pack(format, values);
    },
    function _unpackPoints(bytes) {
      var format = 'BLL';
      var values = jspack.Unpack(format, bytes);
      if (!values) {
        return undefined;
      }
      var object = {
        packet: this,
        packetIndex: values[0],
        entityId: values[1],
        pointsLength: values[2]
      };
      var i = object.pointsLength;
      while (i--) {
        format += 'd';
      }
      values = jspack.Unpack(format, bytes);
      if (!values) {
        return undefined;
      }
      object.points = values.slice(3);
      return object;
    }
  );

  // Server telling client that a new entity has spawned. This also includes
  // the points for that new entity.
  exports.defineCustomPacket('entitySpawned',
    function _packSpawned(values) {
      var format = 'BBLddddddL';
      var i = values.length - 10;
      while (i--) {
        format += 'd';
      }
      return jspack.Pack(format, values);
    },
    function _unpackSpawned(bytes) {
      var format = 'BBLddddddL';
      var values = jspack.Unpack(format, bytes);
      if (!values) {
        return undefined;
      }
      var object = {
        packet: this,
        packetIndex: values[0],
        entityType: values[1],
        entityId: values[2],
        x: values[3],
        y: values[4],
        vx: values[5],
        vy: values[6],
        angle: values[7],
        scale: values[8],
        pointsLength: values[9]
      };
      var i = object.pointsLength;
      while (i--) {
        format += 'd';
      }
      values = jspack.Unpack(format, bytes);
      if (!values) {
        return undefined;
      }
      object.points = values.slice(10);
      return object;
    }
  );

  return exports;
})();

// The server-side of the game. It expects server.attach() to be called and
// passed a socket.io server object.
//
server = (function() {
  var exports = {};

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

  return exports;
})();

// Vector text rendering helpers.
//
text = (function() {
  var exports = {};

  // This is a big object containing arrays of lines for each letter / number.
  exports.chars = {
    'A': [
      [0.0, 1.0,
       0.0, 0.25,
       0.5, 0.0,
       1.0, 0.25,
       1.0, 1.0],
      [0.0, 0.75,
       1.0, 0.75]],
    'B': [ // b sucks
      [0.75, 0.50,
       0.00, 0.50,
       0.00, 0.00,
       0.75, 0.00,
       1.00, 0.16,
       1.00, 0.32,
       0.75, 0.50,
       1.00, 0.66,
       1.00, 0.83,
       0.75, 1.00,
       0.00, 1.00,
       0.00, 0.50]],
    'C': [
      [1.0, 0.0,
       0.0, 0.0,
       0.0, 1.0,
       1.0, 1.0]],
    'D': [
      [0.0, 0.0,
       0.5, 0.0,
       1.0, 0.33,
       1.0, 0.66,
       0.5, 1.0,
       0.0, 1.0,
       0.0, 0.0]],
    'E': [
      [1.0, 0.0,
       0.0, 0.0,
       0.0, 1.0,
       1.0, 1.0],
      [0.0, 0.5,
       0.75, 0.5]],
    'F': [
      [1.0, 0.0,
       0.0, 0.0,
       0.0, 1.0],
      [0.0, 0.5,
       0.75, 0.5]],
    'G': [
      [1.0, 0.25,
       1.0, 0.0,
       0.0, 0.0,
       0.0, 1.0,
       1.0, 1.0,
       1.0, 0.66,
       0.5, 0.66]],
    'H': [
      [0.0, 0.0,
       0.0, 1.0],
      [1.0, 0.0,
       1.0, 1.0],
      [0.0, 0.5,
       1.0, 0.5]],
    'I': [
      [0.0, 0.0,
       1.0, 0.0],
      [0.0, 1.0,
       1.0, 1.0],
      [0.5, 0.0,
       0.5, 1.0]],
    'J': [
      [1.0, 0.0,
       1.0, 1.0,
       0.5, 1.0,
       0.0, 0.66]],
    'K': [
      [0.0, 0.0,
       0.0, 0.5,
       1.0, 0.0],
      [0.0, 1.0,
       0.0, 0.5,
       1.0, 1.0]],
    'L': [
      [0.0, 0.0,
       0.0, 1.0,
       1.0, 1.0]],
    'M': [
      [0.0, 1.0,
       0.0, 0.0,
       0.5, 0.33,
       1.0, 0.0,
       1.0, 1.0]],
    'N': [
      [0.0, 1.0,
       0.0, 0.0,
       1.0, 1.0,
       1.0, 0.0]],
    'O': [
      [0.0, 0.0,
       1.0, 0.0,
       1.0, 1.0,
       0.0, 1.0,
       0.0, 0.0]],
    'P': [
      [0.0, 0.5,
       0.0, 0.0,
       1.0, 0.0,
       1.0, 0.5,
       0.0, 0.5,
       0.0, 1.0]],
    'Q': [
      [0.0, 0.0,
       1.0, 0.0,
       1.0, 0.66,
       0.5, 1.0,
       0.0, 1.0,
       0.0, 0.0],
      [0.5, 0.66,
       1.0, 1.0]],
    'R': [
      [0.0, 0.5,
       0.0, 0.0,
       1.0, 0.0,
       1.0, 0.5,
       0.0, 0.5,
       0.0, 1.0],
      [0.25, 0.5,
       1.0, 1.0]],
    'S': [
      [1.0, 0.0,
       0.0, 0.0,
       0.0, 0.5,
       1.0, 0.5,
       1.0, 1.0,
       0.0, 1.0]],
    'T': [
      [0.0, 0.0,
       1.0, 0.0],
      [0.5, 0.0,
       0.5, 1.0]],
    'U': [
      [0.0, 0.0,
       0.0, 1.0,
       1.0, 1.0,
       1.0, 0.0]],
    'V': [
      [0.0, 0.0,
       0.5, 1.0,
       1.0, 0.0]],
    'W': [
      [0.0, 0.0,
       0.0, 1.0,
       0.5, 0.66,
       1.0, 1.0,
       1.0, 0.0]],
    'X': [
      [0.0, 0.0,
       1.0, 1.0],
      [1.0, 0.0,
       0.0, 1.0]],
    'Y': [
      [0.0, 0.0,
       0.5, 0.33,
       0.5, 1.0],
      [0.5, 0.33,
       1.0, 0.0]],
    'Z': [
      [0.0, 0.0,
       1.0, 0.0,
       0.0, 1.0,
       1.0, 1.0]],
    '0': [
      [0.0, 0.0,
       1.0, 0.0,
       1.0, 1.0,
       0.0, 1.0,
       0.0, 0.0],
      [1.0, 0.0,
       0.0, 1.0]],
    '1': [
      [0.0, 0.2,
       0.5, 0.0,
       0.5, 1.0],
      [0.0, 1.0,
       1.0, 1.0]],
    '2': [
      [0.0, 0.0,
       1.0, 0.0,
       1.0, 0.5,
       0.0, 0.5,
       0.0, 1.0,
       1.0, 1.0]],
    '3': [
      [0.0, 0.0,
       1.0, 0.0,
       1.0, 1.0,
       0.0, 1.0],
      [0.0, 0.5,
       1.0, 0.5]],
    '4': [
      [0.0, 0.0,
       0.0, 0.5,
       1.0, 0.5],
      [1.0, 0.0,
       1.0, 1.0]],
    '5': [
      [1.0, 0.0,
       0.0, 0.0,
       0.0, 0.5,
       1.0, 0.5,
       1.0, 1.0,
       0.0, 1.0]],
    '6': [
      [1.0, 0.0,
       0.0, 0.0,
       0.0, 1.0,
       1.0, 1.0,
       1.0, 0.5,
       0.0, 0.5]],
    '7': [
      [0.0, 0.0,
       1.0, 0.0,
       1.0, 1.0]],
    '8': [
      [0.0, 0.5,
       0.0, 0.0,
       1.0, 0.0,
       1.0, 0.5,
       0.0, 0.5,
       0.0, 1.0,
       1.0, 1.0,
       1.0, 0.5]],
    '9': [
      [1.0, 0.5,
       0.0, 0.5,
       0.0, 0.0,
       1.0, 0.0,
       1.0, 1.0]],
    ':': [
      [0.5, 0.2,
       0.5, 0.3],
      [0.5, 0.7,
       0.5, 0.8]]
  };

  // Draw an individual character.
  exports.drawChar = function(ch, x, y, w, h) {
    var lines = this.chars[ch];
    if (!lines) {
      return;
    }
    for (var i = 0, il = lines.length; i < il; ++i) {
      var line = lines[i];
      for (var j = 0, jl = line.length; j < jl; j += 2) {
        var px = x + line[j + 0] * w;
        var py = y + line[j + 1] * h;
        if (j === 0) {
          local.context.moveTo(px, py);
        } else {
          local.context.lineTo(px, py);
        }
      }
    }
  };

  // Draw a string of characters.
  exports.drawString = function(string, x, y, charWidth, charSpacing,
                                charHeight) {
    string = string.toUpperCase();
    for (var i = 0, il = string.length; i < il; ++i) {
      var ch = string.charAt(i);
      this.drawChar(ch, x + (i * charSpacing), y, charWidth, charHeight);
    }
  };

  // Draw a string of characters, centered horizontally and vertically.
  exports.drawCenteredString = function(string, charWidth, charSpacing,
                                        charHeight, x, y) {
    x = x || 0;
    y = y || 0;
    x += (game.width - (charSpacing * (string.length - 1) + charWidth)) / 2;
    y += (game.height - charHeight) / 2;
    return this.drawString(string, x, y, charWidth, charSpacing, charHeight);
  };

  return exports;
})();

if (typeof exports !== 'undefined') {
  exports.entities = entities;
  exports.game = game;
  exports.local = local;
  exports.server = server;
  exports.network = network;
  jspack = require('./vendor/jspack');  // FIXME: this is gross
}
