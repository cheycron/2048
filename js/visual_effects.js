/**
 * Visual Effects Manager - Handles particle system and background canvas effects
 * @param {EventBus} eventBus - Event bus for decoupled communication
 */
function VisualEffectsManager(eventBus) {
  this.canvas = document.getElementById('bg-canvas');
  if (!this.canvas) return;

  this.ctx = this.canvas.getContext('2d');
  this.particles = [];
  this.maxParticles = 300; // Maximum particles to prevent memory leak
  this.baseParticles = 150; // Base number of particles
  this.width = window.innerWidth;
  this.height = window.innerHeight;
  this.flashIntensity = 0;
  // Mission Critical: Start in deep space (orbital view)
  this.baseColor = { r: 5, g: 15, b: 35 }; // Darker, deeper space blue
  this.targetVectors = { x: 0, y: 0 };

  // Atmospheric reentry color progression
  this.colorPhases = {
    space: { r: 5, g: 15, b: 35 },        // Deep space blue (early game)
    thermosphere: { r: 25, g: 35, b: 65 }, // Upper atmosphere blue (mid-early)
    mesosphere: { r: 45, g: 45, b: 75 },   // Transition zone purple-blue (mid)
    stratosphere: { r: 85, g: 50, b: 45 }, // Heating up, orange tint (mid-late)
    ionization: { r: 145, g: 65, b: 25 },  // Plasma orange (late)
    reentry: { r: 180, g: 45, b: 15 }      // Critical heat red-orange (endgame)
  };

  this.energy = 0;
  this.progressFactor = 0.0; // Se ajusta basado en el máx tile (2048 => 1.0)
  this.breathingPhase = 0;
  this.gameOverShake = false; // Flag for continuous shake on game over
  this.radarPhase = 0; // Radar pulse phase
  this.radarRings = []; // Active radar ring animations
  this.heatDistortion = 0; // Heat distortion intensity
  this.milestoneFlash = 0; // Flash for milestones
  this.staticNoiseTimer = 0; // Timer for periodic static bursts
  this.staticIntensity = 0; // Current static noise intensity

  // Difficulty curve configuration - makes early game more relaxed
  this.difficultyConfig = {
    earlyGameCap: 0.15,     // Max 15% intensity until tile 64
    midGameCap: 0.40,       // Max 40% intensity until tile 256
    lateGameStart: 512,     // When intensity really ramps up
    exponentialPower: 2.5   // Higher = more gradual early, steeper late
  };
  this.eventBus = eventBus;
  this.gameContainer = document.querySelector('.game-container');

  this.resize();
  window.addEventListener('resize', this.resize.bind(this));

  for(var i=0; i<this.baseParticles; i++) {
    this.particles.push(this.createParticle());
  }

  // Subscribe to game events if eventBus is provided
  if (this.eventBus) {
    var self = this;
    this.eventBus.on('game:move', function(data) {
      self.triggerMove(data.direction);
    });
    this.eventBus.on('game:merge', function(data) {
      self.triggerMerge(data.value);
    });
    this.eventBus.on('game:over', function() {
      self.triggerGameOver();
    });
    this.eventBus.on('game:won', function() {
      self.triggerVictory();
    });
    this.eventBus.on('game:milestone', function(data) {
      self.triggerMilestone(data.value);
    });
  }

  // Bind loop once for better performance
  this.boundLoop = this.loop.bind(this);
  this.boundLoop();
}



/**
 * Update visual theme based on game progress
 * Uses TILE SUM as primary metric for smoother, more accurate progression
 * @param {number} maxTileValue - Highest tile value on board
 * @param {number} tileSum - Sum of all tiles on board
 */
VisualEffectsManager.prototype.setGameProgress = function(maxTileValue, tileSum) {
  // Use tile sum as primary progression metric
  // Typical game sums:
  //   Start: 4-20
  //   Early: 20-200
  //   Mid: 200-1000
  //   Late: 1000-2500
  //   Endgame: 2500-4000+
  //   Victory requires: 2048 + other tiles = ~3000-4000

  var sumCapped = Math.min(tileSum || 4, 4000);

  // Smooth progression from 0 to 1 based on sum
  // Using a custom curve that stays low early and ramps up late
  var normalizedSum = sumCapped / 4000; // 0 to 1 linear

  // Apply exponential curve for gradual start
  var progress = Math.pow(normalizedSum, this.difficultyConfig.exponentialPower);

  // Apply phase caps to keep early game calm
  if (sumCapped < 200) {
    // Early orbital phase: very calm
    this.progressFactor = Math.min(progress, this.difficultyConfig.earlyGameCap);
  } else if (sumCapped < 1000) {
    // De-orbit phase: building tension
    var blend = (sumCapped - 200) / 800; // 0 to 1 within this range
    var target = this.difficultyConfig.earlyGameCap +
      (this.difficultyConfig.midGameCap - this.difficultyConfig.earlyGameCap) * blend;
    this.progressFactor = Math.min(progress, target);
  } else {
    // Atmospheric entry: full progression
    this.progressFactor = progress;
  }

  // Use maxTile as a boost factor for dramatic moments
  // Having a 1024 tile should feel more intense than many small tiles summing to same
  if (maxTileValue >= 512) {
    var tileBoost = (Math.log(maxTileValue) / Math.log(2) - 8) * 0.08; // 512=0.08, 1024=0.16
    this.progressFactor = Math.min(1.0, this.progressFactor + tileBoost);
  }

  // Mission Critical: Atmospheric reentry color progression
  // Based on sum for smoother transitions
  var phase = this.colorPhases;
  var p = this.progressFactor;

  if (p < 0.1) {
    // Deep space: stable orbit
    var t = p / 0.1;
    this.baseColor = {
      r: Math.floor(phase.space.r + (phase.thermosphere.r - phase.space.r) * t),
      g: Math.floor(phase.space.g + (phase.thermosphere.g - phase.space.g) * t),
      b: Math.floor(phase.space.b + (phase.thermosphere.b - phase.space.b) * t)
    };
  } else if (p < 0.25) {
    // Upper atmosphere
    var t = (p - 0.1) / 0.15;
    this.baseColor = {
      r: Math.floor(phase.thermosphere.r + (phase.mesosphere.r - phase.thermosphere.r) * t),
      g: Math.floor(phase.thermosphere.g + (phase.mesosphere.g - phase.thermosphere.g) * t),
      b: Math.floor(phase.thermosphere.b + (phase.mesosphere.b - phase.thermosphere.b) * t)
    };
  } else if (p < 0.5) {
    // Heating begins
    var t = (p - 0.25) / 0.25;
    this.baseColor = {
      r: Math.floor(phase.mesosphere.r + (phase.stratosphere.r - phase.mesosphere.r) * t),
      g: Math.floor(phase.mesosphere.g + (phase.stratosphere.g - phase.mesosphere.g) * t),
      b: Math.floor(phase.mesosphere.b + (phase.stratosphere.b - phase.mesosphere.b) * t)
    };
  } else if (p < 0.75) {
    // Plasma ionization
    var t = (p - 0.5) / 0.25;
    this.baseColor = {
      r: Math.floor(phase.stratosphere.r + (phase.ionization.r - phase.stratosphere.r) * t),
      g: Math.floor(phase.stratosphere.g + (phase.ionization.g - phase.stratosphere.g) * t),
      b: Math.floor(phase.stratosphere.b + (phase.ionization.b - phase.stratosphere.b) * t)
    };
  } else {
    // Critical reentry heat
    var t = (p - 0.75) / 0.25;
    this.baseColor = {
      r: Math.floor(phase.ionization.r + (phase.reentry.r - phase.ionization.r) * t),
      g: Math.floor(phase.ionization.g + (phase.reentry.g - phase.ionization.g) * t),
      b: Math.floor(phase.ionization.b + (phase.reentry.b - phase.ionization.b) * t)
    };
  }
};

/**
 * Create a new particle with random properties
 * Mission Critical: Particles represent space debris, then atmospheric plasma
 * @param {number} x - X position (optional, random if not provided)
 * @param {number} y - Y position (optional, random if not provided)
 * @returns {object} Particle object
 */
VisualEffectsManager.prototype.createParticle = function(x, y) {
  // Particle color based on current game phase (atmospheric layer)
  var hue;
  if (this.progressFactor < 0.2) {
    hue = Math.floor(Math.random() * 40) + 200; // Blue-cyan (space stars)
  } else if (this.progressFactor < 0.4) {
    hue = Math.floor(Math.random() * 40) + 220; // Blue-purple (upper atmosphere)
  } else if (this.progressFactor < 0.65) {
    hue = Math.floor(Math.random() * 30) + 20; // Orange-yellow (plasma forming)
  } else {
    hue = Math.floor(Math.random() * 20) + 0; // Red-orange (critical heat)
  }

  return {
    x: x !== undefined ? x : Math.random() * this.width,
    y: y !== undefined ? y : Math.random() * this.height,
    size: Math.random() * 2.5 + 0.5,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    life: Math.random() * 50,
    maxLife: 200 + Math.random() * 300,
    alphaBase: Math.random() * 0.4 + 0.1,
    hue: hue
  };
};

/**
 * Resize canvas to match window dimensions
 */
VisualEffectsManager.prototype.resize = function() {
  this.width = window.innerWidth;
  this.height = window.innerHeight;
  this.canvas.width = this.width;
  this.canvas.height = this.height;
};

/**
 * Trigger visual effects for tile movement
 * @param {number} direction - Movement direction (0: up, 1: right, 2: down, 3: left)
 */
VisualEffectsManager.prototype.triggerMove = function(direction) {
  // 0: up, 1: right, 2: down, 3: left
  // Base force is always present, scaled force adds intensity
  var baseForce = 2; // Always have some effect
  var scaledForce = 10 * this.progressFactor;
  var force = baseForce + scaledForce;

  if(direction === 0) { this.targetVectors.x = 0; this.targetVectors.y = -force; }
  if(direction === 1) { this.targetVectors.x = force; this.targetVectors.y = 0; }
  if(direction === 2) { this.targetVectors.x = 0; this.targetVectors.y = force; }
  if(direction === 3) { this.targetVectors.x = -force; this.targetVectors.y = 0; }

  // Slight screen flash on move - minimal in early game
  var baseFlash = 0.02; // Subtle base flash
  var scaledFlash = 0.12 * this.progressFactor;
  this.flashIntensity = Math.max(this.flashIntensity, baseFlash + scaledFlash);

  // Aumentar la energía con cada movimiento - más conservador en early game
  var baseEnergyAdd = 0.05; // Small base increase
  var scaledEnergyAdd = 0.25 * this.progressFactor;
  var energyAdd = baseEnergyAdd + scaledEnergyAdd;

  // Max energy scales less aggressively
  var maxEnergy = 0.8 + (this.progressFactor * 2.2); // Starts lower, ends similar
  this.energy = Math.min(this.energy + energyAdd, maxEnergy);
};

/**
 * Trigger milestone visual effects when reaching power-of-2 tiles
 * @param {number} value - Tile value (64, 128, 256, etc.)
 */
VisualEffectsManager.prototype.triggerMilestone = function(value) {
  var self = this;

  // Brief bright flash
  this.milestoneFlash = 0.3 + (Math.log(value) / Math.log(2)) * 0.05;

  // Spawn a ring of particles from center in the tile's color
  var numParticles = Math.min(20, 10 + Math.floor(value / 64));
  var availableSlots = this.maxParticles - this.particles.length;
  numParticles = Math.min(numParticles, availableSlots);

  for (var i = 0; i < numParticles; i++) {
    var angle = (i / numParticles) * Math.PI * 2;
    var p = this.createParticle(this.width / 2, this.height / 2);
    var speed = 3 + (value / 256) * 4;

    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.size = 2 + (value / 512) * 3;
    p.alphaBase = 0.6;
    p.maxLife = 80 + Math.random() * 60;

    // Color matches the tile progression
    if (value >= 512) {
      p.hue = Math.random() * 15 + 5; // Orange-red
    } else if (value >= 128) {
      p.hue = Math.random() * 30 + 260; // Purple-magenta
    } else {
      p.hue = Math.random() * 30 + 210; // Blue
    }

    this.particles.push(p);
  }

  // Apply heat distortion for high tiles
  if (value >= 256) {
    this.heatDistortion = Math.min(1, (value / 2048) * 1.5);
  }
};

/**
 * Trigger victory celebration when game is won
 * Mission Critical: Safe splashdown in the Pacific Ocean
 */
VisualEffectsManager.prototype.triggerVictory = function() {
  var self = this;

  // Calm, gentle flash (not aggressive)
  this.flashIntensity = 0.8;

  // Energy drops to calm state
  this.energy = 0.3;

  // Change background to ocean blue immediately
  this.baseColor = { r: 20, g: 100, b: 180 }; // Deep ocean blue

  // Transition to lighter sky blue over time
  var transitionSteps = 60; // 1 second at 60fps
  var currentStep = 0;
  var transitionInterval = setInterval(function() {
    currentStep++;
    var progress = currentStep / transitionSteps;

    // Fade from deep blue to light sky blue
    self.baseColor.r = Math.floor(20 + (135 * progress)); // 20 -> 155 (light blue)
    self.baseColor.g = Math.floor(100 + (105 * progress)); // 100 -> 205
    self.baseColor.b = Math.floor(180 + (35 * progress)); // 180 -> 215

    if (currentStep >= transitionSteps) {
      clearInterval(transitionInterval);
    }
  }, 16);

  // Create celebratory particles - like water splash and bubbles
  var celebrationWaves = 3;
  var particlesPerWave = 50;

  for (var wave = 0; wave < celebrationWaves; wave++) {
    setTimeout(function(waveIndex) {
      var availableSlots = self.maxParticles - self.particles.length;
      var particlesToAdd = Math.min(particlesPerWave, availableSlots);

      for (var i = 0; i < particlesToAdd; i++) {
        var p = self.createParticle(self.width / 2, self.height / 2);
        var angle = Math.random() * Math.PI * 2;
        var speed = (Math.random() * 8 + 3) * (1 - waveIndex * 0.2); // Gentler each wave

        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - (Math.random() * 3 + 2); // Upward bias (splash)
        p.size = Math.random() * 6 + 2;
        p.alphaBase = 0.7;

        // Ocean colors: cyan, light blue, white (water/foam)
        var colorChoice = Math.random();
        if (colorChoice < 0.4) {
          p.hue = Math.random() * 20 + 180; // Cyan-blue
        } else if (colorChoice < 0.7) {
          p.hue = Math.random() * 20 + 200; // Light blue
        } else {
          p.hue = Math.random() * 20 + 50; // Yellow-white (sunlight on water)
        }

        p.maxLife = 120 + Math.random() * 180;

        self.particles.push(p);
      }
    }, wave * 200, wave);
  }

  // Add gentle floating particles (like mist/spray)
  setTimeout(function() {
    for (var i = 0; i < 30; i++) {
      var p = self.createParticle(
        Math.random() * self.width,
        self.height * 0.7 + Math.random() * self.height * 0.3 // Bottom third
      );

      p.vx = (Math.random() - 0.5) * 2;
      p.vy = -(Math.random() * 2 + 1); // Slowly rise (mist)
      p.size = Math.random() * 4 + 1;
      p.alphaBase = 0.4;
      p.hue = Math.random() * 30 + 190; // Blue-cyan
      p.maxLife = 200 + Math.random() * 300;

      self.particles.push(p);
    }
  }, 600);

  // No screen shake - peaceful landing
  this.gameOverShake = false;

  // Trigger victory sound
  if (self.eventBus) {
    self.eventBus.emit('game:victoryAchieved');
  }
};

/**
 * Trigger catastrophic explosion when game is lost
 * Mission Critical: The ship disintegrates in the atmosphere
 */
VisualEffectsManager.prototype.triggerGameOver = function() {
  var self = this;

  // Mark the time for shake decay
  this.gameOverTime = Date.now();

  // Massive flash
  this.flashIntensity = 3.0;

  // Maximum energy spike
  this.energy = 5.0;

  // Change background to explosion colors immediately
  this.baseColor = { r: 255, g: 80, b: 0 }; // Bright orange-red

  // Create massive particle explosion from center
  var explosionWaves = 5; // Multiple waves of explosions
  var particlesPerWave = 80;

  for (var wave = 0; wave < explosionWaves; wave++) {
    setTimeout(function(waveIndex) {
      // Calculate how many particles we can add
      var availableSlots = self.maxParticles - self.particles.length;
      var particlesToAdd = Math.min(particlesPerWave, availableSlots);

      for (var i = 0; i < particlesToAdd; i++) {
        var p = self.createParticle(self.width / 2, self.height / 2);
        var angle = Math.random() * Math.PI * 2;
        var speed = (Math.random() * 20 + 10) * (1 + waveIndex * 0.3); // Faster each wave

        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.size = Math.random() * 15 + 3; // Larger particles
        p.alphaBase = 1.0; // Full brightness

        // Explosion colors: red, orange, yellow, white
        var colorChoice = Math.random();
        if (colorChoice < 0.3) {
          p.hue = Math.random() * 20; // Red
        } else if (colorChoice < 0.6) {
          p.hue = Math.random() * 20 + 20; // Orange
        } else if (colorChoice < 0.85) {
          p.hue = Math.random() * 20 + 40; // Yellow
        } else {
          p.hue = 0; // White (will be adjusted in rendering)
          p.alphaBase = 1.5; // Extra bright for white flash
        }

        p.maxLife = 150 + Math.random() * 200; // Longer life for debris

        self.particles.push(p);
      }
    }, wave * 150, wave); // Stagger waves by 150ms
  }

  // Screen shake that doesn't stop
  this.gameOverShake = true;

  // Trigger catastrophic sound
  if (self.eventBus) {
    self.eventBus.emit('game:catastrophicFailure');
  }
};

/**
 * Trigger visual effects for tile merge (particle explosion)
 * @param {number} value - Merged tile value
 */
VisualEffectsManager.prototype.triggerMerge = function(value) {
  // Max cap at 2048 for intensity calc
  var valCapped = Math.min(value, 2048);
  var normalizedVal = Math.max((Math.log(valCapped) / Math.log(2)) / 11, 0.1);

  // Flash intensity - more conservative early game
  var baseFlash = 0.1 + (normalizedVal * 0.2); // Base flash from tile value
  var progressBonus = this.progressFactor * 0.3; // Progress adds less bonus
  var flashAdd = baseFlash * (1 + progressBonus);
  this.flashIntensity = Math.min(this.flashIntensity + flashAdd, 0.8 + (this.progressFactor * 0.6));

  // Energy increase - gentler in early game
  var baseEnergyAdd = 0.15 + (normalizedVal * 0.25);
  var energyAdd = baseEnergyAdd * (1 + (this.progressFactor * 0.7));
  var maxEnergy = 0.8 + (this.progressFactor * 2.2); // Same as triggerMove
  this.energy = Math.min(this.energy + energyAdd, maxEnergy);

  // Particle count - much more conservative in early/mid game
  var baseParticles = 8; // Minimum particles
  var scaledParticles = Math.floor(12 * normalizedVal * (0.5 + this.progressFactor * 0.5));
  var numExplosionParticles = baseParticles + scaledParticles;

  // Only double particles for huge tiles in late game
  if (value >= 512 && this.progressFactor > 0.6) {
    numExplosionParticles *= 1.5; // Less aggressive than 2x
  }

  // Limit total particles to prevent memory leak
  var particlesToAdd = Math.min(numExplosionParticles, this.maxParticles - this.particles.length);

  for(var i=0; i<particlesToAdd; i++) {
    var p = this.createParticle(this.width/2, this.height/2);
    var angle = Math.random() * Math.PI * 2;
    var speed = (Math.random() * 12 + 4) * normalizedVal * (1 + this.progressFactor);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.size = Math.random() * 8 * normalizedVal + 2;
    p.alphaBase = 0.8;

    // Mission Critical: Particle colors represent heat intensity during merge
    if (value >= 512) {
      p.hue = Math.random() * 20 + 0; // Intense red-orange (critical reentry heat)
    } else if (value >= 256) {
      p.hue = Math.random() * 30 + 20; // Orange-yellow (ionization plasma)
    } else if (value >= 128) {
      p.hue = Math.random() * 40 + 200; // Blue-purple (atmospheric friction)
    } else {
      p.hue = Math.random() * 50 + 190; // Cyan-blue (minor corrections)
    }

    this.particles.push(p);
  }
};

/**
 * Main animation loop - updates and renders all visual effects
 */
VisualEffectsManager.prototype.loop = function() {
  window.requestAnimationFrame(this.boundLoop);

  // Draw background with flash decay using standard alpha masking
  var bgAlpha = 0.3; // Leaves trails
  var currentBgR = Math.floor(this.baseColor.r + (255 - this.baseColor.r) * this.flashIntensity * 0.5);
  var currentBgG = Math.floor(this.baseColor.g + (255 - this.baseColor.g) * this.flashIntensity * 0.7);
  var currentBgB = Math.floor(this.baseColor.b + (255 - this.baseColor.b) * this.flashIntensity);

  this.ctx.fillStyle = 'rgba(' + currentBgR + ',' + currentBgG + ',' + currentBgB + ',' + bgAlpha + ')';
  this.ctx.fillRect(0, 0, this.width, this.height);

  // Decay forces
  this.flashIntensity *= 0.90;
  this.milestoneFlash *= 0.92;
  this.heatDistortion *= 0.995; // Very slow decay for sustained heat effect
  this.targetVectors.x *= 0.92;
  this.targetVectors.y *= 0.92;

  // Apply milestone flash as white overlay
  if (this.milestoneFlash > 0.01) {
    this.ctx.fillStyle = 'rgba(255, 255, 255, ' + (this.milestoneFlash * 0.15) + ')';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  // Heat distortion shimmer - wavy horizontal lines
  if (this.heatDistortion > 0.05 && this.progressFactor > 0.3) {
    var heatAlpha = this.heatDistortion * 0.08;
    var waveTime = Date.now() * 0.003;

    for (var h = 0; h < this.height; h += 12) {
      var offset = Math.sin(waveTime + h * 0.05) * this.heatDistortion * 3;
      this.ctx.fillStyle = 'rgba(255, 120, 50, ' + (heatAlpha * (0.5 + Math.sin(h * 0.1 + waveTime) * 0.5)) + ')';
      this.ctx.fillRect(offset, h, this.width, 1);
    }
  }

  // Decaimiento natural de la energía (vuelve a idle)
  this.energy = Math.max(0, this.energy - 0.002);

  // Radar pulse system
  this.radarPhase += 0.015 + (this.progressFactor * 0.03); // Faster with progress

  if (Math.sin(this.radarPhase) > 0.98 && this.radarRings.length < 3) {
    // Spawn a new radar ring
    this.radarRings.push({ radius: 0, alpha: 0.4 + (this.progressFactor * 0.3), maxRadius: Math.max(this.width, this.height) * 0.7 });
  }

  // Periodic radio static bursts (more frequent as game progresses)
  this.staticNoiseTimer += 0.01 + (this.progressFactor * 0.02);
  if (this.staticIntensity > 0) {
    this.staticIntensity *= 0.9;

    // Draw scanlines with noise
    if (this.staticIntensity > 0.02) {
      for (var s = 0; s < this.height; s += 4) {
        if (Math.random() < this.staticIntensity * 0.5) {
          var noiseAlpha = Math.random() * this.staticIntensity * 0.15;
          this.ctx.fillStyle = 'rgba(180, 220, 255, ' + noiseAlpha + ')';
          this.ctx.fillRect(0, s, this.width, 1);
        }
      }
    }
  }
  // Trigger random static burst
  if (Math.sin(this.staticNoiseTimer) > 0.995 && this.progressFactor > 0.15) {
    this.staticIntensity = 0.3 + (this.progressFactor * 0.5);
  }

  // Draw radar rings
  for (var r = this.radarRings.length - 1; r >= 0; r--) {
    var ring = this.radarRings[r];
    ring.radius += 3 + (this.progressFactor * 4); // Expand speed
    ring.alpha *= 0.98; // Fade out

    if (ring.alpha < 0.01 || ring.radius > ring.maxRadius) {
      this.radarRings.splice(r, 1);
      continue;
    }

    // Draw ring
    this.ctx.beginPath();
    this.ctx.arc(this.width / 2, this.height / 2, ring.radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'hsla(' + (200 - (this.progressFactor * 180)) + ', 80%, 60%, ' + ring.alpha + ')';
    this.ctx.lineWidth = 1.5 + (this.progressFactor * 1.5);
    this.ctx.stroke();
  }

  // Emit energy update event for sound manager
  if (this.eventBus) {
    this.eventBus.emit('game:energyUpdate', { energy: this.energy });
  }

  // Actualizar respiración del tablero (game-container)
  if (this.gameContainer) {
    // Frecuencia base de idle: 0.01. Con energía sube más gradualmente
    var breathingFreq = 0.01 + (this.energy * 0.05);
    this.breathingPhase += breathingFreq;

    // Amplitud del latido (scale) - más sutil en general
    var amplitude = 0.001 + (this.energy * 0.010);
    var scale = 1.0 + Math.sin(this.breathingPhase) * amplitude;

    // Rotación más sutil
    var rotateAmplitude = this.energy * 0.2; // Reducido de 0.35
    var rotate = Math.cos(this.breathingPhase * 0.5) * rotateAmplitude;

    // Efecto de sacudida de pantalla (Screen Shake)
    var shakeX = 0;
    var shakeY = 0;

    if (this.gameOverShake) {
      // Catastrophic shake - violent and continuous
      var baseShake = 15;
      var decay = Math.max(0, 1 - (Date.now() - (this.gameOverTime || Date.now())) / 3000); // Decay over 3 seconds
      var shakeForce = baseShake * decay;
      shakeX = (Math.random() - 0.5) * shakeForce * 2;
      shakeY = (Math.random() - 0.5) * shakeForce * 2;

      // Add rotation shake
      rotateAmplitude = Math.random() * 5 * decay; // Random violent rotation
    } else if (this.energy > 1.8) { // Normal high energy shake
      var shakeForce = (this.energy - 1.8) * 3;
      shakeX = (Math.random() - 0.5) * shakeForce;
      shakeY = (Math.random() - 0.5) * shakeForce;
    }

    this.gameContainer.style.transform = 'translate(' + shakeX + 'px, ' + shakeY + 'px) scale(' + scale + ') rotate(' + rotate + 'deg)';
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
    // Solo se activan con energía significativa para mantener calma inicial
    if (this.energy > 0.15) {
      var dx = (this.width / 2) - p.x;
      var dy = (this.height / 2) - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;

      var tx = -dy / dist;
      var ty = dx / dist;

      // Swirl force reducido y escalado por energía
      var swirlForce = (this.energy - 0.15) * 0.18; // Más suave
      p.vx += tx * swirlForce;
      p.vy += ty * swirlForce;

      // Gravedad al centro también más suave
      var gravity = (this.energy - 0.15) * 0.025;
      p.vx += (dx / dist) * gravity;
      p.vy += (dy / dist) * gravity;
    }

    // Wrap around screen
    if(p.x < 0) p.x = this.width;
    if(p.x > this.width) p.x = 0;
    if(p.y < 0) p.y = this.height;
    if(p.y > this.height) p.y = 0;

    p.life++;
    if(p.life > p.maxLife && this.particles.length > this.baseParticles) {
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

/**
 * Reset all visual effects to initial state
 * Called when starting a new game
 */
VisualEffectsManager.prototype.resetEffects = function() {
  // Reset all state variables
  this.energy = 0;
  this.progressFactor = 0;
  this.flashIntensity = 0;
  this.milestoneFlash = 0;
  this.heatDistortion = 0;
  this.staticIntensity = 0;
  this.gameOverShake = false;
  this.breathingPhase = 0;
  this.radarPhase = 0;
  this.staticNoiseTimer = 0;

  // Reset colors to initial space blue
  this.baseColor = { r: 5, g: 15, b: 35 };

  // Reset vectors
  this.targetVectors = { x: 0, y: 0 };

  // Clear radar rings
  this.radarRings = [];

  // Reset particles to base amount
  while (this.particles.length > this.baseParticles) {
    this.particles.pop();
  }

  // Recreate base particles
  while (this.particles.length < this.baseParticles) {
    this.particles.push(this.createParticle());
  }

  // Reset game container transform
  if (this.gameContainer) {
    this.gameContainer.style.transform = '';
  }
};
