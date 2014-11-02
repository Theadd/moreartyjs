!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Morearty=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
var Imm = (typeof window !== "undefined" ? window.Immutable : typeof global !== "undefined" ? global.Immutable : null);
var Util = require('./Util');
var Holder = require('./util/Holder');
var ChangesDescriptor = require('./ChangesDescriptor');

/* ---------------- */
/* Private helpers. */
/* ---------------- */

var UNSET_VALUE = {};

var copyBinding, getBackingValue, setBackingValue;

copyBinding = function (binding, backingValueHolder, metaBinding, path) {
  return new Binding(
    backingValueHolder, metaBinding, path, binding._options, {
      regCountHolder: binding._regCountHolder,
      listeners: binding._listeners,
      cache: binding._cache
    }
  );
};

getBackingValue = function (binding) {
  return binding._backingValueHolder.getValue();
};

setBackingValue = function (binding, newBackingValue) {
  binding._backingValueHolder.setValue(newBackingValue);
};

var EMPTY_PATH, PATH_SEPARATOR, META_NODE, getPathElements, joinPaths, getMetaPath, getValueAtPath;

EMPTY_PATH = [];
PATH_SEPARATOR = '.';
META_NODE = '__meta__';

getPathElements = function (path) {
  return path ? path.split(PATH_SEPARATOR).map(function (s) { return isNaN(s) ? s : +s; }) : [];
};

joinPaths = function (path1, path2) {
  return path1.length === 0 ? path2 :
    (path2.length === 0 ? path1 : path1.concat(path2));
};

getMetaPath = function (subpath, key) {
  return joinPaths(subpath, [META_NODE, key]);
};

getValueAtPath = function (backingValue, path) {
  return backingValue && path.length > 0 ? backingValue.getIn(path) : backingValue;
};

var asArrayPath, asStringPath;

asArrayPath = function (path) {
  switch (typeof path) {
    case 'string':
      return getPathElements(path);
    case 'number':
      return [path];
    default:
      return Util.undefinedOrNull(path) ? [] : path;
  }
};

asStringPath = function (path) {
  switch (typeof path) {
    case 'string':
      return path;
    case 'number':
      return path.toString();
    default:
      return Util.undefinedOrNull(path) ? '' : path.join(PATH_SEPARATOR);
  }
};

var setOrUpdate, updateValue, deleteValue, clear;

setOrUpdate = function (rootValue, effectivePath, f) {
  return rootValue.updateIn(effectivePath, UNSET_VALUE, function (value) {
    return value === UNSET_VALUE ? f() : f(value);
  });
};

updateValue = function (binding, subpath, f) {
  var effectivePath = joinPaths(binding._path, subpath);
  var newBackingValue = setOrUpdate(getBackingValue(binding), effectivePath, f);
  setBackingValue(binding, newBackingValue);
  return effectivePath;
};

deleteValue = function (binding, subpath) {
  var effectivePath = joinPaths(binding._path, subpath);
  var backingValue = getBackingValue(binding);

  var len = effectivePath.length;
  switch (len) {
    case 0:
      throw new Error('Cannot delete root value');
    default:
      var pathTo = effectivePath.slice(0, len - 1);
      if (backingValue.has(pathTo[0]) || len === 1) {
        var newBackingValue = backingValue.updateIn(pathTo, function (coll) {
          var key = effectivePath[len - 1];
          if (coll instanceof Imm.List) {
            return coll.splice(key, 1);
          } else {
            return coll && coll.delete(key);
          }
        });

        setBackingValue(binding, newBackingValue);
      }

      return pathTo;
  }
};

clear = function (value) {
  return value instanceof Imm.Iterable ? value.clear() : null;
};

var notifySamePathListeners, notifyGlobalListeners, startsWith, isPathAffected, notifyNonGlobalListeners, notifyAllListeners;

notifySamePathListeners =
  function (binding, samePathListeners, listenerPath, path, previousBackingValue, previousMeta) {
    if (previousBackingValue || previousMeta) {
      Util.getPropertyValues(samePathListeners).forEach(function (listenerDescriptor) {
        if (!listenerDescriptor.disabled) {
          listenerDescriptor.cb(
            new ChangesDescriptor(
              binding, path, asArrayPath(listenerPath), previousBackingValue, previousMeta
            )
          );
        }
      });
    }
  };

notifyGlobalListeners =
  function (binding, path, previousBackingValue, previousMeta) {
    var listeners = binding._listeners;
    var globalListeners = listeners[''];
    if (globalListeners) {
      notifySamePathListeners(
        binding, globalListeners, EMPTY_PATH, path, previousBackingValue, previousMeta);
    }
  };

startsWith = function (s1, s2) {
  return s1.indexOf(s2) === 0;
};

isPathAffected = function (listenerPath, changedPath) {
  return startsWith(changedPath, listenerPath) || startsWith(listenerPath, changedPath);
};

notifyNonGlobalListeners = function (binding, path, previousBackingValue, previousMeta) {
  var listeners = binding._listeners;
  Object.keys(listeners).filter(Util.identity).forEach(function (listenerPath) {
    if (isPathAffected(listenerPath, asStringPath(path))) {
      notifySamePathListeners(
        binding, listeners[listenerPath], listenerPath, path, previousBackingValue, previousMeta);
    }
  });
};

notifyAllListeners = function (binding, path, previousBackingValue, previousMeta) {
  notifyNonGlobalListeners(binding, path, previousBackingValue, previousMeta);
  notifyGlobalListeners(binding, path, previousBackingValue, previousMeta);
};

var findSamePathListeners, setListenerDisabled;

findSamePathListeners = function (binding, listenerId) {
  return Util.find(
    Util.getPropertyValues(binding._listeners),
    function (samePathListeners) { return !!samePathListeners[listenerId]; }
  );
};

setListenerDisabled = function (binding, listenerId, disabled) {
  var samePathListeners = findSamePathListeners(binding, listenerId);
  if (samePathListeners) {
    samePathListeners[listenerId].disabled = disabled;
  }
};

/** Binding constructor.
 * @param {Holder} backingValueHolder backing value holder
 * @param {Binding} metaBinding meta binding
 * @param {String[]} [path] binding path, empty array if omitted
 * @param {Object} [options] binding options object
 * @param {Object} [internals] binding internals:
 * <ul>
 *   <li>regCountHolder - registration count holder;</li>
 *   <li>listeners - change listeners;</li>
 *   <li>cache - shared bindings cache.</li>
 * </ul>
 * @public
 * @class Binding
 * @classdesc Wraps immutable collection. Provides convenient read-write access to nested values.
 * Allows to create sub-bindings (or views) narrowed to a subpath and sharing the same backing value.
 * Changes to these bindings are mutually visible.
 * <p>Terminology:
 * <ul>
 *   <li>
 *     (sub)path - path to a value within nested associative data structure, example: 'path.t.0.some.value';
 *   </li>
 *   <li>
 *     backing value - value shared by all bindings created using [sub]{@link Binding#sub} method.
 *   </li>
 * </ul>
 * <p>Features:
 * <ul>
 *   <li>can create sub-bindings sharing same backing value. Sub-binding can only modify values down its subpath;</li>
 *   <li>allows to conveniently modify nested values: assign, update with a function, remove, and so on;</li>
 *   <li>can attach change listeners to a specific subpath;</li>
 *   <li>can perform multiple changes atomically in respect of listener notification.</li>
 * </ul>
 * @see Binding.init */
var Binding = function (
  backingValueHolder, metaBinding, path, options, internals) {

  /** @private */
  this._backingValueHolder = backingValueHolder;
  /** @private */
  this._metaBinding = metaBinding;
  /** @private */
  this._path = path || EMPTY_PATH;

  /** @private */
  this._options = options || {};

  var effectiveInternals = internals || {};

  /** @private */
  this._regCountHolder = effectiveInternals.regCountHolder || Holder.init(0);
  /** @private */
  this._listeners = effectiveInternals.listeners || {};
  /** @private */
  this._cache = effectiveInternals.cache || {};
};

/* --------------- */
/* Static helpers. */
/* --------------- */

/** Create new binding with empty listeners set.
 * @param {Holder|Immutable.Map} backingValue backing value
 * @param {Binding} [metaBinding] meta binding
 * @param {Object} [options] binding options object, supported options are:
 * <ul>
 *   <li>autoMeta - auto create meta binding on first access if not set, true by default.</li>
 * </ul>
 * @return {Binding} fresh binding instance */
Binding.init = function (backingValue, metaBinding, options) {
  var args = Util.resolveArgs(
    arguments, 'backingValue', function (x) { return x instanceof Binding ? 'metaBinding' : null; }, '?options'
  );

  var binding = new Binding(
    backingValue instanceof Holder ? backingValue: Holder.init(backingValue),
    args.metaBinding,
    EMPTY_PATH,
    args.options
  );

  if (args.metaBinding) {
    args.metaBinding.addGlobalListener(function (changes) {
      if (changes.isValueChanged()) {
        var metaNodePath = changes.getPath();
        var changedPath = metaNodePath.slice(0, metaNodePath.length - 1);
        notifyAllListeners(binding, changedPath, null, changes.getPreviousValue());
      }
    });
  }

  return binding;
};

/** Convert string path to array path.
 * @param {String} pathAsString path as string
 * @return {Array} path as an array */
Binding.asArrayPath = function (pathAsString) {
  return asArrayPath(pathAsString);
};

/** Convert array path to string path.
 * @param {String[]} pathAsAnArray path as an array
 * @return {String} path as a string */
Binding.asStringPath = function (pathAsAnArray) {
  return asStringPath(pathAsAnArray);
};

/** Meta node name.
 * @type {String} */
Binding.META_NODE = META_NODE;

Binding.prototype = Object.freeze( /** @lends Binding.prototype */ {

  /** Get binding path.
   * @returns {Array} binding path */
  getPath: function () {
    return this._path;
  },

  /** Update backing value.
   * @param {Immutable.Map} newBackingValue new backing value, unchanged if null or undefined
   * @return {Binding} new binding instance, original is unaffected */
  withBackingValue: function (newBackingValue) {
    var backingValueHolder =
      Util.undefinedOrNull(newBackingValue) ? this._backingValueHolder : Holder.init(newBackingValue);
    return copyBinding(this, backingValueHolder, this._metaBinding, this._path);
  },

  /** Check if binding value is changed in alternative backing value.
   * @param {Immutable.Map} alternativeBackingValue alternative backing value
   * @param {Function} [compare] alternative compare function, does reference equality check if omitted */
  isChanged: function (alternativeBackingValue, compare) {
    var value = this.get();
    var alternativeValue = alternativeBackingValue.getIn(this._path);
    return compare ? compare(value, alternativeValue) : value !== alternativeValue;
  },

  /** Check if this and supplied binding are relatives (i.e. share same backing value).
   * @param {Binding} otherBinding potential relative
   * @return {Boolean} */
  isRelative: function (otherBinding) {
    return this._backingValueHolder === otherBinding._backingValueHolder;
  },

  /** Get binding's meta binding.
   * @returns {Binding} meta binding or undefined */
  meta: function () {
    if (!this._metaBinding && this._options.autoMeta !== false) {
      this._metaBinding = Binding.init(Imm.Map());
    }

    return this._metaBinding && this._metaBinding.sub(META_NODE);
  },

  /** Get binding value.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @return {*} value at path or null */
  get: function (subpath) {
    return getValueAtPath(getBackingValue(this), joinPaths(this._path, asArrayPath(subpath)));
  },

  /** Convert to JS representation.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @return {*} JS representation of data at subpath */
  toJS: function (subpath) {
    var value = this.sub(subpath).get();
    return value instanceof Imm.Iterable ? value.toJS() : value;
  },

  /** Bind to subpath. Both bindings share the same backing value. Changes are mutually visible.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @return {Binding} new binding instance, original is unaffected */
  sub: function (subpath) {
    var pathAsArray = asArrayPath(subpath);
    var absolutePath = joinPaths(this._path, pathAsArray);
    if (absolutePath.length > 0) {
      var absolutePathAsString = asStringPath(absolutePath);
      var cached = this._cache[absolutePathAsString];

      if (cached) {
        return cached;
      } else {
        var metaBinding = this._metaBinding && this._metaBinding.sub(pathAsArray);
        var subBinding = copyBinding(this, this._backingValueHolder, metaBinding, absolutePath);
        this._cache[absolutePathAsString] = subBinding;
        return subBinding;
      }
    } else {
      return this;
    }
  },

  /** Update binding value.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Function} f f function
   * @return {Binding} this binding */
  update: function (subpath, f) {
    var args = Util.resolveArgs(arguments, '?subpath', 'f');
    var previousBackingValue = getBackingValue(this);
    var affectedPath = updateValue(this, asArrayPath(args.subpath), args.f);
    notifyAllListeners(this, affectedPath, previousBackingValue, null);
    return this;
  },

  /** Set binding value.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {*} newValue new value
   * @return {Binding} this binding */
  set: function (subpath, newValue) {
    var args = Util.resolveArgs(arguments, '?subpath', 'newValue');
    return this.update(args.subpath, Util.constantly(args.newValue));
  },

  /** Delete value.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @return {Binding} this binding */
  delete: function (subpath) {
    var previousBackingValue = getBackingValue(this);
    var affectedPath = deleteValue(this, asArrayPath(subpath));
    notifyAllListeners(this, affectedPath, previousBackingValue, null);
    return this;
  },

  /** Deep merge values.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Boolean} [preserve] preserve existing values when merging, false by default
   * @param {*} newValue new value
   * @return {Binding} this binding */
  merge: function (subpath, preserve, newValue) {
    var args = Util.resolveArgs(
      arguments,
      function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; },
      '?preserve',
      'newValue'
    );
    return this.update(args.subpath, function (value) {
      var effectiveNewValue = args.newValue;
      if (Util.undefinedOrNull(value)) {
        return effectiveNewValue;
      } else {
        if (value instanceof Imm.Iterable && effectiveNewValue instanceof Imm.Iterable) {
          return args.preserve ? effectiveNewValue.mergeDeep(value) : value.mergeDeep(effectiveNewValue);
        } else {
          return args.preserve ? value : effectiveNewValue;
        }
      }
    });
  },

  /** Clear nested collection. Does '.clear()' on Immutable values, nullifies otherwise.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @return {Binding} this binding */
  clear: function (subpath) {
    var subpathAsArray = asArrayPath(subpath);
    if (!Util.undefinedOrNull(this.get(subpathAsArray))) this.update(subpathAsArray, clear);
    return this;
  },

  /** Add change listener.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Function} cb function receiving changes descriptor
   * @return {String} unique id which should be used to un-register the listener
   * @see ChangesDescriptor */
  addListener: function (subpath, cb) {
    var args = Util.resolveArgs(
      arguments, function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; }, 'cb'
    );

    var listenerId = 'reg' + this._regCountHolder.updateValue(function (count) { return count + 1; });
    var pathAsString = asStringPath(joinPaths(this._path, asArrayPath(args.subpath || '')));
    var samePathListeners = this._listeners[pathAsString];
    var listenerDescriptor = { cb: args.cb, disabled: false };
    if (samePathListeners) {
      samePathListeners[listenerId] = listenerDescriptor;
    } else {
      var listeners = {};
      listeners[listenerId] = listenerDescriptor;
      this._listeners[pathAsString] = listeners;
    }
    return listenerId;
  },

  /** Add change listener listening from the root.
   * @param {Function} cb function receiving changes descriptor
   * @return {String} unique id which should be used to un-register the listener
   * @see ChangesDescriptor */
  addGlobalListener: function (cb) {
    return this.addListener(EMPTY_PATH, cb);
  },

  /** Enable listener.
   * @param {String} listenerId listener id
   * @return {Binding} this binding */
  enableListener: function (listenerId) {
    setListenerDisabled(this, listenerId, false);
    return this;
  },

  /** Disable listener.
   * @param {String} listenerId listener id
   * @return {Binding} this binding */
  disableListener: function (listenerId) {
    setListenerDisabled(this, listenerId, true);
    return this;
  },

  /** Execute function with listener temporarily disabled. Correctly handles functions returning promises.
   * @param {String} listenerId listener id
   * @param {Function} f function to execute
   * @return {Binding} this binding */
  withDisabledListener: function (listenerId, f) {
    var samePathListeners = findSamePathListeners(this, listenerId);
    if (samePathListeners) {
      var descriptor = samePathListeners[listenerId];
      descriptor.disabled = true;
      Util.afterComplete(f, function () { descriptor.disabled = false; });
    } else {
      f();
    }
    return this;
  },

  /** Un-register the listener.
   * @param {String} listenerId listener id
   * @return {Boolean} true if listener removed successfully, false otherwise */
  removeListener: function (listenerId) {
    var samePathListeners = findSamePathListeners(this, listenerId);
    return samePathListeners ? delete samePathListeners[listenerId] : false;
  },

  /** Create transaction context.
   * @return {TransactionContext} transaction context */
  atomically: function () {
    return new TransactionContext(this);
  }

});

/** Transaction context constructor.
 * @param {Binding} binding binding
 * @param {Function[]} [updates] queued updates
 * @param {Function[]} [removals] queued removals
 * @public
 * @class TransactionContext
 * @classdesc Transaction context. */
var TransactionContext = function (binding, updates, removals) {
  /** @private */
  this._binding = binding;
  /** @private */
  this._updates = updates || [];
  /** @private */
  this._deletions = removals || [];
  /** @private */
  this._committed = false;

  /** @private */
  this._hasChanges = false;
  /** @private */
  this._hasMetaChanges = false;
};

TransactionContext.prototype = (function () {

  var registerUpdate, hasChanges;

  registerUpdate = function (self, binding) {
    if (!self._hasChanges) {
      self._hasChanges = binding.isRelative(self._binding);
    }

    if (!self._hasMetaChanges) {
      var metaBinding = self._binding.meta();
      if (metaBinding) {
        self._hasMetaChanges = binding.isRelative(metaBinding);
      }
    }
  };

  hasChanges = function (self) {
    return self._hasChanges || self._hasMetaChanges;
  };

  var addUpdate, addDeletion, areSiblings, filterRedundantPaths, commitSilently;

  addUpdate = function (self, binding, update, subpath) {
    registerUpdate(self, binding);
    self._updates.push({ binding: binding, update: update, subpath: subpath });
  };

  addDeletion = function (self, binding, subpath) {
    registerUpdate(self, binding);
    self._deletions.push({ binding: binding, subpath: subpath });
  };

  areSiblings = function (path1, path2) {
    var path1Length = path1.length, path2Length = path2.length;
    return path1Length === path2Length && (
      path1Length === 1 || path1[path1Length - 2] === path2[path1Length - 2]
      );
  };

  filterRedundantPaths = function (affectedPaths) {
    if (affectedPaths.length < 2) {
      return affectedPaths;
    } else {
      var sortedPaths = affectedPaths.sort();
      var previousPath = sortedPaths[0], previousPathAsString = asStringPath(previousPath);
      var result = [previousPath];
      for (var i = 1; i < sortedPaths.length; i++) {
        var currentPath = sortedPaths[i], currentPathAsString = asStringPath(currentPath);
        if (!startsWith(currentPathAsString, previousPathAsString)) {
          if (areSiblings(currentPath, previousPath)) {
            var commonParentPath = currentPath.slice(0, currentPath.length - 1);
            result.pop();
            result.push(commonParentPath);
            previousPath = commonParentPath;
            previousPathAsString = asStringPath(commonParentPath);
          } else {
            result.push(currentPath);
            previousPath = currentPath;
            previousPathAsString = currentPathAsString;
          }
        }
      }
      return result;
    }
  };

  commitSilently = function (self) {
    if (!self._committed) {
      var updatedPaths = self._updates.map(function (o) { return updateValue(o.binding, o.subpath, o.update); });
      var removedPaths = self._deletions.map(function (o) { return deleteValue(o.binding, o.subpath); });
      self._committed = true;
      return joinPaths(updatedPaths, removedPaths);
    } else {
      throw new Error('Transaction already committed');
    }
  };

  return Object.freeze( /** @lends TransactionContext.prototype */ {

    /** Update binding value.
     * @param {Binding} [binding] binding to apply update to
     * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
     * @param {Function} f update function
     * @return {TransactionContext} updated transaction */
    update: function (binding, subpath, f) {
      var args = Util.resolveArgs(
        arguments,
        function (x) { return x instanceof Binding ? 'binding' : null; }, '?subpath', 'f'
      );
      addUpdate(this, args.binding || this._binding, args.f, asArrayPath(args.subpath));
      return this;
    },

    /** Set binding value.
     * @param {Binding} [binding] binding to apply update to
     * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
     * @param {*} newValue new value
     * @return {TransactionContext} updated transaction context */
    set: function (binding, subpath, newValue) {
      var args = Util.resolveArgs(
        arguments,
        function (x) { return x instanceof Binding ? 'binding' : null; }, '?subpath', 'newValue'
      );
      return this.update(args.binding, args.subpath, Util.constantly(args.newValue));
    },

    /** Remove value.
     * @param {Binding} [binding] binding to apply update to
     * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
     * @return {TransactionContext} updated transaction context */
    delete: function (binding, subpath) {
      var args = Util.resolveArgs(
        arguments,
        function (x) { return x instanceof Binding ? 'binding' : null; }, '?subpath'
      );
      addDeletion(this, args.binding || this._binding, asArrayPath(args.subpath));
      return this;
    },

    /** Deep merge values.
     * @param {Binding} [binding] binding to apply update to
     * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
     * @param {Boolean} [preserve] preserve existing values when merging, false by default
     * @param {*} newValue new value
     * @return {TransactionContext} updated transaction context */
    merge: function (binding, subpath, preserve, newValue) {
      var args = Util.resolveArgs(
        arguments,
        function (x) { return x instanceof Binding ? 'binding' : null; },
        function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; },
        function (x) { return typeof x === 'boolean' ? 'preserve' : null; },
        'newValue'
      );
      return this.update(args.binding, args.subpath, function (value) {
        var effectiveNewValue = args.newValue;
        if (Util.undefinedOrNull(value)) {
          return effectiveNewValue;
        } else {
          if (value instanceof Imm.Iterable && effectiveNewValue instanceof Imm.Iterable) {
            return args.preserve ? effectiveNewValue.mergeDeep(value) : value.mergeDeep(effectiveNewValue);
          } else {
            return args.preserve ? value : effectiveNewValue;
          }
        }
      });
    },

    /** Clear collection or nullify nested value.
     * @param {Binding} [binding] binding to apply update to
     * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
     * @return {TransactionContext} updated transaction context */
    clear: function (binding, subpath) {
      var args = Util.resolveArgs(
        arguments,
        function (x) { return x instanceof Binding ? 'binding' : null; }, '?subpath'
      );
      addUpdate(
        this,
        args.binding || this._binding,
        function (value) { return clear(value); },
        asArrayPath(args.subpath)
      );
      return this;
    },

    /** Commit transaction (write changes and notify listeners).
     * @param {Object} [options] options object, supported options are:
     * <ul>
     *   <li>notify - should listeners be notified, true by default, set to false to disable notification.</li>
     * </ul>
     * @return {String[]} array of affected paths */
    commit: function (options) {
      if (hasChanges(this)) {
        var effectiveOptions = options || {};
        var binding = this._binding;

        var previousBackingValue = null, previousMetaValue = null;
        if (effectiveOptions.notify !== false) {
          if (this._hasChanges) previousBackingValue = getBackingValue(binding);
          if (this._hasMetaChanges) previousMetaValue = getBackingValue(binding.meta());
        }

        var affectedPaths = commitSilently(this);

        if (effectiveOptions.notify !== false) {
          var filteredPaths = filterRedundantPaths(affectedPaths);
          filteredPaths.forEach(function (path) {
            notifyNonGlobalListeners(binding, path, previousBackingValue, previousMetaValue);
          });
          notifyGlobalListeners(binding, filteredPaths[0], previousBackingValue, previousMetaValue);
        }

        return affectedPaths;

      } else {
        return [];
      }
    }

  });
})();

module.exports = Binding;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./ChangesDescriptor":2,"./Util":6,"./util/Holder":8}],2:[function(require,module,exports){
/** Changes descriptor constructor.
 * @param {Binding} binding binding
 * @param {Array} path absolute changed path
 * @param {Array} listenerPath absolute listener path
 * @param {Immutable.Map} previousValue previous binding backing value
 * @param {Immutable.Map} previousMeta previous meta binding backing value
 * @public
 * @class ChangesDescriptor
 * @classdesc Encapsulates binding changes for binding listeners. */
var ChangesDescriptor =
  function (binding, path, listenerPath, previousValue, previousMeta) {
    /** @private */
    this._binding = binding;
    /** @private */
    this._path = path;
    /** @private */
    this._listenerPath = listenerPath;
    /** @private */
    this._previousValue = previousValue;
    /** @private */
    this._previousMeta = previousMeta;
  };

ChangesDescriptor.prototype = Object.freeze( /** @lends ChangesDescriptor.prototype */ {
  /** Get changed path relative to binding's path listener was installed on.
   * @return {Array} changed path */
  getPath: function () {
    var listenerPathLen = this._listenerPath.length;
    return listenerPathLen === this._path.length ? [] : this._path.slice(listenerPathLen);
  },

  /** Check if binding's value was changed.
   * @returns {Boolean} */
  isValueChanged: function () {
    return !!this._previousValue &&
      this._binding.get(this._listenerPath) !== this._previousValue.getIn(this._listenerPath);
  },

  /** Check if meta binding's value was changed.
   * @returns {Boolean} */
  isMetaChanged: function () {
    return !!this._previousMeta;
  },

  /** Get previous value at listening path.
   * @returns {*} previous value at listening path or null if not changed */
  getPreviousValue: function () {
    return this._previousValue && this._previousValue.getIn(this._listenerPath);
  },

  /** Get previous meta at listening path.
   * @returns {*} */
  getPreviousMeta: function () {
    return this._previousMeta && this._previousMeta.getIn(this._listenerPath);
  }
});

module.exports = ChangesDescriptor;

},{}],3:[function(require,module,exports){
(function (global){
var Util  = require('./Util');
var React = (typeof window !== "undefined" ? window.React : typeof global !== "undefined" ? global.React : null);

var _ = (function() {
  if (React) return React.DOM;
  else {
    throw new Error('Morearty: global variable React not found');
  }
})();

var wrapComponent = function (comp, displayName) {
  return React.createClass({

    displayName: displayName,

    getInitialState: function () {
      return { value: this.props.value };
    },

    onChange: function (event) {
      var handler = this.props.onChange;
      if (handler) {
        handler(event);
        this.setState({ value: event.target.value });
      }
    },

    componentWillReceiveProps: function (newProps) {
      this.setState({ value: newProps.value });
    },

    render: function () {
      var props = Util.assign({}, this.props, {
        value: this.state.value,
        onChange: this.onChange,
        children: this.props.children
      });
      return comp(props);
    }

  });
};

/**
 * @name DOM
 * @namespace
 * @classdesc DOM module. Exposes requestAnimationFrame-friendly wrappers around input, textarea, and option.
 */
var DOM = {

  input: wrapComponent(_.input, 'input'),

  textarea: wrapComponent(_.textarea, 'textarea'),

  option: wrapComponent(_.option, 'option')

};

module.exports = DOM;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./Util":6}],4:[function(require,module,exports){
(function (global){
var Imm = (typeof window !== "undefined" ? window.Immutable : typeof global !== "undefined" ? global.Immutable : null);
var Binding = require('./Binding');

var getHistoryBinding, initHistory, clearHistory, destroyHistory, listenForChanges, revertToStep, revert;

getHistoryBinding = function (binding) {
  return binding.meta().sub('history');
};

initHistory = function (historyBinding) {
  historyBinding.set(Imm.fromJS({ listenerId: null, undo: [], redo: [] }));
};

clearHistory = function (historyBinding) {
  var listenerId = historyBinding.get('listenerId');
  historyBinding.withDisabledListener(listenerId, function () {
    historyBinding.atomically()
      .set('undo', Imm.List.of())
      .set('redo', Imm.List.of())
      .commit();
  });
};

destroyHistory = function (binding, notify) {
  var historyBinding = getHistoryBinding(binding);
  var listenerId = historyBinding.get('listenerId');
  binding.removeListener(listenerId);
  historyBinding.atomically().set(null).commit({ notify: notify });
};

listenForChanges = function (binding, historyBinding) {
  var listenerId = binding.addListener([], function (changes) {
    historyBinding.atomically().update(function (history) {
      var path = changes.getPath();
      var previousValue = changes.getPreviousValue(), newValue = binding.get();
      return history
        .update('undo', function (undo) {
          var pathAsArray = Binding.asArrayPath(path);
          return undo && undo.unshift(Imm.Map({
            newValue: pathAsArray.length ? newValue.getIn(pathAsArray) : newValue,
            oldValue: pathAsArray.length ? previousValue.getIn(pathAsArray) : previousValue,
            path: path
          }));
        })
        .set('redo', Imm.List.of());
    }).commit({ notify: false });
  });

  historyBinding.atomically().set('listenerId', listenerId).commit({ notify: false });
};

revertToStep = function (path, value, listenerId, binding) {
  binding.withDisabledListener(listenerId, function () {
    binding.set(path, value);
  });
};

revert = function (binding, fromBinding, toBinding, listenerId, valueProperty) {
  var from = fromBinding.get();
  if (from.count() > 0) {
    var step = from.get(0);

    fromBinding.atomically()
      .delete(0)
      .update(toBinding, function (to) {
        return to.unshift(step);
      })
      .commit({ notify: false });

    revertToStep(step.get('path'), step.get(valueProperty), listenerId, binding);
    return true;
  } else {
    return false;
  }
};


/**
 * @name History
 * @namespace
 * @classdesc Undo/redo history handling.
 */
var History = {

  /** Init history.
   * @param {Binding} binding binding
   * @memberOf History */
  init: function (binding) {
    var historyBinding = getHistoryBinding(binding);
    initHistory(historyBinding);
    listenForChanges(binding, historyBinding);
  },

  /** Clear history.
   * @param {Binding} binding binding
   * @memberOf History */
  clear: function (binding) {
    var historyBinding = getHistoryBinding(binding);
    clearHistory(historyBinding);
  },

  /** Clear history and shutdown listener.
   * @param {Binding} binding history binding
   * @param {Object} [options] options object, supported options are:
   * <ul>
   *   <li>notify - should listeners be notified, true by default, set to false to disable notification.</li>
   * </ul>
   * @memberOf History */
  destroy: function (binding, options) {
    var effectiveOptions = options || {};
    destroyHistory(binding, effectiveOptions.notify);
  },

  /** Check if history has undo information.
   * @param {Binding} binding binding
   * @returns {Boolean}
   * @memberOf History */
  hasUndo: function (binding) {
    var historyBinding = getHistoryBinding(binding);
    var undo = historyBinding.get('undo');
    return !!undo && undo.count() > 0;
  },

  /** Check if history has redo information.
   * @param {Binding} binding binding
   * @returns {Boolean}
   * @memberOf History */
  hasRedo: function (binding) {
    var historyBinding = getHistoryBinding(binding);
    var redo = historyBinding.get('redo');
    return !!redo && redo.count() > 0;
  },

  /** Revert to previous state.
   * @param {Binding} binding binding
   * @returns {Boolean} true, if binding has undo information
   * @memberOf History */
  undo: function (binding) {
    var historyBinding = getHistoryBinding(binding);
    var listenerId = historyBinding.get('listenerId');
    var undoBinding = historyBinding.sub('undo');
    var redoBinding = historyBinding.sub('redo');
    return revert(binding, undoBinding, redoBinding, listenerId, 'oldValue');
  },

  /** Revert to next state.
   * @param {Binding} binding binding
   * @returns {Boolean} true, if binding has redo information
   * @memberOf History */
  redo: function (binding) {
    var historyBinding = getHistoryBinding(binding);
    var listenerId = historyBinding.get('listenerId');
    var undoBinding = historyBinding.sub('undo');
    var redoBinding = historyBinding.sub('redo');
    return revert(binding, redoBinding, undoBinding, listenerId, 'newValue');
  }

};

module.exports = History;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./Binding":1}],5:[function(require,module,exports){
(function (global){
/**
 * @name Morearty
 * @namespace
 * @classdesc Morearty main module. Exposes [createContext]{@link Morearty.createContext} function.
 */
var Imm      = (typeof window !== "undefined" ? window.Immutable : typeof global !== "undefined" ? global.Immutable : null);
var Util     = require('./Util');
var Binding  = require('./Binding');
var History  = require('./History');
var Callback = require('./util/Callback');
var DOM      = require('./DOM');

var MERGE_STRATEGY = Object.freeze({
  OVERWRITE: 'overwrite',
  OVERWRITE_EMPTY: 'overwrite-empty',
  MERGE_PRESERVE: 'merge-preserve',
  MERGE_REPLACE: 'merge-replace'
});

var getBinding, bindingChanged, stateChanged;

getBinding = function (context, comp, key) {
  if (context) {
    var binding = comp.props[context._configuration.bindingPropertyName];
    return key ? binding[key] : binding;
  } else {
    throw new Error('Context is missing.');
  }
};

bindingChanged = function (binding, context) {
  return (context._stateChanged && binding.isChanged(context._previousState)) ||
    (context._metaChanged && context._metaBinding.sub(binding.getPath()).isChanged(context._previousMetaState));
};

stateChanged = function (context, state) {
  if (state instanceof Binding) {
    return bindingChanged(state, context);
  } else {
    var bindings = Util.getPropertyValues(state);
    return !!Util.find(bindings, function (binding) {
      return binding && bindingChanged(binding, context);
    });
  }
};

var merge = function (mergeStrategy, defaultState, stateBinding) {
  var tx = stateBinding.atomically();

  if (typeof mergeStrategy === 'function') {
    tx = tx.update(function (currentState) {
      return mergeStrategy(currentState, defaultState);
    });
  } else {
    switch (mergeStrategy) {
      case MERGE_STRATEGY.OVERWRITE:
        tx = tx.set(defaultState);
        break;
      case MERGE_STRATEGY.OVERWRITE_EMPTY:
        tx = tx.update(function (currentState) {
          var empty = Util.undefinedOrNull(currentState) ||
            (currentState instanceof Imm.Iterable && currentState.count() === 0);
          return empty ? defaultState : currentState;
        });
        break;
      case MERGE_STRATEGY.MERGE_PRESERVE:
        tx = tx.merge(true, defaultState);
        break;
      case MERGE_STRATEGY.MERGE_REPLACE:
        tx = tx.merge(false, defaultState);
        break;
      default:
        throw new Error('Invalid merge strategy: ' + mergeStrategy);
    }
  }

  tx.commit({ notify: false });
};

/** Morearty context constructor.
 * @param {Immutable.Map} initialState initial state
 * @param {Immutable.Map} initialMetaState initial meta-state
 * @param {Object} configuration configuration
 * @public
 * @class Context
 * @classdesc Represents Morearty context.
 * <p>Exposed modules:
 * <ul>
 *   <li>[Util]{@link Util};</li>
 *   <li>[Binding]{@link Binding};</li>
 *   <li>[History]{@link History};</li>
 *   <li>[Callback]{@link Callback};</li>
 *   <li>[DOM]{@link DOM}.</li>
 * </ul> */
var Context = function (initialState, initialMetaState, configuration) {
  /** @private */
  this._initialMetaState = initialMetaState;
  /** @private */
  this._previousMetaState = null;
  /** @private */
  this._metaBinding = Binding.init(initialMetaState);
  /** @private */
  this._metaChanged = false;

  /** @private */
  this._initialState = initialState;
  /** @protected
   * @ignore */
  this._previousState = null;
  /** @private */
  this._stateBinding = Binding.init(initialState, this._metaBinding);
  /** @private */
  this._stateChanged = false;

  /** @private */
  this._configuration = configuration;

  /** @private */
  this._fullUpdateQueued = false;
  /** @protected
   * @ignore */
  this._fullUpdateInProgress = false;
};

Context.prototype = Object.freeze( /** @lends Context.prototype */ {
  /** Get state binding.
   * @return {Binding} state binding
   * @see Binding */
  getBinding: function () {
    return this._stateBinding;
  },

  /** Get meta binding.
   * @return {Binding} meta binding
   * @see Binding */
  getMetaBinding: function () {
    return this._metaBinding;
  },

  /** Get current state.
   * @return {Immutable.Map} current state */
  getCurrentState: function () {
    return this.getBinding().get();
  },

  /** Get previous state (before last render).
   * @return {Immutable.Map} previous state */
  getPreviousState: function () {
    return this._previousState;
  },

  /** Get current meta state.
   * @returns {Immutable.Map} current meta state */
  getCurrentMeta: function () {
    var metaBinding = this.getMetaBinding();
    return metaBinding ? metaBinding.get() : undefined;
  },

  /** Get previous meta state (before last render).
   * @return {Immutable.Map} previous meta state */
  getPreviousMeta: function () {
    return this._previousMetaState;
  },

  /** Revert to initial state.
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Object} [options] options object, supported options are:
   * <ul>
   *   <li>notify - should listeners be notified, true by default, set to false to disable notification;</li>
   *   <li>resetMeta - should meta state be reverted, true by default, set to false to disable.</li>
   * </ul> */
  resetState: function (subpath, options) {
    var args = Util.resolveArgs(
      arguments,
      function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; }, '?options'
    );

    var pathAsArray = args.subpath ? Binding.asArrayPath(args.subpath) : [];

    var tx = this.getBinding().atomically();
    tx.set(pathAsArray, this._initialState.getIn(pathAsArray));

    var effectiveOptions = args.options || {};
    if (effectiveOptions.resetMeta !== false) {
      tx.set(this.getMetaBinding(), pathAsArray, this._initialMetaState.getIn(pathAsArray));
    }

    tx.commit({ notify: effectiveOptions.notify });
  },

  /** Replace whole state with new value.
   * @param {Immutable.Map} newState new state
   * @param {Immutable.Map} [newMetaState] new meta state
   * @param {Object} [options] options object, supported options are:
   * <ul>
   *   <li>notify - should listeners be notified, true by default, set to false to disable notification.</li>
   * </ul> */
  replaceState: function (newState, newMetaState, options) {
    var args = Util.resolveArgs(
      arguments,
      'newState', function (x) { return x instanceof Imm.Map ? 'newMetaState' : null; }, '?options'
    );

    var effectiveOptions = args.options || {};

    var tx = this.getBinding().atomically();
    tx.set(newState);

    if (args.newMetaState) tx.set(this.getMetaBinding(), args.newMetaState);

    tx.commit({ notify: effectiveOptions.notify });
  },

  /** Check if binding value was changed on last re-render.
   * @param {Binding} binding binding
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Function} [compare] compare function, '===' by default */
  isChanged: function (binding, subpath, compare) {
    var args = Util.resolveArgs(
      arguments,
      'binding', function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; }, '?compare'
    );

    return !args.binding.sub(args.subpath).isChanged(this._previousState, args.compare || Imm.is);
  },

  /** Initialize rendering.
   * @param {Object} rootComp root application component */
  init: function (rootComp) {
    var self = this;
    var requestAnimationFrameEnabled = self._configuration.requestAnimationFrameEnabled;
    var requestAnimationFrame = window && window.requestAnimationFrame;

    var render = function (changes, stateChanged, metaChanged) {
      if (rootComp.isMounted()) {

        self._stateChanged = stateChanged;
        if (stateChanged) {
          self._currentState = self._stateBinding.get();
          self._previousState = changes.getPreviousValue();
        }

        self._metaChanged = metaChanged;
        if (metaChanged) {
          self._currentMetaState = self._metaBinding.get();
          self._previousMetaState = changes.getPreviousMeta();
        }

        try {
          if (self._fullUpdateQueued) {
            self._fullUpdateInProgress = true;
            rootComp.forceUpdate(function () {
              self._fullUpdateQueued = false;
              self._fullUpdateInProgress = false;
            });
          } else {
            rootComp.forceUpdate();
          }
        } catch (e) {
          if (self._configuration.stopOnRenderError) {
            throw e;
          } else {
            console.error('Morearty: skipping render error', e);
          }
        }
      }
    };

    self._stateBinding.addGlobalListener(function (changes) {
      var stateChanged = changes.isValueChanged(), metaChanged = changes.isMetaChanged();

      if (stateChanged || metaChanged) {
        if (requestAnimationFrameEnabled && requestAnimationFrame) {
          requestAnimationFrame(render.bind(null, changes, stateChanged, metaChanged), null);
        } else {
          render(changes, stateChanged, metaChanged);
        }
      }

    });
  },

  /** Queue full update on next render. */
  queueFullUpdate: function () {
    this._fullUpdateQueued = true;
  }

});

module.exports = {

  /** Binding module.
   * @memberOf Morearty
   * @see Binding */
  Binding: Binding,

  /** History module.
   * @memberOf Morearty
   * @see History */
  History: History,

  /** Util module.
   * @memberOf Morearty
   * @see Util */
  Util: Util,

  /** Callback module.
   * @memberOf Morearty
   * @see Callback */
  Callback: Callback,

  /** DOM module.
   * @memberOf Morearty
   * @see DOM */
  DOM: DOM,

  /** Merge strategy.
   * <p>Describes how existing state should be merged with component's default state on mount. Predefined strategies:
   * <ul>
   *   <li>OVERWRITE - overwrite current state with default state;</li>
   *   <li>OVERWRITE_EMPTY - overwrite current state with default state only if current state is null or empty collection;</li>
   *   <li>MERGE_PRESERVE - deep merge current state into default state;</li>
   *   <li>MERGE_REPLACE - deep merge default state into current state.</li>
   * </ul> */
  MergeStrategy: MERGE_STRATEGY,

  /** Morearty mixin.
   * @memberOf Morearty
   * @namespace
   * @classdesc Mixin */
  Mixin: {
    contextTypes: { morearty: function () {} },

    /** Get Morearty context.
     * @returns {Context} */
    getMoreartyContext: function () {
      return this.context.morearty;
    },

    /** Get component state binding. Returns binding specified in component's binding attribute.
     * @param {String} [name] binding name (can only be used with multi-binding state)
     * @return {Binding|Object} component state binding */
    getBinding: function (name) {
      return getBinding(this.getMoreartyContext(), this, name);
    },

    /** Get default component state binding. Use this to get component's binding.
     * <p>Default binding is single binding for single-binding components or
     * binding with key 'default' for multi-binding components.
     * This method allows smooth migration from single to multi-binding components, e.g. you start with:
     * <pre><code>{ binding: foo }</code></pre>
     * or
     * <pre><code>{ binding: { default: foo } }</code></pre>
     * or even
     * <pre><code>{ binding: { any: foo } }</code></pre>
     * and add more bindings later:
     * <pre><code>{ binding: { default: foo, aux: auxiliary } }</code></pre>
     * This way code changes stay minimal.
     * @return {Binding} default component state binding */
    getDefaultBinding: function () {
      var context = this.getMoreartyContext();
      var binding = getBinding(context, this);
      if (binding instanceof Binding) {
        return binding;
      } else if (typeof binding === 'object') {
        var keys = Object.keys(binding);
        return keys.length === 1 ? binding[keys[0]] : binding['default'];
      }
    },

    /** Get component previous state value.
     * @param {String} [name] binding name (can only be used with multi-binding state)
     * @return {Binding} previous component state value */
    getPreviousState: function (name) {
      var context = this.getMoreartyContext();
      return getBinding(context, this, name).withBackingValue(context._previousState).get();
    },

    componentWillMount: function () {
      if (typeof this.getDefaultState === 'function') {
        var context = this.getMoreartyContext();
        var defaultState = this.getDefaultState();
        if (defaultState) {
          var binding = getBinding(context, this);
          var mergeStrategy =
              typeof this.getMergeStrategy === 'function' ? this.getMergeStrategy() : MERGE_STRATEGY.MERGE_PRESERVE;

          var immutableInstance = defaultState instanceof Imm.Iterable;

          if (binding instanceof Binding) {
            var effectiveDefaultState = immutableInstance ? defaultState : defaultState['default'];
            merge.call(context, mergeStrategy, effectiveDefaultState, binding);
          } else {
            var keys = Object.keys(binding);
            var defaultKey = keys.length === 1 ? keys[0] : 'default';
            var effectiveMergeStrategy = typeof mergeStrategy === 'string' ? mergeStrategy : mergeStrategy[defaultKey];

            if (immutableInstance) {
              merge.call(context, effectiveMergeStrategy, defaultState, binding[defaultKey]);
            } else {
              keys.forEach(function (key) {
                if (defaultState[key]) {
                  merge.call(context, effectiveMergeStrategy, defaultState[key], binding[key]);
                }
              });
            }
          }
        }
      }
    },

    shouldComponentUpdate: function (nextProps, nextState) {
      var self = this;
      var context = self.getMoreartyContext();
      var shouldComponentUpdate = function () {
        if (context._fullUpdateInProgress) {
          return true;
        } else {
          var binding = getBinding(context, self);
          return !binding || stateChanged(context, binding);
        }
      };

      var shouldComponentUpdateOverride = self.shouldComponentUpdateOverride;
      return shouldComponentUpdateOverride ?
        shouldComponentUpdateOverride(shouldComponentUpdate, nextProps, nextState) :
        shouldComponentUpdate();
    }
  },

  /** Create Morearty context.
   * @param {Immutable.Map|Object} initialState initial state
   * @param {Immutable.Map|Object} initialMetaState initial meta-state
   * @param {Object} [options] Morearty configuration. Supported parameters:
   * <ul>
   *   <li>bindingPropertyName - name of the property holding component's binding, 'binding' by default;</li>
   *   <li>requestAnimationFrameEnabled - enable rendering in requestAnimationFrame, false by default;</li>
   *   <li>stopOnRenderError - stop on errors during render, false by default.</li>
   * </ul>
   * @return {Context}
   * @memberOf Morearty */
  createContext: function (initialState, initialMetaState, options) {
    var ensureImmutable = function (state) {
      return state instanceof Imm.Iterable ? state : Imm.fromJS(state);
    };

    var state = ensureImmutable(initialState);
    var metaState = initialMetaState ? ensureImmutable(initialMetaState) : Imm.Map();
    var effectiveOptions = options || {};
    return new Context(state, metaState, {
      bindingPropertyName: effectiveOptions.bindingPropertyName || 'binding',
      requestAnimationFrameEnabled: effectiveOptions.requestAnimationFrameEnabled || false,
      stopOnRenderError: effectiveOptions.stopOnRenderError || false
    });
  }

};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./Binding":1,"./DOM":3,"./History":4,"./Util":6,"./util/Callback":7}],6:[function(require,module,exports){
/**
 * @name Util
 * @namespace
 * @classdesc Miscellaneous util functions.
 */

/* ---------------- */
/* Private helpers. */
/* ---------------- */

// resolveArgs

var isRequired, findTurningPoint, prepare;

isRequired = function (spec) {
  return typeof spec === 'string' && spec.charAt(0) !== '?';
};

findTurningPoint = function (arr, pred) {
  var first = pred(arr[0]);
  for (var i = 1; i < arr.length; i++) {
    if (pred(arr[i]) !== first) return i;
  }
  return null;
};

prepare = function (arr, splitAt) {
  return arr.slice(splitAt).reverse().concat(arr.slice(0, splitAt));
};

module.exports = {

  /** Identity function. Returns its first argument.
   * @param {*} x argument to return
   * @return {*} its first argument
   * @memberOf Util */
  identity: function (x) {
    return x;
  },

  /** 'Not' function returning logical not of its argument.
   * @param {*} x argument
   * @returns {*} !x
   * @memberOf Util */
  not: function (x) {
    return !x;
  },

  /** Create constant function (always returning x).
   * @param {*} x constant function return value
   * @return {Function} function always returning x
   * @memberOf Util */
  constantly: function (x) {
    return function () { return x; };
  },

  /** Execute function asynchronously.
   * @param {Function} f function */
  async: function (f) {
    setTimeout(f, 0);
  },

  /** Execute function f, then function cont. If f returns a promise, cont is executed when the promise resolves.
   * @param {Function} f function to execute first
   * @param {Function} cont function to execute after f
   * @memberOf Util */
  afterComplete: function (f, cont) {
    var result = f();
    if (result && typeof result.always === 'function') {
      result.always(cont);
    } else {
      cont();
    }
  },

  /** Check if argument is undefined or null.
   * @param {*} x argument to check
   * @returns {Boolean}
   * @memberOf Util */
  undefinedOrNull: function (x) {
    return x === undefined || x === null;
  },

  /** Get values of object properties.
   * @param {Object} obj object
   * @return {Array} object's properties values
   * @memberOf Util */
  getPropertyValues: function (obj) {
    return Object.keys(obj).map(function (key) { return obj[key]; });
  },

  /** Find array element satisfying the predicate.
   * @param {Array} arr array
   * @param {Function} pred predicate accepting current value, index, original array
   * @return {*} found value or null
   * @memberOf Util */
  find: function (arr, pred) {
    for (var i = 0; i < arr.length; i++) {
      var value = arr[i];
      if (pred(value, i, arr)) {
        return value;
      }
    }
    return null;
  },

  /** Resolve arguments. Acceptable spec formats:
   * <ul>
   *   <li>'foo' - required argument 'foo';</li>
   *   <li>'?foo' - optional argument 'foo';</li>
   *   <li>function (arg) { return arg instanceof MyClass ? 'foo' : null; } - checked optional argument.</li>
   * </ul>
   * Specs can only switch optional flag once in the list. This invariant isn't checked by the method,
   * its violation will produce indeterminate results.
   * <p>Optional arguments are matched in order, left to right. Provide check function if you need to allow to skip
   * one optional argument and use sebsequent optional arguments instead.
   * <p>Returned arguments descriptor contains argument names mapped to resolved values.
   * @param {Array} args arguments 'array'
   * @param {*} var_args arguments specs as a var-args list or array, see method description
   * @returns {Object} arguments descriptor object
   * @memberOf Util */
  resolveArgs: function (args, var_args) {
    var result = {};
    if (arguments.length > 1) {
      var specs = Array.isArray(var_args) ? var_args : Array.prototype.slice.call(arguments, 1);
      var preparedSpecs, preparedArgs;
      var turningPoint;

      if (isRequired(specs[0]) || !(turningPoint = findTurningPoint(specs, isRequired))) {
        preparedSpecs = specs;
        preparedArgs = args;
      } else {
        var effectiveArgs = Array.isArray(args) ? args : Array.prototype.slice.call(args);
        preparedSpecs = prepare(specs, turningPoint);
        preparedArgs = prepare(effectiveArgs, effectiveArgs.length - (specs.length - turningPoint));
      }

      for (var specIndex = 0, argIndex = 0;
           specIndex < preparedSpecs.length && argIndex < preparedArgs.length; specIndex++) {
        var spec = preparedSpecs[specIndex], arg = preparedArgs[argIndex];
        if (isRequired(spec)) {
          result[spec] = arg;
          argIndex++;
        } else {
          var name = typeof spec === 'function' ? spec(arg) : (spec.charAt(0) !== '?' ? spec : spec.substring(1));
          if (name || arg === undefined) {
            result[name] = arg;
            argIndex++;
          }
        }
      }
    }

    return result;
  },

  /** Check if argument can be valid binding subpath.
   * @param {*} x
   * @returns {Boolean}
   * @memberOf Util */
  canRepresentSubpath: function (x) {
    var type = typeof x;
    return type === 'string' || type === 'number' || Array.isArray(x);
  },

  /** ES6 Object.assign.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign */
  assign: function (target, firstSource) {
    if (target === undefined || target === null) {
      throw new TypeError('Cannot convert first argument to object');
    }

    var to = Object(target);

    var hasPendingException = false;
    var pendingException;

    for (var i = 1; i < arguments.length; i++) {
      var nextSource = arguments[i];
      if (nextSource === undefined || nextSource === null)
        continue;

      var keysArray = Object.keys(Object(nextSource));
      for (var nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex++) {
        var nextKey = keysArray[nextIndex];
        try {
          var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
          if (desc !== undefined && desc.enumerable)
            to[nextKey] = nextSource[nextKey];
        } catch (e) {
          if (!hasPendingException) {
            hasPendingException = true;
            pendingException = e;
          }
        }
      }

      if (hasPendingException)
        throw pendingException;
    }
    return to;
  }

};

},{}],7:[function(require,module,exports){
/**
 * @name Callback
 * @namespace
 * @classdesc Miscellaneous callback util functions.
 */
var Util = require('../Util');

module.exports = {

  /** Create callback used to set binding value on an event.
   * @param {Binding} binding binding
   * @param {String|Array} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Function} [f] value transformer
   * @returns {Function} callback
   * @memberOf Callback */
  set: function (binding, subpath, f) {
    var args = Util.resolveArgs(
      arguments,
      'binding', function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; }, '?f'
    );

    return function (event) {
      var value = event.target.value;
      binding.set(args.subpath, args.f ? args.f(value) : value);
    };
  },

  /** Create callback used to delete binding value on an event.
   * @param {Binding} binding binding
   * @param {String|String[]} [subpath] subpath as a dot-separated string or an array of strings and numbers
   * @param {Function} [pred] predicate
   * @returns {Function} callback
   * @memberOf Callback */
  delete: function (binding, subpath, pred) {
    var args = Util.resolveArgs(
      arguments,
      'binding', function (x) { return Util.canRepresentSubpath(x) ? 'subpath' : null; }, '?pred'
    );

    return function (event) {
      var value = event.target.value;
      if (!args.pred || args.pred(value)) {
        binding.delete(args.subpath);
      }
    };
  },

  /** Create callback invoked when specified key combination is pressed.
   * @param {Function} cb callback
   * @param {String|Array} key key
   * @param {Boolean} [shiftKey] shift key flag
   * @param {Boolean} [ctrlKey] ctrl key flag
   * @returns {Function} callback
   * @memberOf Callback */
  onKey: function (cb, key, shiftKey, ctrlKey) {
    var effectiveShiftKey = shiftKey || false;
    var effectiveCtrlKey = ctrlKey || false;
    return function (event) {
      var keyMatched = typeof key === 'string' ?
        event.key === key :
        Util.find(key, function (k) { return k === event.key; });

      if (keyMatched && event.shiftKey === effectiveShiftKey && event.ctrlKey === effectiveCtrlKey) {
        cb(event);
      }
    };
  },

  /** Create callback invoked when enter key is pressed.
   * @param {Function} cb callback
   * @returns {Function} callback
   * @memberOf Callback */
  onEnter: function (cb) {
    return this.onKey(cb, 'Enter');
  },

  /** Create callback invoked when escape key is pressed.
   * @param {Function} cb callback
   * @returns {Function} callback
   * @memberOf Callback */
  onEscape: function (cb) {
    return this.onKey(cb, 'Escape');
  }

};

},{"../Util":6}],8:[function(require,module,exports){
/** Holder constructor.
 * @param {*} value value
 * @public
 * @class Holder
 * @classdesc Mutable cell holding some value. */
var Holder = function (value) {
  /** @private */
  this._value = value;
};

/* --------------- */
/* Static helpers. */
/* --------------- */

/** Create new holder instance.
 * @param {*} value value
 * @return {Holder} fresh holder */
Holder.init = function (value) {
  return new Holder(value);
};

Holder.prototype = Object.freeze( /** @lends Holder.prototype */ {

  /** Get value.
   * @return {*} */
  getValue: function () {
    return this._value;
  },

  /** Set value.
   * @param {*} newValue new value */
  setValue: function (newValue) {
    this._value = newValue;
  },

  /** Update value with a function.
   * @param {Function} update update function
   * @return {*} old value */
  updateValue: function (update) {
    var oldValue = this._value;
    this._value = update(oldValue);
    return oldValue;
  }

});

module.exports = Holder;

},{}]},{},[5])(5)
});