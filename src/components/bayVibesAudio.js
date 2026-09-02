/* ==========================================================================
   BAIA CAFE — Synthetic Web Audio Ocean Atmosphere
   Zero external audio files, pure browser Web Audio API wave generator
   ========================================================================== */

export function initBayVibesAudio() {
  const toggleBtn = document.getElementById('audio-toggle-btn');
  if (!toggleBtn) return;

  let audioCtx = null;
  let isPlaying = false;
  let noiseNode = null;
  let filterNode = null;
  let gainNode = null;
  let lfoNode = null;
  let lfoGain = null;

  function createOceanWaves() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Create 5 seconds pink/brown noise buffer
    const bufferSize = audioCtx.sampleRate * 5;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02; // Brown noise curve
      lastOut = output[i];
      output[i] *= 3.5;
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    // Filter to sound like rolling ocean surf
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(380, audioCtx.currentTime);

    // LFO to simulate wave swells (slow 0.12 Hz cycle ~ 8 seconds per wave)
    lfoNode = audioCtx.createOscillator();
    lfoNode.frequency.setValueAtTime(0.12, audioCtx.currentTime);

    lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(260, audioCtx.currentTime);

    lfoNode.connect(filterNode.frequency);

    // Master Gain
    gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);

    noiseNode.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseNode.start();
    lfoNode.start();
  }

  toggleBtn.addEventListener('click', () => {
    if (!isPlaying) {
      if (!audioCtx) {
        createOceanWaves();
      } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      isPlaying = true;
      toggleBtn.classList.add('active');
      toggleBtn.innerHTML = `<span>Sound: On</span>`;
    } else {
      if (audioCtx) {
        audioCtx.suspend();
      }
      isPlaying = false;
      toggleBtn.classList.remove('active');
      toggleBtn.innerHTML = `<span>Bay Sound</span>`;
    }
  });
}
