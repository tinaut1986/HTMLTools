/**
 * Audio Trimmer & Editor
 * Features:
 * - Load audio (MP3, WAV, OGG, FLAC, M4A, etc.)
 * - Interactive Waveform render with Timeline ruler
 * - Selection box with fixed/variable duration (X seconds window)
 * - Move strip across audio with slider or mouse drag
 * - Fade-In and Fade-Out visualizers & WebAudio automation
 * - Real-time preview with loop support
 * - Export trimmed audio with effects to WAV or MP3
 */

(function () {
    // --- State Variables ---
    let audioContext = null;
    let originalAudioBuffer = null;
    let audioFileName = 'audio';
    let audioDuration = 0;

    // Selection range in seconds
    let startTime = 0;
    let endTime = 15;
    let isDurationLocked = true;
    let lockedDuration = 15;

    // Effects
    let fadeInSeconds = 1.5;
    let fadeOutSeconds = 2.0;
    let volumeGain = 1.0;

    // Playback state
    let activeSourceNode = null;
    let activeGainNode = null;
    let isPlaying = false;
    let playbackStartTime = 0;
    let playbackOffset = 0;
    let playbackInterval = null;
    let isLooping = false;
    let isFullAudioPlayback = false;
    let currentPlayheadTime = 0;

    // Waveform Peaks Cache
    let waveformPeaks = null;

    // Dragging state
    let isDraggingBody = false;
    let isDraggingLeftHandle = false;
    let isDraggingRightHandle = false;
    let isDraggingPlayhead = false;
    let dragStartX = 0;
    let dragStartStartTime = 0;
    let dragStartEndTime = 0;

    // --- DOM Elements ---
    const dropZone = document.getElementById('dropZone');
    const audioInput = document.getElementById('audioInput');
    const editorWorkspace = document.getElementById('editorWorkspace');
    const themeToggle = document.getElementById('themeToggle');

    // Info
    const audioFileNameEl = document.getElementById('audioFileName');
    const audioDurationTextEl = document.getElementById('audioDurationText');
    const audioSpecsTextEl = document.getElementById('audioSpecsText');
    const btnLoadAnother = document.getElementById('btnLoadAnother');

    // Waveform & Selection Elements
    const waveformCard = document.getElementById('waveformCard');
    const waveformContainer = document.getElementById('waveformContainer');
    const waveformCanvas = document.getElementById('waveformCanvas');
    const rulerCanvas = document.getElementById('rulerCanvas');
    const selectionOverlay = document.getElementById('selectionOverlay');
    const selectionBody = document.getElementById('selectionBody');
    const handleLeft = document.getElementById('handleLeft');
    const handleRight = document.getElementById('handleRight');
    const selectionDurationBadge = document.getElementById('selectionDurationBadge');
    const fadeVisualIn = document.getElementById('fadeVisualIn');
    const fadeVisualOut = document.getElementById('fadeVisualOut');
    const playhead = document.getElementById('playhead');
    const stripPositionSlider = document.getElementById('stripPositionSlider');

    // Presets & Inputs
    const presetButtons = document.querySelectorAll('.btn-chip');
    const inputDurationLock = document.getElementById('inputDurationLock');
    const lockDurationToggle = document.getElementById('lockDurationToggle');
    const inputStartTime = document.getElementById('inputStartTime');
    const inputEndTime = document.getElementById('inputEndTime');
    const btnStartMinus = document.getElementById('btnStartMinus');
    const btnStartPlus = document.getElementById('btnStartPlus');
    const btnEndMinus = document.getElementById('btnEndMinus');
    const btnEndPlus = document.getElementById('btnEndPlus');

    // Effects inputs
    const fadeInDurationInput = document.getElementById('fadeInDuration');
    const fadeOutDurationInput = document.getElementById('fadeOutDuration');
    const fadeInText = document.getElementById('fadeInText');
    const fadeOutText = document.getElementById('fadeOutText');
    const volumeGainInput = document.getElementById('volumeGain');
    const volumeGainText = document.getElementById('volumeGainText');

    // Playback
    const currentPlaybackTimeEl = document.getElementById('currentPlaybackTime');
    const totalSelectedTimeEl = document.getElementById('totalSelectedTime');
    const btnPlaySelection = document.getElementById('btnPlaySelection');
    const btnPlayAll = document.getElementById('btnPlayAll');
    const btnStop = document.getElementById('btnStop');
    const btnLoopToggle = document.getElementById('btnLoopToggle');
    const previewWithEffects = document.getElementById('previewWithEffects');

    // Export
    const btnExport = document.getElementById('btnExport');
    const exportProgressContainer = document.getElementById('exportProgressContainer');
    const exportProgressBar = document.getElementById('exportProgressBar');
    const exportProgressText = document.getElementById('exportProgressText');

    // --- Initialization ---
    function init() {
        setupTheme();
        loadSavedConfig();
        setupEventListeners();
        window.addEventListener('resize', handleResize);
    }

    // Theme toggle handling
    function setupTheme() {
        const savedTheme = localStorage.getItem('audiotool_theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }

        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            themeToggle.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            localStorage.setItem('audiotool_theme', isLight ? 'light' : 'dark');
            drawWaveform();
            drawRuler();
        });
    }

    // --- Persistence Configuration ---
    const CONFIG_STORAGE_KEY = 'audiotool_config_v1';

    function loadSavedConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (!raw) return;
            const config = JSON.parse(raw);

            if (typeof config.duration === 'number' && config.duration > 0) {
                lockedDuration = config.duration;
                inputDurationLock.value = lockedDuration.toFixed(1);
            }
            if (typeof config.isDurationLocked === 'boolean') {
                isDurationLocked = config.isDurationLocked;
                lockDurationToggle.checked = isDurationLocked;
            }
            if (typeof config.fadeIn === 'number' && config.fadeIn >= 0) {
                fadeInSeconds = config.fadeIn;
                fadeInDurationInput.value = fadeInSeconds.toFixed(1);
                fadeInText.textContent = `${fadeInSeconds.toFixed(1)} s`;
            }
            if (typeof config.fadeOut === 'number' && config.fadeOut >= 0) {
                fadeOutSeconds = config.fadeOut;
                fadeOutDurationInput.value = fadeOutSeconds.toFixed(1);
                fadeOutText.textContent = `${fadeOutSeconds.toFixed(1)} s`;
            }
            if (typeof config.volumeGain === 'number' && config.volumeGain >= 0) {
                volumeGain = config.volumeGain;
                const pct = Math.round(volumeGain * 100);
                volumeGainInput.value = pct;
                volumeGainText.textContent = `${pct}%`;
            }
            if (typeof config.previewWithEffects === 'boolean') {
                previewWithEffects.checked = config.previewWithEffects;
            }
            if (typeof config.isLooping === 'boolean') {
                isLooping = config.isLooping;
                btnLoopToggle.classList.toggle('active', isLooping);
            }
            if (config.exportFormat) {
                const radio = document.querySelector(`input[name="exportFormat"][value="${config.exportFormat}"]`);
                if (radio) radio.checked = true;
            }

            highlightMatchingPreset(lockedDuration);
        } catch (e) {
            console.warn('No se pudo cargar la configuración guardada:', e);
        }
    }

    function saveCurrentConfig() {
        try {
            const formatInput = document.querySelector('input[name="exportFormat"]:checked');
            const config = {
                duration: lockedDuration,
                isDurationLocked: isDurationLocked,
                fadeIn: fadeInSeconds,
                fadeOut: fadeOutSeconds,
                volumeGain: volumeGain,
                previewWithEffects: previewWithEffects.checked,
                isLooping: isLooping,
                exportFormat: formatInput ? formatInput.value : 'wav'
            };
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
        } catch (e) {
            console.warn('No se pudo guardar la configuración:', e);
        }
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // File Drop & Select
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                loadFile(e.dataTransfer.files[0]);
            }
        });
        audioInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                loadFile(e.target.files[0]);
            }
        });
        btnLoadAnother.addEventListener('click', () => {
            stopPlayback();
            audioInput.value = '';
            editorWorkspace.classList.add('hidden');
            dropZone.classList.remove('hidden');
        });

        // Strip Position Slider
        stripPositionSlider.addEventListener('input', (e) => {
            const pct = parseFloat(e.target.value) / 100;
            const curDuration = endTime - startTime;
            const maxStart = Math.max(0, audioDuration - curDuration);
            const newStart = pct * maxStart;
            setSelection(newStart, newStart + curDuration);
        });

        // Presets
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                presetButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const val = btn.getAttribute('data-duration');
                if (val === 'all') {
                    lockDurationToggle.checked = false;
                    isDurationLocked = false;
                    setSelection(0, audioDuration);
                } else {
                    const dur = parseFloat(val);
                    inputDurationLock.value = dur;
                    lockDurationToggle.checked = true;
                    isDurationLocked = true;
                    lockedDuration = dur;
                    applyDurationLock(dur);
                }
                saveCurrentConfig();
            });
        });

        // Duration lock input
        inputDurationLock.addEventListener('change', () => {
            let dur = parseFloat(inputDurationLock.value);
            if (isNaN(dur) || dur <= 0) dur = 5;
            dur = Math.min(dur, audioDuration);
            inputDurationLock.value = dur.toFixed(1);
            lockedDuration = dur;
            applyDurationLock(dur);
            highlightMatchingPreset(dur);
            saveCurrentConfig();
        });

        lockDurationToggle.addEventListener('change', (e) => {
            isDurationLocked = e.target.checked;
            if (isDurationLocked) {
                lockedDuration = endTime - startTime;
                inputDurationLock.value = lockedDuration.toFixed(1);
            }
            saveCurrentConfig();
        });

        // Steppers & Direct Inputs
        inputStartTime.addEventListener('change', () => {
            let val = parseFloat(inputStartTime.value);
            if (isNaN(val)) val = 0;
            if (isDurationLocked) {
                setSelection(val, val + lockedDuration);
            } else {
                setSelection(val, endTime);
            }
        });

        inputEndTime.addEventListener('change', () => {
            let val = parseFloat(inputEndTime.value);
            if (isNaN(val)) val = audioDuration;
            if (isDurationLocked) {
                setSelection(val - lockedDuration, val);
            } else {
                setSelection(startTime, val);
            }
        });

        btnStartMinus.addEventListener('click', () => adjustStartTime(-0.1));
        btnStartPlus.addEventListener('click', () => adjustStartTime(0.1));
        btnEndMinus.addEventListener('click', () => adjustEndTime(-0.1));
        btnEndPlus.addEventListener('click', () => adjustEndTime(0.1));

        // Fade & Volume Sliders
        fadeInDurationInput.addEventListener('input', (e) => {
            fadeInSeconds = parseFloat(e.target.value);
            fadeInText.textContent = `${fadeInSeconds.toFixed(1)} s`;
            updateFadeVisuals();
            saveCurrentConfig();
        });

        fadeOutDurationInput.addEventListener('input', (e) => {
            fadeOutSeconds = parseFloat(e.target.value);
            fadeOutText.textContent = `${fadeOutSeconds.toFixed(1)} s`;
            updateFadeVisuals();
            saveCurrentConfig();
        });

        volumeGainInput.addEventListener('input', (e) => {
            const pct = parseInt(e.target.value, 10);
            volumeGain = pct / 100;
            volumeGainText.textContent = `${pct}%`;
            if (activeGainNode && audioContext) {
                activeGainNode.gain.setValueAtTime(volumeGain, audioContext.currentTime);
            }
            saveCurrentConfig();
        });

        previewWithEffects.addEventListener('change', () => {
            saveCurrentConfig();
        });

        document.querySelectorAll('input[name="exportFormat"]').forEach(radio => {
            radio.addEventListener('change', saveCurrentConfig);
        });

        // Spacebar Play / Pause toggle when focus is in waveform or workspace
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.key === ' ') {
                // If the user is currently typing in an input or textarea, let normal space work
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag === 'input' || activeTag === 'textarea') {
                    return;
                }

                // Check if waveformCard or editor workspace has focus or is active
                const isWaveformFocused = waveformCard && (document.activeElement === waveformCard || waveformCard.contains(document.activeElement));
                const isWorkspaceVisible = editorWorkspace && !editorWorkspace.classList.contains('hidden');

                if (isWaveformFocused || (isWorkspaceVisible && activeTag !== 'button')) {
                    e.preventDefault();
                    togglePlayPause();
                }
            }
        });

        // Click anywhere inside waveform card focuses it
        if (waveformCard) {
            waveformCard.addEventListener('click', () => {
                waveformCard.focus();
            });
        }

        // Playback Controls
        btnPlaySelection.addEventListener('click', () => {
            if (isPlaying && !isFullAudioPlayback) {
                stopPlayback(false);
            } else {
                if (currentPlayheadTime < startTime || currentPlayheadTime >= endTime) {
                    currentPlayheadTime = startTime;
                }
                playSelection(currentPlayheadTime);
            }
        });

        btnPlayAll.addEventListener('click', () => {
            if (isPlaying && isFullAudioPlayback) {
                stopPlayback(false);
            } else {
                if (currentPlayheadTime < 0 || currentPlayheadTime >= audioDuration) {
                    currentPlayheadTime = 0;
                }
                playFullAudio(currentPlayheadTime);
            }
        });

        btnStop.addEventListener('click', () => stopPlayback(true));

        btnLoopToggle.addEventListener('click', () => {
            isLooping = !isLooping;
            btnLoopToggle.classList.toggle('active', isLooping);
            saveCurrentConfig();
        });

        // Export
        btnExport.addEventListener('click', handleExport);

        // Mouse Drag Interactions on Waveform
        setupSelectionDragging();
    }

    function adjustStartTime(delta) {
        if (isDurationLocked) {
            setSelection(startTime + delta, endTime + delta);
        } else {
            setSelection(startTime + delta, endTime);
        }
    }

    function adjustEndTime(delta) {
        if (isDurationLocked) {
            setSelection(startTime + delta, endTime + delta);
        } else {
            setSelection(startTime, endTime + delta);
        }
    }

    function applyDurationLock(dur) {
        let newEnd = startTime + dur;
        if (newEnd > audioDuration) {
            newEnd = audioDuration;
            startTime = Math.max(0, newEnd - dur);
        }
        setSelection(startTime, newEnd);
    }

    function highlightMatchingPreset(dur) {
        presetButtons.forEach(btn => {
            const pVal = parseFloat(btn.getAttribute('data-duration'));
            if (Math.abs(pVal - dur) < 0.05) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // --- Audio File Loading ---
    async function loadFile(file) {
        if (!file) return;
        audioFileName = file.name.replace(/\.[^/.]+$/, "") || 'trimmed_audio';
        audioFileNameEl.textContent = file.name;

        // Init AudioContext on user interaction
        if (!audioContext) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioCtx();
        }
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioDuration = originalAudioBuffer.duration;

            // Update UI info
            audioDurationTextEl.textContent = formatTime(audioDuration);
            audioSpecsTextEl.textContent = `${originalAudioBuffer.sampleRate} Hz · ${originalAudioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'}`;

            // Prepare configuration respecting saved preferences
            const effDur = Math.min(lockedDuration, audioDuration);
            lockedDuration = effDur;
            inputDurationLock.value = lockedDuration.toFixed(1);
            lockDurationToggle.checked = isDurationLocked;

            // Fade in/out constrained by duration
            fadeInSeconds = Math.min(fadeInSeconds, effDur);
            fadeOutSeconds = Math.min(fadeOutSeconds, effDur);
            fadeInDurationInput.value = fadeInSeconds.toFixed(1);
            fadeOutDurationInput.value = fadeOutSeconds.toFixed(1);
            fadeInDurationInput.max = Math.max(5, effDur).toFixed(1);
            fadeOutDurationInput.max = Math.max(5, effDur).toFixed(1);
            fadeInText.textContent = `${fadeInSeconds.toFixed(1)} s`;
            fadeOutText.textContent = `${fadeOutSeconds.toFixed(1)} s`;

            highlightMatchingPreset(lockedDuration);

            // Compute Peaks Cache
            computeWaveformPeaks();

            // Reveal Workspace
            dropZone.classList.add('hidden');
            editorWorkspace.classList.remove('hidden');

            // Render
            setSelection(0, effDur);
            handleResize();
            // Automatically focus waveform card for keyboard control
            if (waveformCard) {
                waveformCard.focus();
            }
        } catch (err) {
            console.error('Error al decodificar audio:', err);
            alert('No se pudo decodificar el archivo de audio. Asegúrate de que el formato sea válido.');
        }
    }

    // --- Waveform Rendering ---
    function computeWaveformPeaks() {
        if (!originalAudioBuffer) return;
        const channelData = originalAudioBuffer.getChannelData(0); // primary channel
        const totalSamples = channelData.length;
        const width = 1600; // Resolution of peak cache
        const blockSize = Math.floor(totalSamples / width);

        waveformPeaks = new Float32Array(width * 2);

        for (let i = 0; i < width; i++) {
            const start = i * blockSize;
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < blockSize; j++) {
                const val = channelData[start + j];
                if (val < min) min = val;
                if (val > max) max = val;
            }
            waveformPeaks[i * 2] = min;
            waveformPeaks[i * 2 + 1] = max;
        }
    }

    function drawWaveform() {
        if (!waveformPeaks) return;
        const ctx = waveformCanvas.getContext('2d');
        const width = waveformCanvas.width;
        const height = waveformCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const isLight = document.body.classList.contains('light-mode');
        const barColor = isLight ? '#0284c7' : '#38bdf8';
        const centerLineColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

        // Center line
        const midY = height / 2;
        ctx.strokeStyle = centerLineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();

        // Peaks drawing
        const numPeaks = waveformPeaks.length / 2;
        ctx.fillStyle = barColor;

        for (let x = 0; x < width; x++) {
            const peakIndex = Math.floor((x / width) * numPeaks);
            const min = waveformPeaks[peakIndex * 2];
            const max = waveformPeaks[peakIndex * 2 + 1];

            const yTop = midY - max * midY * 0.95;
            const yBottom = midY - min * midY * 0.95;
            const barHeight = Math.max(1.5, yBottom - yTop);

            ctx.fillRect(x, yTop, 1, barHeight);
        }
    }

    function drawRuler() {
        if (!originalAudioBuffer) return;
        const ctx = rulerCanvas.getContext('2d');
        const width = rulerCanvas.width;
        const height = rulerCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const isLight = document.body.classList.contains('light-mode');
        ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
        ctx.strokeStyle = isLight ? '#cbd5e1' : '#334155';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.lineWidth = 1;

        // Determine nice tick intervals (e.g. 1s, 5s, 10s, 30s, 60s)
        let interval = 1;
        if (audioDuration > 300) interval = 30;
        else if (audioDuration > 120) interval = 15;
        else if (audioDuration > 60) interval = 10;
        else if (audioDuration > 20) interval = 5;
        else if (audioDuration > 10) interval = 2;

        const numTicks = Math.floor(audioDuration / interval);

        for (let i = 0; i <= numTicks; i++) {
            const time = i * interval;
            const x = (time / audioDuration) * width;

            ctx.beginPath();
            ctx.moveTo(x, height);
            ctx.lineTo(x, height - 8);
            ctx.stroke();

            const text = formatTime(time, false);
            const textWidth = ctx.measureText(text).width;
            ctx.fillText(text, Math.max(2, Math.min(width - textWidth - 2, x - textWidth / 2)), 12);
        }
    }

    function handleResize() {
        if (!editorWorkspace.classList.contains('hidden') && waveformContainer) {
            const rect = waveformContainer.getBoundingClientRect();
            waveformCanvas.width = rect.width;
            waveformCanvas.height = rect.height;

            const rulerRect = rulerCanvas.parentElement.getBoundingClientRect();
            rulerCanvas.width = rulerRect.width;
            rulerCanvas.height = rulerRect.height;

            drawWaveform();
            drawRuler();
            updateSelectionUI();
        }
    }

    // --- Selection Management ---
    function setSelection(newStart, newEnd) {
        if (!audioDuration) return;

        // Boundaries validation
        newStart = Math.max(0, newStart);
        newEnd = Math.min(audioDuration, newEnd);

        if (isDurationLocked) {
            const dur = lockedDuration;
            if (newEnd - newStart < dur) {
                if (newStart + dur <= audioDuration) {
                    newEnd = newStart + dur;
                } else if (newEnd - dur >= 0) {
                    newStart = newEnd - dur;
                }
            }
        }

        // Enforce minimal length (0.1s)
        if (newEnd - newStart < 0.1) {
            newEnd = Math.min(audioDuration, newStart + 0.1);
        }

        startTime = Math.round(newStart * 100) / 100;
        endTime = Math.round(newEnd * 100) / 100;

        // Update inputs
        inputStartTime.value = startTime.toFixed(2);
        inputEndTime.value = endTime.toFixed(2);

        const currentDur = endTime - startTime;
        selectionDurationBadge.textContent = `${currentDur.toFixed(2)}s`;
        totalSelectedTimeEl.textContent = formatTime(currentDur);

        // Update slider position
        const maxStart = Math.max(0.001, audioDuration - currentDur);
        const sliderPct = (startTime / maxStart) * 100;
        stripPositionSlider.value = Math.min(100, Math.max(0, sliderPct));

        updateSelectionUI();
        updateFadeVisuals();
    }

    function updateSelectionUI() {
        if (!audioDuration) return;
        const leftPct = (startTime / audioDuration) * 100;
        const widthPct = ((endTime - startTime) / audioDuration) * 100;

        selectionOverlay.style.left = `${leftPct}%`;
        selectionOverlay.style.width = `${widthPct}%`;

        if (!isPlaying) {
            if (currentPlayheadTime < startTime || currentPlayheadTime > endTime) {
                currentPlayheadTime = startTime;
            }
            const playheadPct = (currentPlayheadTime / audioDuration) * 100;
            playhead.style.left = `${playheadPct}%`;
            playhead.classList.remove('hidden');
        }
    }

    function updateFadeVisuals() {
        const selectionDuration = endTime - startTime;
        if (selectionDuration <= 0) return;

        const effectiveFadeIn = Math.min(fadeInSeconds, selectionDuration);
        const effectiveFadeOut = Math.min(fadeOutSeconds, selectionDuration);

        const inPct = (effectiveFadeIn / selectionDuration) * 100;
        const outPct = (effectiveFadeOut / selectionDuration) * 100;

        fadeVisualIn.style.width = `${inPct}%`;
        fadeVisualOut.style.width = `${outPct}%`;
    }

    // --- Mouse & Touch Dragging for Selection ---
    function setupSelectionDragging() {
        // Drag Entire Body (Slide along audio)
        selectionBody.addEventListener('mousedown', (e) => {
            isDraggingBody = true;
            dragStartX = e.clientX;
            dragStartStartTime = startTime;
            dragStartEndTime = endTime;
            document.body.style.cursor = 'grabbing';
            e.stopPropagation();
        });

        // Left Handle
        handleLeft.addEventListener('mousedown', (e) => {
            isDraggingLeftHandle = true;
            dragStartX = e.clientX;
            dragStartStartTime = startTime;
            document.body.style.cursor = 'ew-resize';
            e.stopPropagation();
        });

        // Right Handle
        handleRight.addEventListener('mousedown', (e) => {
            isDraggingRightHandle = true;
            dragStartX = e.clientX;
            dragStartEndTime = endTime;
            document.body.style.cursor = 'ew-resize';
            e.stopPropagation();
        });

        // Playhead Draggable Handle
        playhead.addEventListener('mousedown', (e) => {
            isDraggingPlayhead = true;
            document.body.style.cursor = 'ew-resize';
            e.stopPropagation();
        });

        // Click / Drag on Ruler to seek playback position
        rulerCanvas.parentElement.addEventListener('mousedown', (e) => {
            if (!audioDuration) return;
            const rect = rulerCanvas.getBoundingClientRect();
            const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const targetTime = (clickX / rect.width) * audioDuration;
            seekToTime(targetTime);
            isDraggingPlayhead = true;
            document.body.style.cursor = 'ew-resize';
        });

        // Click outside selection on waveform: Shift+Click seeks, normal Click moves selection
        waveformContainer.addEventListener('mousedown', (e) => {
            if (e.target !== waveformCanvas) return;
            const rect = waveformContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickPct = clickX / rect.width;
            const targetTime = clickPct * audioDuration;

            if (isPlaying) {
                seekToTime(targetTime);
                return;
            }

            const curDur = endTime - startTime;
            const halfDur = curDur / 2;
            let newStart = targetTime - halfDur;
            let newEnd = targetTime + halfDur;

            if (newStart < 0) {
                newStart = 0;
                newEnd = curDur;
            } else if (newEnd > audioDuration) {
                newEnd = audioDuration;
                newStart = audioDuration - curDur;
            }
            setSelection(newStart, newEnd);
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingBody && !isDraggingLeftHandle && !isDraggingRightHandle && !isDraggingPlayhead) return;

            const rect = waveformContainer.getBoundingClientRect();

            if (isDraggingPlayhead) {
                const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                const targetTime = (mouseX / rect.width) * audioDuration;
                seekToTime(targetTime);
                return;
            }

            const deltaX = e.clientX - dragStartX;
            const deltaTime = (deltaX / rect.width) * audioDuration;

            if (isDraggingBody) {
                const dur = dragStartEndTime - dragStartStartTime;
                let newStart = dragStartStartTime + deltaTime;
                let newEnd = newStart + dur;

                if (newStart < 0) {
                    newStart = 0;
                    newEnd = dur;
                } else if (newEnd > audioDuration) {
                    newEnd = audioDuration;
                    newStart = audioDuration - dur;
                }
                setSelection(newStart, newEnd);
            } else if (isDraggingLeftHandle) {
                if (isDurationLocked) {
                    let newStart = dragStartStartTime + deltaTime;
                    newStart = Math.max(0, Math.min(audioDuration - lockedDuration, newStart));
                    setSelection(newStart, newStart + lockedDuration);
                } else {
                    let newStart = Math.max(0, Math.min(endTime - 0.1, dragStartStartTime + deltaTime));
                    setSelection(newStart, endTime);
                }
            } else if (isDraggingRightHandle) {
                if (isDurationLocked) {
                    let newEnd = dragStartEndTime + deltaTime;
                    newEnd = Math.max(lockedDuration, Math.min(audioDuration, newEnd));
                    setSelection(newEnd - lockedDuration, newEnd);
                } else {
                    let newEnd = Math.max(startTime + 0.1, Math.min(audioDuration, dragStartEndTime + deltaTime));
                    setSelection(startTime, newEnd);
                }
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingBody || isDraggingLeftHandle || isDraggingRightHandle || isDraggingPlayhead) {
                isDraggingBody = false;
                isDraggingLeftHandle = false;
                isDraggingRightHandle = false;
                isDraggingPlayhead = false;
                document.body.style.cursor = 'default';
            }
        });
    }

    // --- Audio Playback & Preview Engine ---
    function seekToTime(targetTime) {
        if (!audioDuration || !originalAudioBuffer) return;
        targetTime = Math.max(0, Math.min(audioDuration, targetTime));
        currentPlayheadTime = targetTime;

        // Update UI playhead position and timer immediately
        const pct = (targetTime / audioDuration) * 100;
        playhead.style.left = `${pct}%`;
        playhead.classList.remove('hidden');

        if (isPlaying) {
            if (isFullAudioPlayback) {
                playFullAudio(targetTime);
            } else {
                // If seeking within or outside selection
                const clamped = Math.max(startTime, Math.min(endTime, targetTime));
                playSelection(clamped);
            }
        } else {
            // Update time display to show position (relative to selection if inside selection)
            if (targetTime >= startTime && targetTime <= endTime) {
                currentPlaybackTimeEl.textContent = formatTime(targetTime - startTime);
            } else {
                currentPlaybackTimeEl.textContent = formatTime(targetTime);
            }
        }
    }

    function playSelection(offsetFrom = startTime) {
        stopPlayback(false);
        if (!originalAudioBuffer || !audioContext) return;

        isFullAudioPlayback = false;
        offsetFrom = Math.max(startTime, Math.min(endTime, offsetFrom));
        currentPlayheadTime = offsetFrom;
        const remainingDuration = endTime - offsetFrom;
        if (remainingDuration <= 0) return;

        activeSourceNode = audioContext.createBufferSource();
        activeSourceNode.buffer = originalAudioBuffer;
        activeGainNode = audioContext.createGain();

        const totalSelDur = endTime - startTime;
        const now = audioContext.currentTime;
        const applyFades = previewWithEffects.checked;

        if (applyFades) {
            const effFadeIn = Math.min(fadeInSeconds, totalSelDur);
            const effFadeOut = Math.min(fadeOutSeconds, totalSelDur);
            const startRelTime = offsetFrom - startTime;

            // Compute volume gain based on whether we start during fade-in
            if (effFadeIn > 0 && startRelTime < effFadeIn) {
                const initRatio = Math.max(0.0001, startRelTime / effFadeIn);
                activeGainNode.gain.setValueAtTime(initRatio * volumeGain, now);
                activeGainNode.gain.linearRampToValueAtTime(volumeGain, now + (effFadeIn - startRelTime));
            } else {
                activeGainNode.gain.setValueAtTime(volumeGain, now);
            }

            // Fade Out schedule
            if (effFadeOut > 0) {
                const fadeOutStartRel = totalSelDur - effFadeOut;
                const timeUntilFadeOut = Math.max(0, fadeOutStartRel - startRelTime);
                if (timeUntilFadeOut > 0) {
                    activeGainNode.gain.setValueAtTime(volumeGain, now + timeUntilFadeOut);
                }
                activeGainNode.gain.linearRampToValueAtTime(0.0001, now + remainingDuration);
            }
        } else {
            activeGainNode.gain.setValueAtTime(volumeGain, now);
        }

        activeSourceNode.connect(activeGainNode);
        activeGainNode.connect(audioContext.destination);

        activeSourceNode.start(0, offsetFrom, remainingDuration);
        isPlaying = true;
        playbackStartTime = audioContext.currentTime;
        playbackOffset = offsetFrom;

        btnPlaySelection.innerHTML = '<i class="fas fa-pause"></i> Pausar';
        btnPlaySelection.classList.add('active');
        playhead.classList.remove('hidden');

        activeSourceNode.onended = () => {
            if (isPlaying && !isFullAudioPlayback) {
                if (isLooping) {
                    playSelection(startTime);
                } else {
                    stopPlayback(true);
                }
            }
        };

        startPlaybackTicker(offsetFrom, remainingDuration);
    }

    function playFullAudio(offsetFrom = 0) {
        stopPlayback(false);
        if (!originalAudioBuffer || !audioContext) return;

        isFullAudioPlayback = true;
        offsetFrom = Math.max(0, Math.min(audioDuration, offsetFrom));
        currentPlayheadTime = offsetFrom;
        const remainingDuration = audioDuration - offsetFrom;
        if (remainingDuration <= 0) return;

        activeSourceNode = audioContext.createBufferSource();
        activeSourceNode.buffer = originalAudioBuffer;

        activeGainNode = audioContext.createGain();
        activeGainNode.gain.setValueAtTime(volumeGain, audioContext.currentTime);

        activeSourceNode.connect(activeGainNode);
        activeGainNode.connect(audioContext.destination);

        activeSourceNode.start(0, offsetFrom, remainingDuration);
        isPlaying = true;
        playbackStartTime = audioContext.currentTime;
        playbackOffset = offsetFrom;

        btnPlayAll.innerHTML = '<i class="fas fa-pause"></i> Pausar';
        playhead.classList.remove('hidden');

        activeSourceNode.onended = () => {
            if (isPlaying && isFullAudioPlayback) {
                stopPlayback(true);
            }
        };

        startPlaybackTicker(offsetFrom, remainingDuration);
    }

    function stopPlayback(resetPosition = false) {
        if (activeSourceNode) {
            try {
                activeSourceNode.onended = null;
                activeSourceNode.stop();
                activeSourceNode.disconnect();
            } catch (e) {}
            activeSourceNode = null;
        }
        if (activeGainNode) {
            try {
                activeGainNode.disconnect();
            } catch (e) {}
            activeGainNode = null;
        }

        // Calculate current position before clearing
        if (isPlaying && audioContext) {
            const elapsed = audioContext.currentTime - playbackStartTime;
            currentPlayheadTime = playbackOffset + elapsed;
        }

        isPlaying = false;
        clearInterval(playbackInterval);
        playbackInterval = null;

        btnPlaySelection.innerHTML = '<i class="fas fa-play"></i> <span>Franja</span>';
        btnPlaySelection.classList.remove('active');
        btnPlayAll.innerHTML = '<i class="fas fa-headphones"></i> <span>Completo</span>';

        if (resetPosition) {
            currentPlayheadTime = startTime;
            const pct = (startTime / audioDuration) * 100;
            playhead.style.left = `${pct}%`;
            currentPlaybackTimeEl.textContent = '00:00.00';
        } else {
            // Keep playhead and timer at the current paused location
            const clamped = Math.max(0, Math.min(audioDuration, currentPlayheadTime));
            currentPlayheadTime = clamped;
            const pct = (clamped / audioDuration) * 100;
            playhead.style.left = `${pct}%`;
            if (isFullAudioPlayback) {
                currentPlaybackTimeEl.textContent = formatTime(clamped);
            } else {
                currentPlaybackTimeEl.textContent = formatTime(Math.max(0, clamped - startTime));
            }
        }
    }

    function togglePlayPause() {
        if (!originalAudioBuffer) return;
        if (isPlaying) {
            stopPlayback(false);
        } else {
            // If playhead is positioned before or at/past endTime, restart from startTime
            if (currentPlayheadTime < startTime || currentPlayheadTime >= endTime) {
                currentPlayheadTime = startTime;
            }
            playSelection(currentPlayheadTime);
        }
    }

    function startPlaybackTicker(baseOffset, totalDuration) {
        clearInterval(playbackInterval);
        playbackInterval = setInterval(() => {
            if (!isPlaying || !audioContext) {
                clearInterval(playbackInterval);
                return;
            }

            const elapsed = audioContext.currentTime - playbackStartTime;
            const currentAudioPos = baseOffset + elapsed;

            if (elapsed >= totalDuration) {
                currentPlaybackTimeEl.textContent = formatTime(totalDuration);
                return;
            }

            currentPlayheadTime = currentAudioPos;

            // Update time display
            if (isFullAudioPlayback) {
                currentPlaybackTimeEl.textContent = formatTime(currentAudioPos);
            } else {
                currentPlaybackTimeEl.textContent = formatTime(currentAudioPos - startTime);
            }

            // Position Playhead
            const pct = (currentAudioPos / audioDuration) * 100;
            playhead.style.left = `${pct}%`;
        }, 30);
    }

    // --- Offline Processing & Audio Exporting ---
    async function handleExport() {
        if (!originalAudioBuffer) return;
        const formatInput = document.querySelector('input[name="exportFormat"]:checked');
        const format = formatInput ? formatInput.value : 'wav';

        stopPlayback();

        // UI progress
        btnExport.disabled = true;
        exportProgressContainer.classList.remove('hidden');
        exportProgressBar.style.width = '15%';
        exportProgressText.textContent = 'Procesando franja de audio con efectos...';

        try {
            // Render audio with sample-accurate fades using OfflineAudioContext
            const renderedBuffer = await renderOfflineSlice();

            exportProgressBar.style.width = '60%';
            exportProgressText.textContent = `Codificando a ${format.toUpperCase()}...`;

            let blob = null;
            let extension = 'wav';

            if (format === 'mp3') {
                blob = await encodeMp3(renderedBuffer);
                extension = 'mp3';
            } else {
                blob = audioBufferToWavBlob(renderedBuffer);
                extension = 'wav';
            }

            exportProgressBar.style.width = '100%';
            exportProgressText.textContent = '¡Completado!';

            // Download Trigger
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `${audioFileName}_trimmed_${(endTime - startTime).toFixed(1)}s.${extension}`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            setTimeout(() => {
                URL.revokeObjectURL(url);
                exportProgressContainer.classList.add('hidden');
                btnExport.disabled = false;
            }, 2500);

        } catch (err) {
            console.error('Error al exportar:', err);
            alert(`Error durante la exportación: ${err.message}`);
            exportProgressContainer.classList.add('hidden');
            btnExport.disabled = false;
        }
    }

    // Offline Render with Fades and Gain
    async function renderOfflineSlice() {
        const selDuration = endTime - startTime;
        const sampleRate = originalAudioBuffer.sampleRate;
        const channels = originalAudioBuffer.numberOfChannels;
        const length = Math.ceil(selDuration * sampleRate);

        const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const offlineCtx = new OfflineCtx(channels, length, sampleRate);

        const source = offlineCtx.createBufferSource();
        source.buffer = originalAudioBuffer;

        const gainNode = offlineCtx.createGain();

        // Sample-accurate curve calculations
        const effFadeIn = Math.min(fadeInSeconds, selDuration);
        const effFadeOut = Math.min(fadeOutSeconds, selDuration);

        // Fade In
        if (effFadeIn > 0) {
            gainNode.gain.setValueAtTime(0.0001, 0);
            gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, volumeGain), effFadeIn);
        } else {
            gainNode.gain.setValueAtTime(volumeGain, 0);
        }

        // Fade Out
        if (effFadeOut > 0) {
            const fadeOutStartTime = selDuration - effFadeOut;
            gainNode.gain.setValueAtTime(volumeGain, Math.max(effFadeIn, fadeOutStartTime));
            gainNode.gain.exponentialRampToValueAtTime(0.0001, selDuration);
        }

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        // Start at offset startTime for selDuration
        source.start(0, startTime, selDuration);

        return await offlineCtx.startRendering();
    }

    // --- WAV Encoder (16-bit PCM RIFF) ---
    function audioBufferToWavBlob(buffer) {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const out = new DataView(new ArrayBuffer(length));
        const channels = [];
        let sample = 0;
        let offset = 0;
        let pos = 0;

        // write RIFF header
        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit PCM

        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        // write interleaved data
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        while (pos < buffer.length) {
            for (let i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // 16-bit
                out.setInt16(offset, sample, true);
                offset += 2;
            }
            pos++;
        }

        return new Blob([out.buffer], { type: 'audio/wav' });

        function setUint16(data) {
            out.setUint16(pos, data, true);
            pos += 2;
            offset = pos;
        }

        function setUint32(data) {
            out.setUint32(pos, data, true);
            pos += 4;
            offset = pos;
        }
    }

    // --- MP3 Encoder (Using lamejs) ---
    async function encodeMp3(buffer) {
        if (typeof lamejs === 'undefined') {
            console.warn('lamejs no está cargado. Descargando como WAV por seguridad.');
            return audioBufferToWavBlob(buffer);
        }

        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 192); // 192 kbps
        const mp3Data = [];

        const sampleBlockSize = 1152;
        const leftData = buffer.getChannelData(0);
        const rightData = channels > 1 ? buffer.getChannelData(1) : leftData;

        // Convert Float32 to Int16
        const numSamples = buffer.length;
        const leftInt16 = new Int16Array(numSamples);
        const rightInt16 = new Int16Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            let sL = Math.max(-1, Math.min(1, leftData[i]));
            leftInt16[i] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF;

            let sR = Math.max(-1, Math.min(1, rightData[i]));
            rightInt16[i] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF;
        }

        // Encode in chunks
        for (let i = 0; i < numSamples; i += sampleBlockSize) {
            const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
            let mp3buf;
            if (channels === 1) {
                mp3buf = mp3encoder.encodeBuffer(leftChunk);
            } else {
                const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
                mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            }
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        const endBuf = mp3encoder.flush();
        if (endBuf.length > 0) {
            mp3Data.push(endBuf);
        }

        return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    // --- Time Formatting Helper ---
    function formatTime(sec, includeDecimals = true) {
        if (isNaN(sec) || sec < 0) sec = 0;
        const minutes = Math.floor(sec / 60);
        const seconds = Math.floor(sec % 60);
        const millis = Math.floor((sec % 1) * 100);

        const mStr = String(minutes).padStart(2, '0');
        const sStr = String(seconds).padStart(2, '0');
        const msStr = String(millis).padStart(2, '0');

        return includeDecimals ? `${mStr}:${sStr}.${msStr}` : `${mStr}:${sStr}`;
    }

    // Run on DOM ready
    document.addEventListener('DOMContentLoaded', init);
})();
