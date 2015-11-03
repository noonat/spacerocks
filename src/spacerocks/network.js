// Helper methods for byte packing values into a string. WebSockets only
// allows you to send strings, so you have to turn other types (floats, etc.)
// into a string first.
//
// FIXME: This networking layer is a lot more complex than it needs to be
// because jspack only allows for fixed format strings. Could simplify it a
// lot with villian's struct.coffee, but would need to add support for floats
// and doubles.

'use strict';

import * as jettison from 'jettison';

export var schema = jettison.createSchema();

// Server telling the client what their player id is.
schema.define('ack', [
  {key: 'playerId', type: 'uint32'},
  {key: 'version', type: 'uint32'}
]);

// Server telling the client what their ship's entity id is.
schema.define('ackShip', [
  {key: 'playerId', type: 'uint32'},
  {key: 'entityId', type: 'uint32'}
]);

// A new player has connected to the server.
schema.define('connected', [
  {key: 'playerId', type: 'uint32'}
]);

// A player has disconnected from the server.
schema.define('disconnected', [
  {key: 'playerId', type: 'uint32'}
]);

// Client telling the server that they are pressing a button.
schema.define('buttonDown', [
  {key: 'button', type: 'uint8'}
]);

// Client telling the server that they have released a button.
schema.define('buttonUp', [
  {key: 'button', type: 'uint8'}
]);

// Server to client update for an existing entity.
schema.define('entity', [
  {key: 'entityId', type: 'uint32'},
  {key: 'x', type: 'float64'},
  {key: 'y', type: 'float64'},
  {key: 'vx', type: 'float64'},
  {key: 'vy', type: 'float64'},
  {key: 'angle', type: 'float64'},
  {key: 'scale', type: 'float64'}
]);

// Server telling client that an existing entity has died.
schema.define('entityDied', [
  {key: 'entityId', type: 'uint32'}
]);

// Server telling client what the polygonal shape is for an entity.
schema.define('entityPoints', [
  {key: 'entityId', type: 'uint32'},
  {key: 'points', type: 'array', valueType: 'float64'}
]);

// Server telling client that a new entity has spawned. This also includes
// the points for that new entity.
schema.define('entitySpawned', [
  {key: 'entityType', type: 'uint8'},
  {key: 'entityId', type: 'uint32'},
  {key: 'x', type: 'float64'},
  {key: 'y', type: 'float64'},
  {key: 'vx', type: 'float64'},
  {key: 'vy', type: 'float64'},
  {key: 'angle', type: 'float64'},
  {key: 'scale', type: 'float64'},
  {key: 'points', type: 'array', valueType: 'float64'}
]);
