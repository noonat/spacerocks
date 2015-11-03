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

'use strict';

// NOTE: game is required at the bottom, because of circular dependencies
import * as util from './util';

export class Entity {
  constructor(id) {
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

  die() {
    this.dead = true;
    if (game.server) {
      game.server.broadcast('entityDied', {
        entityId: this.id
      });
    }
  }

  draw(local, points) {
    if (this.dead) {
      return;
    }
    let context = local.context;
    let _a = this.angle;
    let _s = this.scale;
    let _x = this.x;
    let _y = this.y;
    let _p = points || this.points;
    let _pl = _p.length;
    if (_pl > 0) {
      if (_a) {
        // Only rotate if needed
        context.save();
        context.translate(_x, _y);
        context.rotate(_a * util.angleToRadians);
        _x = _y = 0;
      }
      context.beginPath();
      if (_pl === 2) {
        // Point (drawn as a short line)
        _x = _x + _s * _p[0];
        _y = _y + _s * _p[1];
        context.moveTo(_x, _y);
        context.lineTo(_x + 1, _y + 1);
      } else {
        // Line or closed polygon
        context.moveTo(_x + _s * _p[0], _y + _s * _p[1]);
        for (let i = 2; i < _pl; i += 2) {
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
  }

  // Return `true` if this polygon overlaps the other polygon. The line-to-line
  // code comes from Kevin Lindsey.
  //
  // See: http://www.kevlindev.com/gui/math/intersection/Intersection.js
  overlaps(other) {
    let pp = other.points;
    let ps = other.scale;
    let px = other.x;
    let py = other.y;
    let _p = this.points;
    let _s = this.scale;
    let _x = this.x;
    let _y = this.y;

    // Do a radius check first.
    let dx = _x - px;
    let dy = _y - py;
    let radius = Math.sqrt(dx * dx + dy * dy);  // FIXME: radiusSquared?
    if (radius > this.radius + other.radius) {
      // Radius didn't overlap, we're good
      return false;
    }

    // For each edge in the *other* entity...
    for (let i = 0, il = pp.length; i < il; i += 2) {
      let a1x = px + ps * pp[i];
      let a1y = px + ps * pp[i + 1];
      let a2x = px + ps * pp[((i + 2) % il)];
      let a2y = py + ps * pp[((i + 2) % il) + 1];
      let n = 0;
      // and, for each line in *this* entity...
      for (let j = 0, jl = _p.length; j < jl; j += 2) {
        // ... check whether that line intersects the other line.
        let b1x = _x + _s * _p[j];
        let b1y = _y + _s * _p[j + 1];
        let b2x = _x + _s * _p[(j + 2) % jl];
        let b2y = _y + _s * _p[(j + 3) % jl];
        let uB = (b2y - b1y) * (a2x - a1x) - (b2x - b1x) * (a2y - a1y);
        if (uB !== 0) {
          let uat = (b2x - b1x) * (a1y - b1y) - (b2y - b1y) * (a1x - b1x);
          let ua = uat / uB;
          if (ua >= 0 && ua <= 1) {
            let ubt = (a2x - a1x) * (a1y - b1y) - (a2y - a1y) * (a1x - b1x);
            let ub = ubt / uB;
            if (ub >= 0 && ub <= 1) {
              return true;  // It intersected
            }
          }
        }
      }
    }
    // No intersections
    return false;
  }

  // Change the points for the entity's polygon. This method should be
  // called instead of editing the points directly, to ensure that the
  // radius is updated.
  setPoints(points, scale, broadcast) {
    this.points = points;
    if (scale !== undefined) {
      this.scale = scale;
    }
    this.updateRadius();
    if (game.server && broadcast !== false) {
      game.server.broadcast('entityPoints', {
        entityId: this.id,
        points: this.points
      });
    }
  }

  // Set the entity's `scale`. Updates the `radius`, like `setPoints()` above.
  setScale(scale) {
    this.scale = scale;
    this.updateRadius();
  }

  // Spawn an entity into the game world. New entities are dead until
  // this is called, and dead entities can be respawned using it.
  spawn(x, y, vx, vy, angle, scale, points) {
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
      game.server.broadcast('entitySpawned', {
        entityType: this.constructor.type,
        entityId: this.id,
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        angle: this.angle,
        scale: this.scale,
        points: this.points
      });
    }
  }

  // Simulates the entity for one tick of the world. This updates the position
  // of the entity using its current velocity, and wraps the position around
  // if the entity has gone out of the game bounds.
  //
  // On the server, this also sends an update packet to the client for the
  // entity. This could be done more intelligently if all the update packets
  // were rolled up, and only values that changed were sent.
  update() {
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
      game.server.broadcast('entity', {
        entityId: this.id,
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        angle: this.angle,
        scale: this.scale
      });
    }
  }

  // Recalculates the entities `radius` and `radiusSquared`, based on its
  // current polygonal shape. These values are used to do early rejection in
  // the overlap tests, so it's important to keep them up to date.
  updateRadius() {
    let maxRadiusSquared = 0;
    let _p = this.points;
    let _s = this.scale;
    for (let i = 0, il = _p.length; i < il; i += 2) {
      let x = _s * _p[i];
      let y = _s * _p[i + 1];
      let radiusSquared = x * x + y * y;
      if (maxRadiusSquared < radiusSquared) {
        maxRadiusSquared = radiusSquared;
      }
    }
    this.radiusSquared = maxRadiusSquared;
    this.radius = Math.sqrt(this.radiusSquared);
  }
}

// Array of all the entites in the world.
export var all = [];

// Map of entity object by ID. On the server, array index and entity ID
// match, but this might not necessarily be true on the client.
export var forId = {};

// Array of entity constructor methods. The index in this array is used
// as the entity `type` in the spawn packets, so it's important that this
// array be in sync on the server and client.
export var types = [];

// Create a new entity using the given constructor.
export function create(ctor, id) {
  if (id === undefined) {
    // Clients assign an entity the ID given to them by the server (in the
    // entity network packet). Servers just generate it.
    id = findDeadId(ctor);
    if (id === undefined) {
      id = all.length;
    }
  }
  let entity = forId[id];
  if (entity === undefined) {
    entity = forId[id] = new ctor(id);
    all[all.length] = entity;
    ctor.all[ctor.all.length] = entity;
  }
  return entity;
}

// Create a new entity, looking up the constructor by its type index.
// This is used for entitySpawn packets on the client.
export function createByType(type, id) {
  let ctor = types[type];
  if (ctor !== undefined) {
    return create(ctor, id);
  } else {
    return undefined;
  }
}

// Define a new type of entity.
export function defineType(ctor) {
  if (!ctor.type) {
    ctor.all = [];
    ctor.type = types.length;
    ctor.create = function() {
      return Entity.create(ctor);
    };
    types[ctor.type] = ctor;
  }
}

// Try to find an existing entity that is dead. This is used to that we
// can reuse old entities instead of creating a bunch of new ones.
export function findDeadId(ctor) {
  for (let i = 0, il = all.length; i < il; i++) {
    let entity = all[i];
    if (entity && entity.constructor.type === ctor.type && entity.dead) {
      return entity.id;
    }
  }
  return undefined;
}

const game = require('./game');
