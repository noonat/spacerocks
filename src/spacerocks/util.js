/* jshint node: true */
'use strict';

exports.angleToRadians = Math.PI / 180;

// Inherit one prototype from another. It uses the native Object.create(),
// if it exists. Otherwise, it hacks it.
exports.inherits = function(ctor, superCtor) {
  if (Object.create) {
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false
      }
    });
  } else {
    var protoCtor = function() {};
    protoCtor.prototype = superCtor.prototype;
    ctor.prototype = new protoCtor();
    ctor.prototype.constructor = ctor;
  }
  return ctor;
};
