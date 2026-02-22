/**
 * Game Manager - Controls the game logic and coordinates between components
 * @param {number} size - Grid size (typically 4 for 4x4)
 * @param {function} InputManager - Input manager constructor
 * @param {function} Actuator - HTML actuator constructor
 * @param {function} StorageManager - Storage manager constructor
 */
function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  // Create global event bus for decoupled communication
  this.eventBus       = new EventBus();

  this.soundManager   = new SoundManager(this.eventBus);
  this.visualEffects  = new VisualEffectsManager(this.eventBus);

  this.startTiles     = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlayingHandler.bind(this));

  // Debug cheats
  this.inputManager.on("debugWin", this.debugWin.bind(this));
  this.inputManager.on("debugLose", this.debugLose.bind(this));

  this.setup();
}

/**
 * Restart the game - Clears game state and starts fresh
 */
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message

  // Reset visual effects to initial state
  if (this.visualEffects) {
    this.visualEffects.resetEffects();
  }

  // Reset oxygen system
  if (window.oxygenSystem) {
    window.oxygenSystem.currentLevel = 3;
    window.oxygenSystem.lastHours = 48;
    window.oxygenSystem.updateDisplay(48, 3);
  }

  this.setup();
};

/**
 * Keep playing after winning - Allows player to continue past 2048
 */
GameManager.prototype.keepPlayingHandler = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

/**
 * Check if game is terminated (won without continuing, or lost)
 * @returns {boolean} True if game should stop accepting moves
 */
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

/**
 * Set up the game - Initialize or restore from saved state
 */
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

/**
 * Add initial tiles to start the game
 */
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

/**
 * Add a random tile (2 or 4) in a random available position
 */
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

/**
 * Calculate the sum of all tiles on the board
 * @returns {number} Total sum of all tile values
 */
GameManager.prototype.getTileSum = function () {
  var sum = 0;
  var maxTile = 0;
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      sum += tile.value;
      if (tile.value > maxTile) maxTile = tile.value;
    }
  });
  return { sum: sum, maxTile: maxTile };
};

/**
 * Update the display and save game state
 */
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  // Calculate board state for progression system
  var boardState = this.getTileSum();

  // Update visual effects with both sum and max tile
  if (this.visualEffects) {
    this.visualEffects.setGameProgress(boardState.maxTile, boardState.sum);
  }

  // Emit progression event for other systems
  if (this.eventBus) {
    this.eventBus.emit('game:progression', {
      sum: boardState.sum,
      maxTile: boardState.maxTile,
      score: this.score
    });
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

/**
 * Serialize the current game state for saving
 * @returns {object} Game state object
 */
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

/**
 * Prepare tiles for movement - Save positions and clear merge info
 */
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

/**
 * Move a tile to a new cell
 * @param {object} tile - Tile to move
 * @param {object} cell - Destination cell {x, y}
 */
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

/**
 * Move tiles in the specified direction
 * @param {number} direction - 0: up, 1: right, 2: down, 3: left
 */
GameManager.prototype.move = function (direction) {
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  // Initialize sound on first user interaction to comply with browser policies
  if (this.soundManager && !this.soundManager.initialized) {
    this.soundManager.init();
  }

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  var maxMergeValue = 0; // Track highest merge value for effects

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          if (merged.value > maxMergeValue) {
            maxMergeValue = merged.value;
          }

                    // Emit milestone events for radio chatter on power-of-2 achievements
          if (merged.value >= 64 && self.eventBus) {
            self.eventBus.emit('game:milestone', { value: merged.value });
          }

          // The mighty 2048 tile
          if (merged.value === 2048) {
            self.won = true;

            // Emit victory event for celebratory effects
            if (self.eventBus) {
              self.eventBus.emit('game:won');
            }
          }
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!

      // Emit game over event for catastrophic effects
      if (this.eventBus) {
        this.eventBus.emit('game:over');
      }
    }

    // Emit events instead of direct calls for better decoupling
    this.eventBus.emit('game:move', { direction: direction });

    if (maxMergeValue > 0) {
      this.eventBus.emit('game:merge', { value: maxMergeValue });
    }

    this.actuate();
  }
};

/**
 * Get movement vector for a direction
 * @param {number} direction - 0: up, 1: right, 2: down, 3: left
 * @returns {object} Vector {x, y}
 */
GameManager.prototype.getVector = function (direction) {
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

/**
 * Build traversal order based on movement direction
 * @param {object} vector - Movement vector {x, y}
 * @returns {object} Traversals {x: [], y: []}
 */
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

/**
 * Find the farthest position a tile can move to
 * @param {object} cell - Starting cell {x, y}
 * @param {object} vector - Movement vector {x, y}
 * @returns {object} {farthest: {x, y}, next: {x, y}}
 */
GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

/**
 * Check if any moves are available
 * @returns {boolean} True if moves are possible
 */
GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

/**
 * Check if any tiles can be merged (expensive operation)
 * @returns {boolean} True if matching tiles exist
 */
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

/**
 * Compare two positions for equality
 * @param {object} first - First position {x, y}
 * @param {object} second - Second position {x, y}
 * @returns {boolean} True if positions are equal
 */
GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

/**
 * DEBUG: Auto-win by spawning a 2048 tile
 * Keyboard shortcut: Ctrl+Shift+W
 */
GameManager.prototype.debugWin = function() {
  var self = this;
  console.log('🎮 DEBUG MODE: Auto-winning...');

  // Find an empty cell or use first cell
  var availableCells = this.grid.availableCells();
  var targetCell = availableCells.length > 0 ? availableCells[0] : { x: 0, y: 0 };

  // Remove any existing tile at target position
  if (this.grid.cells[targetCell.x][targetCell.y]) {
    this.grid.removeTile(this.grid.cells[targetCell.x][targetCell.y]);
  }

  // Create a 2048 tile
  var winTile = new Tile(targetCell, 2048);
  this.grid.insertTile(winTile);

  // Set game state
  this.won = true;
  this.score += 2048;

  // Trigger visual and audio effects
  if (this.eventBus) {
    this.eventBus.emit('game:merge', { value: 2048 });
    // Also emit victory event for ocean splashdown effects
    setTimeout(function() {
      if (self.eventBus) {
        self.eventBus.emit('game:won');
      }
    }, 300); // Small delay after merge effect
  }

  // Update display
  this.actuate();
};

/**
 * DEBUG: Auto-lose by filling the board with non-matching tiles
 * Keyboard shortcut: Ctrl+Shift+L
 */
GameManager.prototype.debugLose = function() {
  console.log('🎮 DEBUG MODE: Auto-losing...');

  // Fill the entire grid with alternating tiles that can't merge
  var values = [2, 4, 8, 16, 32, 64, 128, 256];
  var valueIndex = 0;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      // Remove existing tile
      if (this.grid.cells[x][y]) {
        this.grid.removeTile(this.grid.cells[x][y]);
      }

      // Create a tile with value that ensures no matches
      var value = values[valueIndex % values.length];
      var tile = new Tile({ x: x, y: y }, value);
      this.grid.insertTile(tile);

      valueIndex++;
    }
  }

  // Set game state
  this.over = true;

  // Emit game over event for catastrophic effects
  if (this.eventBus) {
    this.eventBus.emit('game:over');
  }

  // Update display
  this.actuate();
};
