function VisualEffectsManager() {
  this.canvas = document.getElementById('bg-canvas');
  if (!this.canvas) return;

  this.ctx = this.canvas.getContext('2d');
  this.particles = [];
  this.width = window.innerWidth;
  this.height = window.innerHeight;
  this.flashIntensity = 0;
  // Deep space-like base background
  this.baseColor = { r: 15, g: 23, b: 42 };
  this.targetVectors = { x: 0, y: 0 };

  this.energy = 0;
  this.progressFactor = 0.09; // Se ajusta basado en el máx tile (2048 => 1.0)
  this.breathingPhase = 0;
  this.soundManager = null;
  this.gameContainer = document.querySelector('.game-container');

  this.resize();
  window.addEventListener('resize', this.resize.bind(this));

  for(var i=0; i<150; i++) {
    this.particles.push(this.createParticle());
  }

  this.loop();
}

VisualEffectsManager.prototype.setSoundManager = function(soundManager) {
  this.soundManager = soundManager;
};

VisualEffectsManager.prototype.setGameProgress = function(maxTileValue) {
  var valCapped = Math.min(maxTileValue, 2048);
  this.progressFactor = Math.max(Math.log(valCapped) / Math.log(2), 1) / 11;
};

VisualEffectsManager.prototype.createParticle = function(x, y) {
  return {
    x: x !== undefined ? x : Math.random() * this.width,
    y: y !== undefined ? y : Math.random() * this.height,
    size: Math.random() * 2.5 + 0.5,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    life: Math.random() * 50,
    maxLife: 200 + Math.random() * 300,
    alphaBase: Math.random() * 0.4 + 0.1,
    hue: Math.floor(Math.random() * 60) + 200 // Blue/Purple range
  };
};

VisualEffectsManager.prototype.resize = function() {
  this.width = window.innerWidth;
  this.height = window.innerHeight;
  this.canvas.width = this.width;
  this.canvas.height = this.height;
};

VisualEffectsManager.prototype.triggerMove = function(direction) {
  // 0: up, 1: right, 2: down, 3: left
  var force = 12 * this.progressFactor;
  if(direction === 0) { this.targetVectors.x = 0; this.targetVectors.y = -force; }
  if(direction === 1) { this.targetVectors.x = force; this.targetVectors.y = 0; }
  if(direction === 2) { this.targetVectors.x = 0; this.targetVectors.y = force; }
  if(direction === 3) { this.targetVectors.x = -force; this.targetVectors.y = 0; }

  // Slight screen flash on move
  this.flashIntensity = Math.max(this.flashIntensity, 0.08 * this.progressFactor);

  // Aumentar la energía con cada movimiento, escalado por el progreso
  var energyAdd = 0.15 * this.progressFactor;
  var maxEnergy = 1.5 * this.progressFactor;
  this.energy = Math.min(this.energy + energyAdd, maxEnergy);
};

VisualEffectsManager.prototype.triggerMerge = function(value) {
  // Max cap at 2048 for intensity calc
  var valCapped = Math.min(value, 2048);
  var normalizedVal = Math.max((Math.log(valCapped) / Math.log(2)) / 11, 0.1);

  // Increase flash intensely based on merge value
  var flashAdd = (0.15 + (normalizedVal * 0.3)) * this.progressFactor;
  this.flashIntensity = Math.min(this.flashIntensity + flashAdd, 1 * this.progressFactor);

  // Aumentar energía fuertemente según el valor fusionado
  var energyAdd = (0.1 + (normalizedVal * 0.25)) * this.progressFactor;
  var maxEnergy = 1.5 * this.progressFactor;
  this.energy = Math.min(this.energy + energyAdd, maxEnergy);

  // Create an explosion of lively particles radiating from center
  var numExplosionParticles = Math.floor(10 * normalizedVal * this.progressFactor) + 3;
  for(var i=0; i<numExplosionParticles; i++) {
    var p = this.createParticle(this.width/2, this.height/2);
    var angle = Math.random() * Math.PI * 2;
    var speed = (Math.random() * 8 + 3) * normalizedVal;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.size = Math.random() * 6 * normalizedVal + 2;
    p.alphaBase = 0.8;
    p.hue = value > 128 ? (Math.random() * 60 + 300) : p.hue; // Shift to pink/magenta for high values
    this.particles.push(p);
  }
};

VisualEffectsManager.prototype.loop = function() {
  window.requestAnimationFrame(this.loop.bind(this));

  // Draw background with flash decay using standard alpha masking
  var bgAlpha = 0.3; // Leaves trails
  var currentBgR = Math.floor(this.baseColor.r + (255 - this.baseColor.r) * this.flashIntensity * 0.5);
  var currentBgG = Math.floor(this.baseColor.g + (255 - this.baseColor.g) * this.flashIntensity * 0.7);
  var currentBgB = Math.floor(this.baseColor.b + (255 - this.baseColor.b) * this.flashIntensity);

  this.ctx.fillStyle = 'rgba(' + currentBgR + ',' + currentBgG + ',' + currentBgB + ',' + bgAlpha + ')';
  this.ctx.fillRect(0, 0, this.width, this.height);

  // Decay forces
  this.flashIntensity *= 0.90;
  this.targetVectors.x *= 0.92;
  this.targetVectors.y *= 0.92;

  // Decaimiento natural de la energía (vuelve a idle)
  this.energy = Math.max(0, this.energy - 0.002);

  // Actualizar el pulso auditivo
  if (this.soundManager) {
    this.soundManager.setDroneEnergy(this.energy);
  }

  // Actualizar respiración del tablero (game-container)
  if (this.gameContainer) {
    // Frecuencia base de idle: 0.01. Con energía sube hasta ~0.08
    var breathingFreq = 0.01 + (this.energy * 0.05);
    this.breathingPhase += breathingFreq;

    // Amplitud del latido (scale)
    var amplitude = 0.002 + (this.energy * 0.01);
    var scale = 1.0 + Math.sin(this.breathingPhase) * amplitude;

    var rotateAmplitude = this.energy * 0.25; // Ligera rotación en alta energía
    var rotate = Math.cos(this.breathingPhase * 0.5) * rotateAmplitude;

    this.gameContainer.style.transform = 'scale(' + scale + ') rotate(' + rotate + 'deg)';
  }

  // Update & Draw particles
  for (var i = this.particles.length - 1; i >= 0; i--) {
    var p = this.particles[i];

    p.x += p.vx + this.targetVectors.x;
    p.y += p.vy + this.targetVectors.y;

    // Add some drag to velocity
    p.vx *= 0.98;
    p.vy *= 0.98;

    // Fuerzas de swirling (remolino) que se activan con la energía
    if (this.energy > 0.01) {
      var dx = (this.width / 2) - p.x;
      var dy = (this.height / 2) - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;

      var tx = -dy / dist;
      var ty = dx / dist;

      var swirlForce = this.energy * 0.15;
      p.vx += tx * swirlForce;
      p.vy += ty * swirlForce;

      // Ligera fuerza gravitacional al centro para evitar que escapen por el remolino
      var gravity = this.energy * 0.02;
      p.vx += (dx / dist) * gravity;
      p.vy += (dy / dist) * gravity;
    }

    // Wrap around screen
    if(p.x < 0) p.x = this.width;
    if(p.x > this.width) p.x = 0;
    if(p.y < 0) p.y = this.height;
    if(p.y > this.height) p.y = 0;

    p.life++;
    if(p.life > p.maxLife && this.particles.length > 150) {
      this.particles.splice(i, 1);
      continue;
    }

    // Twinkling effect
    var currentAlpha = p.alphaBase * (1 + Math.sin(p.life * 0.1) * 0.3);

    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    this.ctx.fillStyle = 'hsla(' + p.hue + ', 80%, 70%, ' + currentAlpha + ')';
    this.ctx.fill();
  }
};
