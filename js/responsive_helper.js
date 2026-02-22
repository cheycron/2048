/**
 * Responsive Helper - Calculates tile positions dynamically
 */

function ResponsiveHelper() {
  this.updateDimensions();
  window.addEventListener('resize', this.updateDimensions.bind(this));
  window.addEventListener('orientationchange', this.updateDimensions.bind(this));
}

ResponsiveHelper.prototype.updateDimensions = function() {
  var container = document.querySelector('.game-container');
  if (!container) return;

  var containerRect = container.getBoundingClientRect();
  var computedStyle = window.getComputedStyle(container);
  var padding = parseFloat(computedStyle.padding) || 15;

  // Calculate grid dimensions
  var gridSize = containerRect.width - (padding * 2);

  // Gap should be responsive
  var gap;
  if (window.innerWidth < 400) {
    gap = 8;
  } else if (window.innerWidth < 600) {
    gap = 10;
  } else {
    gap = 15;
  }

  // Calculate cell size
  var cellSize = (gridSize - (gap * 3)) / 4;

  this.cellSize = Math.floor(cellSize);
  this.gap = gap;
  this.padding = padding;

  // Update CSS variables for tile positioning
  document.documentElement.style.setProperty('--tile-size', this.cellSize + 'px');
  document.documentElement.style.setProperty('--tile-gap', gap + 'px');

  console.log('Updated dimensions:', {
    containerWidth: containerRect.width,
    padding: padding,
    gridSize: gridSize,
    gap: gap,
    cellSize: this.cellSize
  });
};

ResponsiveHelper.prototype.updateAllTiles = function() {
  // Tiles will be sized by CSS, we just need to update transforms
  var tiles = document.querySelectorAll('.tile');
  tiles.forEach(function(tile) {
    var classes = tile.className.match(/tile-position-(\d)-(\d)/);
    if (classes) {
      var x = parseInt(classes[1]) - 1;
      var y = parseInt(classes[2]) - 1;
      var pos = this.getTilePosition(x, y);
      tile.style.transform = 'translate(' + pos.x + 'px, ' + pos.y + 'px)';
    }
  }.bind(this));
};

ResponsiveHelper.prototype.getTilePosition = function(x, y) {
  return {
    x: x * (this.cellSize + this.gap),
    y: y * (this.cellSize + this.gap)
  };
};

ResponsiveHelper.prototype.getCellSize = function() {
  return this.cellSize || 106;
};

ResponsiveHelper.prototype.getGap = function() {
  return this.gap || 15;
};
