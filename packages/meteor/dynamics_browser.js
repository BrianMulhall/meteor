// Simple implementation of dynamic scoping, for use in browsers

let nextSlot = 0;
let currentValues = [];

Meteor.EnvironmentVariable = function () {
  this.slot = nextSlot++;
};


Meteor.EnvironmentVariable.prototype.get = function () {
  return currentValues[this.slot];
};

Meteor.EnvironmentVariable.prototype.getOrNullIfOutsideFiber = function () {
  return this.get();
};

Meteor.EnvironmentVariable.prototype.withValue = function (value, func) {
  const saved = currentValues[this.slot];
  let ret;
  try {
    currentValues[this.slot] = value;
    ret = func();
  } finally {
    currentValues[this.slot] = saved;
  }
  return ret;
};

Meteor.bindEnvironment = function (func, onException, _this) {
  // needed in order to be able to create closures inside func and
  // have the closed variables not change back to their original
  // values
  var boundValues = currentValues.slice();

  if (!onException || typeof(onException) === 'string') {
    var description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug(
        "Exception in " + description + ":",
        error
      );
    };
  }

  return function (/* arguments */) {
    var savedValues = currentValues;
    try {
      currentValues = boundValues;
      var ret = func.apply(_this, arguments);
    } catch (e) {
      // note: callback-hook currently relies on the fact that if onException
      // throws in the browser, the wrapped call throws.
      onException(e);
    } finally {
      currentValues = savedValues;
    }
    return ret;
  };
};

Meteor._nodeCodeMustBeInFiber = function () {
  // no-op on browser
};
