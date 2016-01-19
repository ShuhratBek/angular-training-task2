'use strict';

/**
 * Scope constructor
 */
function Scope() {
  this.$$phase = null;// should control functions apply and digest, and need to clear after functions completed
  this.$$asyncQueue = [];// actually should have set of expressions, that have to call during digest’s call; should be independent from digest’s calls from someone, or any changes, should call digest itself as soon as possible in the case of no functions (apply, digest) in progress
  this.$$watchers = [];
  this.$$postDigestQueue = [];
}

/**
 * $apply
 * should get as input any expression for execute as optional parameter
 */
Scope.prototype.$apply = function(expr) {
  try {
    this.$beginPhase("$apply");
    return this.$eval(expr);
  } finally {
    this.$clearPhase();
    this.$digest();
  }
};

/**
 * $eval
 */
Scope.prototype.$eval = function(expr, locals) {
  return expr(this, locals);
};

/**
 * $evalAsync
 */
Scope.prototype.$evalAsync = function(expr) {
  var self = this;
  if (!self.$$phase && !self.$$asyncQueue.length) {
    setTimeout(function() {
      if (self.$$asyncQueue.length) {
        self.$digest();
      }
    }, 0);
  }
  self.$$asyncQueue.push({scope: self, expression: expr});
};

/**
 * $beginPhase
 */
Scope.prototype.$beginPhase = function(phase) {
  if (this.$$phase) {
    throw this.$$phase + ' already in progress...';
  }
  this.$$phase = phase;
};

/**
 * $clearPhase
 */
Scope.prototype.$clearPhase = function() {
  this.$$phase = null;
};

/**
 * $watch
 * should get as input watchFn as mandatory parameter and listenerFn and valueEq as optional parameters
 * registers a listener callback to be executed whenever the watchExpression changes
 */
Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  var self = this;
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() { },
    valueEq: !!valueEq
  };
  self.$$watchers.push(watcher);
  return function() {
    var index = self.$$watchers.indexOf(watcher);
    if (index >= 0) {
      self.$$watchers.splice(index, 1);
    }
  };
};

/**
 * $$areEqual
 */
Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
  if (valueEq) {
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue || (typeof newValue === 'number' && typeof oldValue === 'number' && isNaN(newValue) && isNaN(oldValue));
  }
};

/**
 * $digest
 * processes all of the watchers of the current scope and also async queue and post digest functionality
 * should support deep check (whatever object property we has changed or value of array)
 * should support case if listenerFn has changed scope field
 */
Scope.prototype.$digest = function(){
  var dirty,
      ttl = 10;
  this.$beginPhase("$digest");
  do {
    while (this.$$asyncQueue.length) {
      try {
        var asyncTask = this.$$asyncQueue.shift();
        this.$eval(asyncTask.expression);
      } catch (e) {
        (console.error || console.log)(e);
      }
    }
    dirty = this.$$digestOnce();
    if (dirty && !(ttl--)) {
      this.$clearPhase();
      throw "10 digest iterations reached";
    }
  } while (dirty);
  this.$clearPhase();

  while (this.$$postDigestQueue.length) {
    try {
      this.$$postDigestQueue.shift()();
    } catch (e) {
      (console.error || console.log)(e);
    }
  }
};

/**
 * $$digestOnce
 */
Scope.prototype.$$digestOnce = function() {
  var self = this,
      dirty;
  _.forEach(this.$$watchers, function(watch) {
    try {
      var newValue = watch.watchFn(self),
          oldValue = watch.last;
      if (!self.$$areEqual(newValue, oldValue, watch.valueEq)) {
        watch.listenerFn(newValue, oldValue, self);
        dirty = true;
      }
      watch.last = (watch.valueEq ? _.cloneDeep(newValue) : newValue);
    } catch (e) {
      (console.error || console.log)(e);
    }
  });
  return dirty;
};

/**
 * $$postDigest
 * set of functions, that should be processed after digest completed,
 */
Scope.prototype.$$postDigest = function(fn) {
  this.$$postDigestQueue.push(fn);
};

var sampleFunctions = {
  scope: function() {
    var scope = new Scope();
    scope.firstName = 'Shukhratbek';
    scope.lastName = 'Mamadaliev';
    console.log(scope);
  },
  watch: function() {
    var scope = new Scope();
    scope.$watch(function() {console.log('watchFn');}, function() {console.log('listener');});

    scope.$digest();
    scope.$digest();
    scope.$digest();
  },
  apply: function() {
    var scope = new Scope();
    scope.counter = 0;

    scope.$watch(
      function(scope) {
        return scope.aValue;
      },
      function(newValue, oldValue, scope) {
        scope.counter++;
      }
    );

    scope.$apply(function(scope) {
      scope.aValue = 'Hello from "outside"';
    });
    console.assert(scope.counter === 1);
  },
  eval: function(){
    var scope = new Scope();
    scope.number = 1;

    scope.$eval(function(theScope) {
      console.log('Number during $eval:', theScope.number);
    });
  },
  evalAsync: function(){
    var scope = new Scope();
    scope.asyncEvaled = false;

    scope.$watch(
      function(scope) {
        return scope.aValue;
      },
      function(newValue, oldValue, scope) {
        scope.counter++;
        scope.$evalAsync(function(scope) {
          scope.asyncEvaled = true;
        });
        console.log("Evaled inside listener: "+scope.asyncEvaled);}
      );

      scope.aValue = "test";
      scope.$digest();
      console.log("Evaled after digest: "+scope.asyncEvaled);
    },
    exception: function(){
      var scope = new Scope();
      scope.aValue = "abc";
      scope.counter = 0;

      scope.$watch(function() {
        throw "Watch fail";
      });
      scope.$watch(
        function(scope) {
          scope.$evalAsync(function(scope) {
            throw "async fail";
          });
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      console.assert(scope.counter === 1);
    },
    destroyWatch: function(){
      var scope = new Scope();
      scope.aValue = "www";
      scope.counter = 0;

      var removeWatch = scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      console.assert(scope.counter === 1);

      scope.aValue = 'cccc';
      scope.$digest();
      console.assert(scope.counter === 2);

      removeWatch();
      scope.aValue = 'vvv';
      scope.$digest();
      console.assert(scope.counter === 2);
    }
}

sampleFunctions.scope();
sampleFunctions.watch();
sampleFunctions.apply();