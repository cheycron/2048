/**
 * Sound Manager - Handles all audio synthesis and playback
 * @param {EventBus} eventBus - Event bus for decoupled communication
 */
function SoundManager(eventBus) {
  this.audioCtx = null;
  this.initialized = false;
  this.masterGain = null;
  this.droneOsc = null;
  this.droneLfo = null;
  this.droneGain = null;
  this.cleanGain = null;
  this.distortGain = null;
  this.eventBus = eventBus;

  // Subscribe to game events if eventBus is provided
  if (this.eventBus) {
    var self = this;
    this.eventBus.on('game:move', function(data) {
      self.playMove(data.direction);
    });
    this.eventBus.on('game:merge', function(data) {
      self.playMerge(data.value);
    });
    this.eventBus.on('game:energyUpdate', function(data) {
      self.setDroneEnergy(data.energy);
    });
    this.eventBus.on('game:catastrophicFailure', function() {
      self.playCatastrophicFailure();
    });
    this.eventBus.on('game:victoryAchieved', function() {
      self.playVictory();
    });
    this.eventBus.on('oxygen:alert', function(data) {
      self.playOxygenAlert(data.level);
    });
    this.eventBus.on('game:milestone', function(data) {
      self.playRadioChatter(data.value);
    });
  }
}

/**
 * Create a distortion curve for the waveshaper
 * @param {number} amount - Distortion intensity
 * @returns {Float32Array} Distortion curve
 */
SoundManager.prototype.makeDistortionCurve = function(amount) {
  var k = amount;
  var n_samples = 44100;
  var curve = new Float32Array(n_samples);
  var deg = Math.PI / 180;
  var x;
  for (var i = 0; i < n_samples; ++i) {
    x = i * 2 / n_samples - 1;
    curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
  }
  return curve;
};

/**
 * Initialize the Web Audio API context and audio nodes
 */
SoundManager.prototype.init = function() {
  if (this.initialized) return;

  var AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    console.warn('Web Audio API not supported in this browser');
    return;
  }

  try {
    this.audioCtx = new AudioContext();
  } catch (e) {
    console.error('Failed to create AudioContext:', e);
    return;
  }

  // Nodos para saturación/distorsión paralela
  this.cleanGain = this.audioCtx.createGain();
  this.distortGain = this.audioCtx.createGain();
  this.cleanGain.gain.value = 1.0;
  this.distortGain.gain.value = 0.0;

  var distortionNode = this.audioCtx.createWaveShaper();
  distortionNode.curve = this.makeDistortionCurve(100); // Curva de distorsión intensa
  distortionNode.oversample = '4x';

  this.masterGain = this.audioCtx.createGain();
  this.masterGain.gain.value = 0.6; // Base global volume

  this.masterGain.connect(this.cleanGain);
  this.masterGain.connect(distortionNode);
  distortionNode.connect(this.distortGain);

  try {
    this.cleanGain.connect(this.audioCtx.destination);
    this.distortGain.connect(this.audioCtx.destination);

    this.startDrone();
    this.initialized = true;
  } catch (e) {
    console.error('Failed to initialize audio nodes:', e);
    this.cleanup();
  }
};

/**
 * Cleanup audio resources in case of error
 */
SoundManager.prototype.cleanup = function() {
  try {
    if (this.droneOsc) this.droneOsc.stop();
    if (this.droneLfo) this.droneLfo.stop();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  } catch (e) {
    console.error('Error during audio cleanup:', e);
  }
  this.initialized = false;
  this.audioCtx = null;
};

/**
 * Start the ambient drone sound that pulses with game energy
 */
SoundManager.prototype.startDrone = function() {
  if (!this.audioCtx) return;

  try {

  // A low pulsating ambient drone
  this.droneOsc = this.audioCtx.createOscillator();
  this.droneOsc.type = 'sine';
  this.droneOsc.frequency.value = 55; // A1

  var droneLfo = this.audioCtx.createOscillator();
  droneLfo.type = 'sine';
  droneLfo.frequency.value = 0.2; // 0.2 Hz pulsation
  this.droneLfo = droneLfo;

  var droneGain = this.audioCtx.createGain();
  droneGain.gain.value = 0.15;
  this.droneGain = droneGain;

  var lfoGain = this.audioCtx.createGain();
  lfoGain.gain.value = 0.08;

  droneLfo.connect(lfoGain);
  lfoGain.connect(droneGain.gain);

  this.droneOsc.connect(droneGain);
  droneGain.connect(this.masterGain);

    this.droneOsc.start();
    droneLfo.start();
  } catch (e) {
    console.error('Failed to start drone:', e);
  }
};

/**
 * Update drone parameters based on game energy level
 * Uses more gradual progression for relaxed early game
 * @param {number} energy - Energy level (0 = calm, higher = intense)
 */
SoundManager.prototype.setDroneEnergy = function(energy) {
  if (!this.initialized || !this.audioCtx || !this.droneLfo || !this.droneGain || !this.droneOsc) return;

  try {
  var cappedEnergy = Math.min(Math.max(energy, 0), 3.0);

  // LFO frequency: much more gradual progression
  // Idle: 0.2Hz (calm breathing)
  // Low energy (0-0.5): 0.2-0.5Hz (still calm)
  // Mid energy (0.5-1.5): 0.5-2.0Hz (getting excited)
  // High energy (1.5-3.0): 2.0-5.0Hz (intense)
  var targetLfoFreq;
  if (cappedEnergy < 0.5) {
    targetLfoFreq = 0.2 + (cappedEnergy * 0.6); // Very gradual early
  } else if (cappedEnergy < 1.5) {
    targetLfoFreq = 0.5 + ((cappedEnergy - 0.5) * 1.5); // Moderate mid
  } else {
    targetLfoFreq = 2.0 + ((cappedEnergy - 1.5) * 2.0); // Intense late
  }
  this.droneLfo.frequency.setTargetAtTime(targetLfoFreq, this.audioCtx.currentTime, 0.15);

  // Volume: more conservative progression
  var targetGain = 0.12 + (cappedEnergy * 0.12); // Max 0.48 instead of 0.65
  this.droneGain.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.15);

  // Base frequency: gentler pitch rise
  var baseFreq = 55 + (cappedEnergy * 12); // Max +36Hz instead of +50Hz
  this.droneOsc.frequency.setTargetAtTime(baseFreq, this.audioCtx.currentTime, 0.15);

  // Distortion: only kicks in at much higher energy
  if (this.cleanGain && this.distortGain) {
    var distortionThreshold = 1.5; // Was 0.8, now much higher
    if (cappedEnergy > distortionThreshold) {
      var wet = Math.min((cappedEnergy - distortionThreshold) / 1.5, 1);
      this.distortGain.gain.setTargetAtTime(wet * 0.3, this.audioCtx.currentTime, 0.3); // Max 30%
      this.cleanGain.gain.setTargetAtTime(1.0 - (wet * 0.15), this.audioCtx.currentTime, 0.3);
    } else {
      // Smoothly return to clean when below threshold
      this.distortGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.3);
      this.cleanGain.gain.setTargetAtTime(1.0, this.audioCtx.currentTime, 0.3);
    }
  }
  } catch (e) {
    console.error('Error setting drone energy:', e);
  }
};

/**
 * Play a sound for tile movement
 * @param {number} direction - Movement direction (0-3)
 */
SoundManager.prototype.playMove = function(direction) {
  if (!this.initialized || !this.audioCtx) return;

  try {

  var osc = this.audioCtx.createOscillator();
  osc.type = 'sine'; // Softer than triangle for subtle moves

  // Use direction to slightly vary pitch - lower and more subtle
  var basePitch = 380 + (direction * 35); // Lower base, smaller variation
  osc.frequency.setValueAtTime(basePitch, this.audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(basePitch * 1.3, this.audioCtx.currentTime + 0.08);

  var gain = this.audioCtx.createGain();
  gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime); // Quieter: 0.05 instead of 0.08
  gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.08);
  } catch (e) {
    console.error('Error playing move sound:', e);
  }
};

/**
 * Play a chord/arpeggio for tile merge based on value
 * More conservative early game, epic late game
 * @param {number} value - Merged tile value (2, 4, 8, etc.)
 */
SoundManager.prototype.playMerge = function(value) {
  if (!this.initialized || !this.audioCtx) return;

  try {

  // Calculate base frequency based on value (using log2)
  var power = Math.log(value) / Math.log(2);
  // Base frequency - slightly lower and more pleasant
  var baseFreq = 200 * Math.pow(1.059463, (power - 1) * 3);

  // Start with simple intervals for low values
  var freqs = [baseFreq];

  // Add harmonics based on tile value - more gradual
  if (value >= 8) {
    freqs.push(baseFreq * 1.5); // Fifth - added early for richness
  }
  if (value >= 16) {
    freqs.push(baseFreq * 1.25); // Major third
  }
  if (value >= 64) {
    freqs.push(baseFreq * 2); // Octave
  }
  if (value >= 256) {
    freqs.push(baseFreq * 0.5); // Sub bass - only in mid-late game
  }
  if (value >= 512) {
    freqs.push(baseFreq * 3); // High harmonic
  }
  if (value >= 1024) {
    freqs.push(baseFreq * 4); // Very high octave
    freqs.push(baseFreq * 1.5 * 2); // Higher fifth
  }

  var self = this;
  freqs.forEach(function(f, i) {
    try {
      var osc = self.audioCtx.createOscillator();
      // More gradual waveform progression
      if (value >= 1024) {
        osc.type = (i % 2 === 0) ? 'sawtooth' : 'square';
      } else if (value >= 256) {
        osc.type = 'sawtooth'; // Richer sound for mid-high tiles
      } else if (value >= 64) {
        osc.type = 'triangle'; // Warmer than sine, less harsh than sawtooth
      } else {
        osc.type = 'sine'; // Soft and pleasant for early game
      }

      // Add a slight detune based on index for richness
      osc.frequency.setValueAtTime(f + (i*2), self.audioCtx.currentTime);

      var gain = self.audioCtx.createGain();
      gain.gain.setValueAtTime(0, self.audioCtx.currentTime);
      // Volume scales with tile value but more conservatively
      var peakGain = 0.08 / freqs.length; // Quieter overall: 0.08 instead of 0.12
      if (value >= 256) peakGain *= 1.3; // Slight boost for high tiles
      gain.gain.linearRampToValueAtTime(peakGain, self.audioCtx.currentTime + 0.04);

      // Decay time progression more gradual
      var decayTime = 0.25; // Base decay
      if (value >= 32) decayTime = 0.4;
      if (value >= 128) decayTime = 0.6;
      if (value >= 512) decayTime = 1.0;
      if (value >= 1024) decayTime = 1.4; // Epic but not too long

      gain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + decayTime);

      // Lowpass filter to keep things pleasant
      var filter = self.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      // Filter opens more gradually
      var filterFreq = 800 + (power * 250); // More conservative base
      if (value >= 256) filterFreq += 800; // Brighter for high tiles
      if (value >= 512) filterFreq += 1000; // Very bright for huge tiles
      filter.frequency.setValueAtTime(Math.min(filterFreq, 5000), self.audioCtx.currentTime);

      // Add resonance for high tiles to make them more special
      if (value >= 512) {
        filter.Q.setValueAtTime(2 + (power * 0.3), self.audioCtx.currentTime);
      }

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(self.masterGain);

      osc.start();
      osc.stop(self.audioCtx.currentTime + decayTime + 0.1);
    } catch (e) {
      console.error('Error creating merge oscillator:', e);
    }
  });
  } catch (e) {
    console.error('Error playing merge sound:', e);
  }
};

/**
 * Play catastrophic failure sound - ship explosion
 * Mission Critical: Multiple layers of explosion, chaos, and destruction
 */
SoundManager.prototype.playCatastrophicFailure = function() {
  if (!this.initialized || !this.audioCtx) return;

  try {
    var self = this;

    // Stop the drone for dramatic effect
    if (this.droneOsc) {
      this.droneOsc.frequency.exponentialRampToValueAtTime(20, this.audioCtx.currentTime + 0.5);
      this.droneGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);
    }

    // Layer 1: Deep bass rumble (explosion)
    var bass = this.audioCtx.createOscillator();
    bass.type = 'sawtooth';
    bass.frequency.setValueAtTime(40, this.audioCtx.currentTime);
    bass.frequency.exponentialRampToValueAtTime(20, this.audioCtx.currentTime + 2);

    var bassGain = this.audioCtx.createGain();
    bassGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    bassGain.gain.linearRampToValueAtTime(0.3, this.audioCtx.currentTime + 0.1);
    bassGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 3);

    bass.connect(bassGain);
    bassGain.connect(this.masterGain);
    bass.start();
    bass.stop(this.audioCtx.currentTime + 3);

    // Layer 2: Mid-range chaos (metal tearing, alarms)
    for (var i = 0; i < 8; i++) {
      (function(index) {
        setTimeout(function() {
          var chaos = self.audioCtx.createOscillator();
          chaos.type = 'square';
          var freq = 100 + Math.random() * 400;
          chaos.frequency.setValueAtTime(freq, self.audioCtx.currentTime);
          chaos.frequency.exponentialRampToValueAtTime(freq * 0.3, self.audioCtx.currentTime + 0.5);

          var chaosGain = self.audioCtx.createGain();
          chaosGain.gain.setValueAtTime(0.15, self.audioCtx.currentTime);
          chaosGain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.5);

          chaos.connect(chaosGain);
          chaosGain.connect(self.masterGain);
          chaos.start();
          chaos.stop(self.audioCtx.currentTime + 0.5);
        }, index * 120);
      })(i);
    }

    // Layer 3: High frequency debris (shattering, sparks)
    for (var j = 0; j < 15; j++) {
      (function(index) {
        setTimeout(function() {
          var debris = self.audioCtx.createOscillator();
          debris.type = Math.random() > 0.5 ? 'sawtooth' : 'square';
          var freq = 800 + Math.random() * 2000;
          debris.frequency.setValueAtTime(freq, self.audioCtx.currentTime);
          debris.frequency.exponentialRampToValueAtTime(freq * 2, self.audioCtx.currentTime + 0.1);

          var debrisGain = self.audioCtx.createGain();
          debrisGain.gain.setValueAtTime(0.08, self.audioCtx.currentTime);
          debrisGain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.15);

          // High-pass filter for metallic sound
          var filter = self.audioCtx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(1000, self.audioCtx.currentTime);

          debris.connect(filter);
          filter.connect(debrisGain);
          debrisGain.connect(self.masterGain);
          debris.start();
          debris.stop(self.audioCtx.currentTime + 0.15);
        }, index * 80 + Math.random() * 50);
      })(j);
    }

    // Layer 4: White noise burst (explosion air blast)
    var bufferSize = this.audioCtx.sampleRate * 2;
    var noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    var output = noiseBuffer.getChannelData(0);

    for (var k = 0; k < bufferSize; k++) {
      output[k] = Math.random() * 2 - 1;
    }

    var whiteNoise = this.audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    var noiseGain = this.audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.2, this.audioCtx.currentTime + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 1.5);

    var noiseFilter = this.audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(500, this.audioCtx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 1.5);
    noiseFilter.Q.setValueAtTime(0.5, this.audioCtx.currentTime);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    whiteNoise.start();
    whiteNoise.stop(this.audioCtx.currentTime + 1.5);

    // Layer 5: Descending alarm (warning systems failing)
    var alarm = this.audioCtx.createOscillator();
    alarm.type = 'sine';
    alarm.frequency.setValueAtTime(1200, this.audioCtx.currentTime + 0.3);
    alarm.frequency.exponentialRampToValueAtTime(200, this.audioCtx.currentTime + 2.5);

    var alarmGain = this.audioCtx.createGain();
    alarmGain.gain.setValueAtTime(0, this.audioCtx.currentTime + 0.3);
    alarmGain.gain.linearRampToValueAtTime(0.12, this.audioCtx.currentTime + 0.4);
    alarmGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 2.5);

    alarm.connect(alarmGain);
    alarmGain.connect(this.masterGain);
    alarm.start(this.audioCtx.currentTime + 0.3);
    alarm.stop(this.audioCtx.currentTime + 2.5);

  } catch (e) {
    console.error('Error playing catastrophic failure sound:', e);
  }
};

/**
 * Play victory sound - successful splashdown
 * Mission Critical: Triumphant but calm, like landing safely
 */
SoundManager.prototype.playVictory = function() {
  if (!this.initialized || !this.audioCtx) return;

  try {
    var self = this;

    // Fade out the drone to peaceful silence
    if (this.droneOsc && this.droneGain) {
      this.droneGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 2);
    }

    // Layer 1: Triumphant major chord (victory fanfare)
    var rootFreq = 261.63; // C4
    var chord = [
      rootFreq,           // Root (C)
      rootFreq * 1.25,    // Major third (E)
      rootFreq * 1.5,     // Perfect fifth (G)
      rootFreq * 2        // Octave (C)
    ];

    chord.forEach(function(freq, index) {
      var osc = self.audioCtx.createOscillator();
      osc.type = 'sine'; // Pure, clean tone
      osc.frequency.setValueAtTime(freq, self.audioCtx.currentTime);

      var gain = self.audioCtx.createGain();
      gain.gain.setValueAtTime(0, self.audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15 / chord.length, self.audioCtx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 2.5);

      osc.connect(gain);
      gain.connect(self.masterGain);
      osc.start();
      osc.stop(self.audioCtx.currentTime + 2.5);
    });

    // Layer 2: Ascending arpeggio (rising hope)
    var arpeggio = [rootFreq, rootFreq * 1.25, rootFreq * 1.5, rootFreq * 2, rootFreq * 2.5];
    arpeggio.forEach(function(freq, index) {
      setTimeout(function() {
        var osc = self.audioCtx.createOscillator();
        osc.type = 'triangle'; // Warmer than sine
        osc.frequency.setValueAtTime(freq, self.audioCtx.currentTime);

        var gain = self.audioCtx.createGain();
        gain.gain.setValueAtTime(0.12, self.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.6);

        osc.connect(gain);
        gain.connect(self.masterGain);
        osc.start();
        osc.stop(self.audioCtx.currentTime + 0.6);
      }, index * 100);
    });

    // Layer 3: Gentle water splash sound (filtered noise)
    setTimeout(function() {
      var bufferSize = self.audioCtx.sampleRate * 1;
      var noiseBuffer = self.audioCtx.createBuffer(1, bufferSize, self.audioCtx.sampleRate);
      var output = noiseBuffer.getChannelData(0);

      for (var i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      var splash = self.audioCtx.createBufferSource();
      splash.buffer = noiseBuffer;

      var splashGain = self.audioCtx.createGain();
      splashGain.gain.setValueAtTime(0, self.audioCtx.currentTime);
      splashGain.gain.linearRampToValueAtTime(0.08, self.audioCtx.currentTime + 0.05);
      splashGain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.8);

      var splashFilter = self.audioCtx.createBiquadFilter();
      splashFilter.type = 'bandpass';
      splashFilter.frequency.setValueAtTime(2000, self.audioCtx.currentTime);
      splashFilter.frequency.exponentialRampToValueAtTime(400, self.audioCtx.currentTime + 0.8);
      splashFilter.Q.setValueAtTime(3, self.audioCtx.currentTime);

      splash.connect(splashFilter);
      splashFilter.connect(splashGain);
      splashGain.connect(self.masterGain);
      splash.start();
      splash.stop(self.audioCtx.currentTime + 0.8);
    }, 200);

    // Layer 4: Peaceful bell-like tones (celebration)
    setTimeout(function() {
      var bellFreqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      bellFreqs.forEach(function(freq, index) {
        setTimeout(function() {
          var bell = self.audioCtx.createOscillator();
          bell.type = 'sine';
          bell.frequency.setValueAtTime(freq, self.audioCtx.currentTime);

          var bellGain = self.audioCtx.createGain();
          bellGain.gain.setValueAtTime(0.1, self.audioCtx.currentTime);
          bellGain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 1.5);

          // Add slight tremolo for shimmer
          var tremolo = self.audioCtx.createOscillator();
          tremolo.type = 'sine';
          tremolo.frequency.setValueAtTime(5, self.audioCtx.currentTime); // 5Hz tremolo

          var tremoloGain = self.audioCtx.createGain();
          tremoloGain.gain.setValueAtTime(0.02, self.audioCtx.currentTime);

          tremolo.connect(tremoloGain);
          tremoloGain.connect(bellGain.gain);

          bell.connect(bellGain);
          bellGain.connect(self.masterGain);

          bell.start();
          tremolo.start();
          bell.stop(self.audioCtx.currentTime + 1.5);
          tremolo.stop(self.audioCtx.currentTime + 1.5);
        }, index * 150);
      });
    }, 800);

  } catch (e) {
    console.error('Error playing victory sound:', e);
  }
};

/**
 * Play oxygen level alert - escalating warning beeps
 * @param {number} level - 0: critical, 1: low, 2: medium
 */
SoundManager.prototype.playOxygenAlert = function(level) {
  if (!this.initialized || !this.audioCtx) return;

  try {
    var self = this;

    if (level === 0) {
      // CRITICAL: Fast triple beep (like hospital monitor)
      for (var i = 0; i < 3; i++) {
        (function(index) {
          setTimeout(function() {
            var osc = self.audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, self.audioCtx.currentTime);

            var gain = self.audioCtx.createGain();
            gain.gain.setValueAtTime(0.15, self.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.12);

            osc.connect(gain);
            gain.connect(self.masterGain);
            osc.start();
            osc.stop(self.audioCtx.currentTime + 0.12);
          }, index * 150);
        })(i);
      }
    } else if (level === 1) {
      // LOW: Double descending beep
      for (var j = 0; j < 2; j++) {
        (function(index) {
          setTimeout(function() {
            var osc = self.audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, self.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, self.audioCtx.currentTime + 0.2);

            var gain = self.audioCtx.createGain();
            gain.gain.setValueAtTime(0.1, self.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.25);

            osc.connect(gain);
            gain.connect(self.masterGain);
            osc.start();
            osc.stop(self.audioCtx.currentTime + 0.25);
          }, index * 300);
        })(j);
      }
    } else {
      // MEDIUM: Single soft beep
      var osc = this.audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);

      var gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    }
  } catch (e) {
    console.error('Error playing oxygen alert:', e);
  }
};

/**
 * Play radio chatter effect when reaching milestone tiles
 * Simulates space station radio communication
 * @param {number} value - Tile value milestone (64, 128, 256, etc.)
 */
SoundManager.prototype.playRadioChatter = function(value) {
  if (!this.initialized || !this.audioCtx) return;

  try {
    var self = this;

    // Create radio static noise burst
    var bufferSize = this.audioCtx.sampleRate * 0.3;
    var noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    var output = noiseBuffer.getChannelData(0);

    for (var i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // Initial static burst
    var staticNoise = this.audioCtx.createBufferSource();
    staticNoise.buffer = noiseBuffer;

    var staticGain = this.audioCtx.createGain();
    staticGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    staticGain.gain.linearRampToValueAtTime(0.06, this.audioCtx.currentTime + 0.02);
    staticGain.gain.linearRampToValueAtTime(0.02, this.audioCtx.currentTime + 0.08);
    staticGain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.3);

    // Bandpass filter for radio-like sound
    var radioFilter = this.audioCtx.createBiquadFilter();
    radioFilter.type = 'bandpass';
    radioFilter.frequency.setValueAtTime(1500, this.audioCtx.currentTime);
    radioFilter.Q.setValueAtTime(5, this.audioCtx.currentTime);

    staticNoise.connect(radioFilter);
    radioFilter.connect(staticGain);
    staticGain.connect(this.masterGain);
    staticNoise.start();
    staticNoise.stop(this.audioCtx.currentTime + 0.3);

    // Then play a "confirmation tone" (like radio acknowledgment)
    setTimeout(function() {
      // Radio confirmation beep pattern varies by milestone
      var tones;

      if (value >= 512) {
        // Urgent ascending tones for high milestones
        tones = [600, 750, 900];
      } else if (value >= 128) {
        // Steady confirmation for mid milestones
        tones = [550, 700];
      } else {
        // Simple ping for early milestones
        tones = [600];
      }

      tones.forEach(function(freq, index) {
        setTimeout(function() {
          var osc = self.audioCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, self.audioCtx.currentTime);

          var gain = self.audioCtx.createGain();
          gain.gain.setValueAtTime(0.08, self.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, self.audioCtx.currentTime + 0.15);

          // Radio-like bandpass
          var filter = self.audioCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(freq, self.audioCtx.currentTime);
          filter.Q.setValueAtTime(3, self.audioCtx.currentTime);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(self.masterGain);
          osc.start();
          osc.stop(self.audioCtx.currentTime + 0.15);
        }, index * 100);
      });
    }, 200);

  } catch (e) {
    console.error('Error playing radio chatter:', e);
  }
};
