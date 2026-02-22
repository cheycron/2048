/**
 * Simple Event Bus for decoupled communication between managers
 * Implements pub-sub pattern to reduce tight coupling
 */
function EventBus() {
  this.events = {};
}

/**
 * Subscribe to an event
 * @param {string} event - Event name
 * @param {function} callback - Function to call when event is triggered
 * @returns {function} Unsubscribe function
 */
EventBus.prototype.on = function(event, callback) {
  if (!this.events[event]) {
    this.events[event] = [];
  }
  this.events[event].push(callback);
  
  // Return unsubscribe function
  var self = this;
  return function() {
    self.off(event, callback);
  };
};

/**
 * Unsubscribe from an event
 * @param {string} event - Event name
 * @param {function} callback - Function to remove
 */
EventBus.prototype.off = function(event, callback) {
  if (!this.events[event]) return;
  
  var index = this.events[event].indexOf(callback);
  if (index > -1) {
    this.events[event].splice(index, 1);
  }
};

/**
 * Emit an event
 * @param {string} event - Event name
 * @param {*} data - Data to pass to callbacks
 */
EventBus.prototype.emit = function(event, data) {
  if (!this.events[event]) return;
  
  this.events[event].forEach(function(callback) {
    try {
      callback(data);
    } catch (e) {
      console.error('Error in event handler for "' + event + '":', e);
    }
  });
};

/**
 * Subscribe to an event only once
 * @param {string} event - Event name
 * @param {function} callback - Function to call once
 */
EventBus.prototype.once = function(event, callback) {
  var self = this;
  var wrappedCallback = function(data) {
    callback(data);
    self.off(event, wrappedCallback);
  };
  this.on(event, wrappedCallback);
};

/**
 * Clear all event listeners
 */
EventBus.prototype.clear = function() {
  this.events = {};
};