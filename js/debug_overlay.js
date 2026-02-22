/**
 * Debug Overlay - Shows real-time game progression metrics
 * Add ?debug=1 to URL to enable
 */

function DebugOverlay(visualEffects, gameManager) {
  // Check if debug mode is enabled via URL parameter
  var urlParams = new URLSearchParams(window.location.search);
  this.enabled = urlParams.get('debug') === '1';

  if (!this.enabled) return;

  this.visualEffects = visualEffects;
  this.gameManager = gameManager;

  this.createOverlay();
  this.startUpdating();
}

DebugOverlay.prototype.createOverlay = function() {
  var overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  overlay.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.8); color: #0f0; font-family: monospace; font-size: 12px; padding: 15px; border-radius: 8px; z-index: 10000; min-width: 250px; backdrop-filter: blur(10px); border: 1px solid rgba(0, 255, 0, 0.3);';

  overlay.innerHTML = '<div style="font-weight: bold; margin-bottom: 10px; color: #0ff;">🎮 DEBUG MODE</div>' +
    '<div id="debug-max-tile">Max Tile: -</div>' +
    '<div id="debug-tile-sum">Tile Sum: -</div>' +
    '<div id="debug-progress">Progress: -</div>' +
    '<div id="debug-energy">Energy: -</div>' +
    '<div id="debug-particles">Particles: -</div>' +
    '<div id="debug-phase">Phase: -</div>' +
    '<hr style="border-color: rgba(0,255,0,0.3); margin: 10px 0;">' +
    '<div id="debug-flash">Flash: -</div>' +
    '<div id="debug-shake">Shake: -</div>' +
    '<div id="debug-swirl">Swirl: -</div>' +
    '<hr style="border-color: rgba(0,255,0,0.3); margin: 10px 0;">' +
    '<div style="font-size: 10px; color: #f59e0b; margin-top: 8px; line-height: 1.4;"><strong>Cheats:</strong><br>Alt+Shift+V = Victory 🏆<br>Alt+Shift+X = eXplosion 💥</div>' +
    '<div style="font-size: 10px; color: #888; margin-top: 8px;">Remove ?debug=1 to hide</div>';

  document.body.appendChild(overlay);

  this.elements = {
    maxTile: document.getElementById('debug-max-tile'),
    tileSum: document.getElementById('debug-tile-sum'),
    progress: document.getElementById('debug-progress'),
    energy: document.getElementById('debug-energy'),
    particles: document.getElementById('debug-particles'),
    phase: document.getElementById('debug-phase'),
    flash: document.getElementById('debug-flash'),
    shake: document.getElementById('debug-shake'),
    swirl: document.getElementById('debug-swirl')
  };
};

DebugOverlay.prototype.getBoardState = function() {
  if (!this.gameManager || !this.gameManager.grid) return { maxTile: 0, sum: 0 };

  var maxTile = 0;
  var sum = 0;
  this.gameManager.grid.eachCell(function(x, y, tile) {
    if (tile) {
      sum += tile.value;
      if (tile.value > maxTile) maxTile = tile.value;
    }
  });
  return { maxTile: maxTile, sum: sum };
};

DebugOverlay.prototype.getGamePhase = function(sum) {
  if (sum < 200) return '🛰️ Orbital';
  if (sum < 1000) return '🌍 Deorbit';
  if (sum < 2000) return '☁️ Upper Atm';
  if (sum < 3000) return '🔥 Reentry';
  return '💥 Critical';
};

DebugOverlay.prototype.getProgressBar = function(value, max) {
  var percent = Math.round((value / max) * 100);
  var bars = Math.round(percent / 5); // 20 bars max
  var filled = '█'.repeat(bars);
  var empty = '░'.repeat(20 - bars);
  return filled + empty + ' ' + percent + '%';
};

DebugOverlay.prototype.getColorForValue = function(value, max) {
  var percent = value / max;
  if (percent < 0.3) return '#0f0'; // Green
  if (percent < 0.6) return '#ff0'; // Yellow
  if (percent < 0.8) return '#f80'; // Orange
  return '#f00'; // Red
};

DebugOverlay.prototype.update = function() {
  if (!this.enabled || !this.visualEffects) return;

  var boardState = this.getBoardState();
  var maxTile = boardState.maxTile;
  var tileSum = boardState.sum;
  var progress = this.visualEffects.progressFactor || 0;
  var energy = this.visualEffects.energy || 0;
  var particleCount = this.visualEffects.particles ? this.visualEffects.particles.length : 0;
  var flash = this.visualEffects.flashIntensity || 0;

  // Max tile
  this.elements.maxTile.innerHTML = 'Max Tile: <span style="color: #ff0; font-weight: bold;">' + maxTile + '</span>';

  // Tile sum
  var sumColor = this.getColorForValue(tileSum, 4000);
  this.elements.tileSum.innerHTML = 'Tile Sum: <span style="color: ' + sumColor + '; font-weight: bold;">' + tileSum + '</span> <span style="color: #888;">/4000</span>';

  // Progress
  var progressColor = this.getColorForValue(progress, 1.0);
  this.elements.progress.innerHTML = 'Progress: <span style="color: ' + progressColor + ';">' +
    this.getProgressBar(progress, 1.0) + '</span>';

  // Energy
  var maxEnergy = 3.0;
  var energyColor = this.getColorForValue(energy, maxEnergy);
  this.elements.energy.innerHTML = 'Energy: <span style="color: ' + energyColor + ';">' +
    this.getProgressBar(energy, maxEnergy) + '</span> ' + energy.toFixed(2);

  // Particles
  var maxParticles = this.visualEffects.maxParticles || 300;
  var particleColor = this.getColorForValue(particleCount, maxParticles);
  this.elements.particles.innerHTML = 'Particles: <span style="color: ' + particleColor + ';">' +
    particleCount + ' / ' + maxParticles + '</span>';

  // Phase
  var phase = this.getGamePhase(tileSum);
  this.elements.phase.innerHTML = 'Phase: <span style="color: #0ff;">' + phase + '</span>';

  // Flash intensity
  var flashColor = this.getColorForValue(flash, 2.0);
  this.elements.flash.innerHTML = 'Flash: <span style="color: ' + flashColor + ';">' +
    flash.toFixed(3) + '</span>';

  // Screen shake status
  var shakeActive = energy > 1.8;
  var shakeColor = shakeActive ? '#f00' : '#080';
  var shakeText = shakeActive ? '✓ ACTIVE' : '✗ Inactive';
  this.elements.shake.innerHTML = 'Shake: <span style="color: ' + shakeColor + ';">' +
    shakeText + '</span> (>' + '1.8)';

  // Swirl status
  var swirlActive = energy > 0.15;
  var swirlColor = swirlActive ? '#f80' : '#080';
  var swirlText = swirlActive ? '✓ ACTIVE' : '✗ Inactive';
  this.elements.swirl.innerHTML = 'Swirl: <span style="color: ' + swirlColor + ';">' +
    swirlText + '</span> (>0.15)';
};

DebugOverlay.prototype.startUpdating = function() {
  if (!this.enabled) return;

  var self = this;
  setInterval(function() {
    self.update();
  }, 100); // Update 10 times per second
};
