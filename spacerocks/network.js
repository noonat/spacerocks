// Helper methods for byte packing values into a string. WebSockets only
// allows you to send strings, so you have to turn other types (floats, etc.)
// into a string first.
//
// FIXME: This networking layer is a lot more complex than it needs to be
// because jspack only allows for fixed format strings. Could simplify it a
// lot with villian's struct.coffee, but would need to add support for floats
// and doubles.

/* jshint node: true */
'use strict';

var jspack = require('jspack').jspack;

var packets = {};
var packetsByName = {};
var packetIndex = 0;

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

// Define a complex variable-length packet, with its own custom pack and
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

// Get a packet object by its numeric index.
exports.getPacketByIndex = function(index) {
  if (packets.hasOwnProperty(index)) {
    return packets[index];
  } else {
    return undefined;
  }
};

// Get a packet object by its string name.
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
exports.defineCustomPacket('entityPoints', function _packPoints(values) {
  var format = 'BLL';
  var i = values.length - 3;
  while (i--) {
    format += 'd';
  }
  return jspack.Pack(format, values);
}, function _unpackPoints(bytes) {
  var format = 'BLL';
  var values = jspack.Unpack(format, bytes);
  if (!values) {
    return undefined;
  }
  var object = {
    packet: this,
    packetIndex: values[0],
    entityId: values[1],
    points: null,
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
});

// Server telling client that a new entity has spawned. This also includes
// the points for that new entity.
exports.defineCustomPacket('entitySpawned', function _packSpawned(values) {
  var format = 'BBLddddddL';
  var i = values.length - 10;
  while (i--) {
    format += 'd';
  }
  return jspack.Pack(format, values);
}, function _unpackSpawned(bytes) {
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
    points: null,
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
});
