/**
 * Oxygen System - Displays mission-critical oxygen levels
 * Creates narrative tension as the game progresses
 */

function OxygenSystem() {
  this.indicator = null;
  this.currentLevel = 3; // 0 = critical, 1 = low, 2 = medium, 3 = high
  this.lastHours = 48;
  this.createIndicator();

  // Listen for progression events
  var self = this;
  if (window.gameManager && window.gameManager.eventBus) {
    window.gameManager.eventBus.on('game:progression', function(data) {
      self.updateFromSum(data.sum);
    });
  }
}

OxygenSystem.prototype.createIndicator = function() {
  this.indicator = document.createElement('div');
  this.indicator.id = 'oxygen-indicator';
  this.indicator.style.cssText =
    'position: fixed;' +
    'bottom: clamp(10px, 2vh, 20px);' +
    'left: clamp(10px, 2vw, 20px);' +
    'background: rgba(15, 23, 42, 0.85);' +
    'backdrop-filter: blur(12px);' +
    'border: 1px solid rgba(255, 255, 255, 0.15);' +
    'border-radius: 8px;' +
    'padding: clamp(6px, 1.5vw, 10px) clamp(12px, 3vw, 16px);' +
    'font-family: "Outfit", sans-serif;' +
    'font-size: clamp(10px, 2.5vw, 12px);' +
    'z-index: 1000;' +
    'display: flex;' +
    'align-items: center;' +
    'gap: 8px;' +
    'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);' +
    'transition: all 0.3s ease;' +
    'opacity: 0;' +
    'animation: fadeInOxygen 0.5s ease 1s forwards;';

  document.body.appendChild(this.indicator);

  // Add fade in animation and mobile responsiveness
  var style = document.createElement('style');
  style.textContent = '@keyframes fadeInOxygen { to { opacity: 1; } }' +
    '@keyframes criticalPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }' +
    '@keyframes warningPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }' +
    '@media (max-width: 600px) { #oxygen-indicator { font-size: 10px !important; padding: 6px 10px !important; gap: 6px !important; } }' +
    '@media (max-height: 500px) and (orientation: landscape) { #oxygen-indicator { display: none !important; } }';
  document.head.appendChild(style);

  this.updateDisplay(48, 3);
};

OxygenSystem.prototype.updateDisplay = function(hours, level) {
  if (!this.indicator) return;

  var icon, color, text, statusText, animation;

  switch(level) {
    case 0: // Critical (< 12h)
      icon = '🔴';
      color = '#ef4444';
      statusText = 'CRÍTICO';
      animation = 'criticalPulse 1s ease-in-out infinite';
      break;
    case 1: // Low (12-24h)
      icon = '🟠';
      color = '#f59e0b';
      statusText = 'BAJO';
      animation = 'warningPulse 2s ease-in-out infinite';
      break;
    case 2: // Medium (24-36h)
      icon = '🟡';
      color = '#eab308';
      statusText = 'MEDIO';
      animation = 'none';
      break;
    default: // High (36-48h)
      icon = '🟢';
      color = '#10b981';
      statusText = 'ESTABLE';
      animation = 'none';
  }

  this.indicator.innerHTML =
    '<span style="font-size: 16px;">' + icon + '</span>' +
    '<span style="color: ' + color + '; font-weight: 600; letter-spacing: 0.5px;">' + statusText + '</span>' +
    '<span style="color: rgba(255, 255, 255, 0.6); margin-left: 4px;">O₂:</span>' +
    '<span style="color: ' + color + '; font-weight: 700;">' + hours + 'h</span>';

  this.indicator.style.animation = animation;
  this.indicator.style.borderColor = 'rgba(' + this.hexToRgb(color) + ', 0.3)';

  this.currentLevel = level;
};

/**
 * Update oxygen from tile sum - more accurate than score
 * @param {number} tileSum - Sum of all tiles on board
 */
OxygenSystem.prototype.updateFromSum = function(tileSum) {
  var hours, level;

  // Calculate oxygen based on tile sum (0 to ~4000)
  if (tileSum < 200) {
    // Orbital phase: oxygen stable
    hours = 48 - Math.floor(tileSum / 20); // 48h to 38h
    level = 3;
  } else if (tileSum < 1000) {
    // De-orbit phase: oxygen dropping
    hours = 38 - Math.floor((tileSum - 200) / 60); // 38h to 25h
    level = 2;
  } else if (tileSum < 2500) {
    // Atmospheric entry: oxygen getting low
    hours = 25 - Math.floor((tileSum - 1000) / 120); // 25h to 12h
    level = 1;
  } else {
    // Critical reentry: oxygen critical
    hours = Math.max(1, 12 - Math.floor((tileSum - 2500) / 300)); // 12h to 1h
    level = 0;
  }

  hours = Math.max(1, hours);

  // Only update display when hours change
  if (hours !== this.lastHours) {
    this.updateDisplay(hours, level);
    this.lastHours = hours;
  }

  // Play alert sound on level change
  if (level < this.currentLevel) {
    this.playAlertSound(level);
  }

  this.currentLevel = level;
};

/**
 * Legacy: Update from score (fallback)
 * @param {number} score - Current game score
 */
OxygenSystem.prototype.updateFromScore = function(score) {
  // Fallback - not used when sum-based system is active
};

OxygenSystem.prototype.playAlertSound = function(level) {
  // This will be called when oxygen level drops
  // We'll integrate with SoundManager via event bus
  if (window.gameManager && window.gameManager.eventBus) {
    window.gameManager.eventBus.emit('oxygen:alert', { level: level });
  }
};

OxygenSystem.prototype.hexToRgb = function(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ?
    parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) :
    '255,255,255';
};

OxygenSystem.prototype.hide = function() {
  if (this.indicator) {
    this.indicator.style.opacity = '0';
  }
};

OxygenSystem.prototype.show = function() {
  if (this.indicator) {
    this.indicator.style.opacity = '1';
  }
};
