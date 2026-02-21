function SoundManager() {
  this.audioCtx = null;
  this.initialized = false;
  this.masterGain = null;
  this.droneOsc = null;
  this.droneLfo = null;
  this.droneGain = null;
}

SoundManager.prototype.init = function() {
  if (this.initialized) return;

  var AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  this.audioCtx = new AudioContext();
  this.masterGain = this.audioCtx.createGain();
  this.masterGain.gain.value = 0.6; // Base global volume
  this.masterGain.connect(this.audioCtx.destination);

  this.startDrone();
  this.initialized = true;
};

SoundManager.prototype.startDrone = function() {
  if (!this.audioCtx) return;

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
};

SoundManager.prototype.setDroneEnergy = function(energy) {
  if (!this.initialized || !this.audioCtx || !this.droneLfo || !this.droneGain || !this.droneOsc) return;

  var cappedEnergy = Math.min(Math.max(energy, 0), 1.5);

  // Escalar la frecuencia del latido: reposo 0.2Hz, máxima energía 3.0Hz
  var targetLfoFreq = 0.2 + (cappedEnergy * 2.8);
  this.droneLfo.frequency.setTargetAtTime(targetLfoFreq, this.audioCtx.currentTime, 0.1);

  // Incrementar un poco el volumen del drone con la energía
  var targetGain = 0.15 + (cappedEnergy * 0.15);
  this.droneGain.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.1);

  // Subir sutilmente el tono base
  var baseFreq = 55 + (cappedEnergy * 10);
  this.droneOsc.frequency.setTargetAtTime(baseFreq, this.audioCtx.currentTime, 0.1);
};

SoundManager.prototype.playMove = function(direction) {
  if (!this.initialized || !this.audioCtx) return;

  var osc = this.audioCtx.createOscillator();
  osc.type = 'triangle';

  // Use direction to slightly vary pitch (0: up, 1: right, 2: down, 3: left)
  var basePitch = 440 + (direction * 50);
  osc.frequency.setValueAtTime(basePitch, this.audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(basePitch * 1.5, this.audioCtx.currentTime + 0.1);

  var gain = this.audioCtx.createGain();
  gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

  osc.connect(gain);
  gain.connect(this.masterGain);

  osc.start();
  osc.stop(this.audioCtx.currentTime + 0.1);
};

SoundManager.prototype.playMerge = function(value) {
  if (!this.initialized || !this.audioCtx) return;

  // Calculate base frequency based on value (using log2)
  var power = Math.log(value) / Math.log(2);
  // Base is roughly A3 (220Hz), ascending by minor thirds or major seconds
  var baseFreq = 220 * Math.pow(1.059463, (power - 1) * 3);

  // Play a major/sus chord
  var freqs = [baseFreq, baseFreq * 1.5, baseFreq * 1.25]; // Root, Fifth, Major Third

  // For super high values, add octaves and more intensity
  if (value >= 128) {
     freqs.push(baseFreq * 2);
  }
  if (value >= 512) {
     freqs.push(baseFreq * 0.5); // Sub bass
  }

  var self = this;
  freqs.forEach(function(f, i) {
    var osc = self.audioCtx.createOscillator();
    // Use fancier waveforms for bigger merges
    osc.type = value >= 64 ? 'sawtooth' : 'sine';

    // Add a slight detune based on index for richness
    osc.frequency.setValueAtTime(f + (i*2), self.audioCtx.currentTime);

    var gain = self.audioCtx.createGain();
    gain.gain.setValueAtTime(0, self.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1 / freqs.length, self.audioCtx.currentTime + 0.05);
    // Faster decay for small merges, longer ring for big merges
    var decayTime = value >= 64 ? 0.8 : 0.3;
    gain.gain.exponentialRampToValueAtTime(0.01, self.audioCtx.currentTime + decayTime);

    // Lowpass filter to avoid harshness on sawtooth
    var filter = self.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000 + (power * 300), self.audioCtx.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(self.masterGain);

    osc.start();
    osc.stop(self.audioCtx.currentTime + decayTime + 0.1);
  });
};
