// Helper methods for byte packing values into a string. WebSockets only
// allows you to send strings, so you have to turn other types (floats, etc.)
// into a string first.
//
// FIXME: This networking layer is a lot more complex than it needs to be
// because jspack only allows for fixed format strings. Could simplify it a
// lot with villian's struct.coffee, but would need to add support for floats
// and doubles.

'use strict';

import {jspack} from 'jspack';

var packets = {};
var packetsByName = {};
var packetIndex = 0;

// Define a simple static-length packet.
export function definePacket(name, format, keys) {
  let packet;

  function _pack(values) {
    return jspack.Pack(packet.format, values);
  }

  function _unpack(bytes) {
    let object = {packet: packet};
    let keys = packet.keys;
    let values = jspack.Unpack(packet.format, bytes);
    if (values) {
      for (let i = 0, il = keys.length; i < il; i++) {
        object[keys[i]] = values[i];
      }
    }
    return object;
  }

  packet = defineCustomPacket(name, _pack, _unpack);
  packet.format = format;
  packet.keys = keys;
  return packet;
}

// Define a complex variable-length packet, with its own custom pack and
// unpack functions. This is used for packets like point updates, where we
// don't know up front how long they will be.
// FIXME: If jspack could do a streaming need this wouldn't be needed.
export function defineCustomPacket(name, pack, unpack) {
  let packet = {
    index: ++packetIndex,
    name: name,
    pack: pack,
    unpack: unpack
  };
  packets[packetIndex] = packet;
  packetsByName[packet.name] = packet;
  return packet;
}

// Get a packet object by its numeric index.
export function getPacketByIndex(index) {
  if (packets.hasOwnProperty(index)) {
    return packets[index];
  } else {
    return undefined;
  }
}

// Get a packet object by its string name.
export function getPacketByName(name) {
  if (packetsByName.hasOwnProperty(name)) {
    return packetsByName[name];
  } else {
    return undefined;
  }
}

// Byte pack multiple arguments into a string.
export function packMessage(name, values) {
  let packet = getPacketByName(name);
  if (!packet) {
    throw new Error('Invalid packet name "' + name + '"');
  }
  values.unshift(packet.index);
  let bytes = packet.pack.call(packet, values);
  let message = '';
  for (let i = 0, il = bytes.length; i < il; i++) {
    message += String.fromCharCode(bytes[i]);
  }
  return message;
}

// Unpack a string into an object.
export function unpackMessage(message) {
  let bytes = [];
  for (let i = 0, il = message.length; i < il; i++) {
    bytes[i] = message.charCodeAt(i);
  }
  let values = jspack.Unpack('B', bytes);
  if (!values) {
    return undefined;
  }
  let packet = getPacketByIndex(values[0]);
  if (packet) {
    return packet.unpack(bytes);
  }
  return undefined;
}

// Server telling the client what their player id is.
definePacket('ack', 'BLL', [
  'packetIndex',
  'playerId',
  'version'
]);

// Server telling the client what their ship's entity id is.
definePacket('ackShip', 'BLL', [
  'packetIndex',
  'playerId',
  'entityId'
]);

// A new player has connected to the server.
definePacket('connected', 'BL', [
  'packetIndex',
  'playerId'
]);

// A player has disconnected from the server.
definePacket('disconnected', 'BL', [
  'packetIndex',
  'playerId'
]);

// Client telling the server that they are pressing a button.
definePacket('buttonDown', 'BB', [
  'packetIndex',
  'button'
]);

// Client telling the server that they have released a button.
definePacket('buttonUp', 'BB', [
  'packetIndex',
  'button'
]);

// Server to client update for an existing entity.
definePacket('entity', 'BLdddddd', [
  'packetIndex',
  'entityId',
  'x', 'y',
  'vx', 'vy',
  'angle',
  'scale'
]);

// Server telling client that an existing entity has died.
definePacket('entityDied', 'BL', [
  'packetIndex',
  'entityId'
]);

// Server telling client what the polygonal shape is for an entity.
defineCustomPacket('entityPoints', function _packPoints(values) {
  let format = 'BLL';
  let i = values.length - 3;
  while (i--) {
    format += 'd';
  }
  return jspack.Pack(format, values);
}, function _unpackPoints(bytes) {
  let format = 'BLL';
  let values = jspack.Unpack(format, bytes);
  if (!values) {
    return undefined;
  }
  let object = {
    packet: this,
    packetIndex: values[0],
    entityId: values[1],
    points: null,
    pointsLength: values[2]
  };
  let i = object.pointsLength;
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
defineCustomPacket('entitySpawned', function _packSpawned(values) {
  let format = 'BBLddddddL';
  let i = values.length - 10;
  while (i--) {
    format += 'd';
  }
  return jspack.Pack(format, values);
}, function _unpackSpawned(bytes) {
  let format = 'BBLddddddL';
  let values = jspack.Unpack(format, bytes);
  if (!values) {
    return undefined;
  }
  let object = {
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
  let i = object.pointsLength;
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
