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

  this.resize();
  window.addEventListener('resize', this.resize.bind(this));

  for(var i=0; i<150; i++) {
    this.particles.push(this.createParticle());
  }

  this.loop();
}

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
  var force = 12;
  if(direction === 0) { this.targetVectors.x = 0; this.targetVectors.y = -force; }
  if(direction === 1) { this.targetVectors.x = force; this.targetVectors.y = 0; }
  if(direction === 2) { this.targetVectors.x = 0; this.targetVectors.y = force; }
  if(direction === 3) { this.targetVectors.x = -force; this.targetVectors.y = 0; }

  // Slight screen flash on move
  this.flashIntensity = Math.max(this.flashIntensity, 0.08);
};

VisualEffectsManager.prototype.triggerMerge = function(value) {
  // Max cap at 2048 for intensity calc
  var valCapped = Math.min(value, 2048);
  var normalizedVal = Math.max((Math.log(valCapped) / Math.log(2)) / 11, 0.1);

  // Increase flash intensely based on merge value
  this.flashIntensity = Math.min(this.flashIntensity + 0.3 + (normalizedVal * 0.6), 1);

  // Create an explosion of lively particles radiating from center
  var numExplosionParticles = Math.floor(20 * normalizedVal) + 5;
  for(var i=0; i<numExplosionParticles; i++) {
    var p = this.createParticle(this.width/2, this.height/2);
    var angle = Math.random() * Math.PI * 2;
    var speed = (Math.random() * 15 + 5) * normalizedVal;
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

  // Update & Draw particles
  for (var i = this.particles.length - 1; i >= 0; i--) {
    var p = this.particles[i];

    p.x += p.vx + this.targetVectors.x;
    p.y += p.vy + this.targetVectors.y;

    // Add some drag to velocity
    p.vx *= 0.98;
    p.vy *= 0.98;

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
