// Mouse Tester & Chatter Logger
// Diagnóstico de rebote de contactos y micro-desconexiones

(function() {
  'use strict';

  // --- Web Audio Synthesizer ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, gainVal = 0.15) {
    if (!document.getElementById('toggle-sound').checked) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  function playNormalSound() {
    playTone(520, 'sine', 0.04, 0.08);
  }

  function playChatterAlertSound() {
    // Alarma bitonal disonante para alertar de fallo
    try {
      const ctx = getAudioContext();
      if (!ctx || !document.getElementById('toggle-sound').checked) return;
      
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(150, now);
      osc2.frequency.setValueAtTime(220, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch (e) {}
  }

  // --- Application State ---
  const state = {
    activeButtons: new Set(),
    buttonStates: {}, // buttonId -> { isDown, pressTime, releaseTime, holdDuration }
    events: [],
    stats: {
      totalClicks: 0,
      chatterCount: 0,
      maxHoldMs: 0,
      minGapMs: Infinity
    },
    activeFilter: 'all',
    holdTimerAnimId: null,
    testPadHolding: false
  };

  const buttonNames = {
    0: 'Izquierdo (LMB)',
    1: 'Central (MMB)',
    2: 'Derecho (RMB)',
    3: 'Atrás (Back)',
    4: 'Adelante (Fwd)'
  };

  const svgElements = {
    0: document.getElementById('btn-left'),
    1: document.getElementById('btn-middle'),
    2: document.getElementById('btn-right'),
    3: document.getElementById('btn-back'),
    4: document.getElementById('btn-forward')
  };

  // --- UI Elements ---
  const testPad = document.getElementById('test-pad');
  const timerValue = document.getElementById('timer-value');
  const timerBar = document.getElementById('timer-bar');
  const statusBanner = document.getElementById('status-banner');
  const logTableBody = document.getElementById('log-table-body');
  const emptyLog = document.getElementById('empty-log');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');

  // Stats Elements
  const statClicks = document.getElementById('stat-clicks');
  const statChatter = document.getElementById('stat-chatter');
  const statMaxHold = document.getElementById('stat-max-hold');
  const statMinGap = document.getElementById('stat-min-gap');
  const statCardChatter = document.getElementById('card-chatter');

  // Settings Elements
  const chatterThresholdInput = document.getElementById('chatter-threshold');
  const thresholdValDisplay = document.getElementById('threshold-val');
  const preventContextMenuToggle = document.getElementById('toggle-context-menu');

  chatterThresholdInput.addEventListener('input', (e) => {
    thresholdValDisplay.textContent = `${e.target.value}ms`;
  });

  // Prevent Context Menu conditionally for right-click testing
  window.addEventListener('contextmenu', (e) => {
    if (preventContextMenuToggle.checked) {
      e.preventDefault();
    }
  });

  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  // --- Update Mouse Visualizer ---
  function updateVisualizer(button, isPressed, isChatter = false) {
    const el = svgElements[button];
    if (el) {
      if (isPressed) {
        if (isChatter) {
          el.classList.add('active-chatter');
        } else {
          el.classList.add('active');
        }
      } else {
        el.classList.remove('active');
        el.classList.remove('active-chatter');
      }
    }
  }

  // --- Realtime Timer for Hold Pad ---
  function startHoldTimer(startTime) {
    if (state.holdTimerAnimId) cancelAnimationFrame(state.holdTimerAnimId);

    function tick() {
      if (!state.testPadHolding) return;
      const elapsed = performance.now() - startTime;
      const secs = (elapsed / 1000).toFixed(3);
      timerValue.textContent = `${secs} s`;
      const progress = Math.min((elapsed % 3000) / 3000 * 100, 100);
      timerBar.style.width = `${progress}%`;
      state.holdTimerAnimId = requestAnimationFrame(tick);
    }
    state.holdTimerAnimId = requestAnimationFrame(tick);
  }

  function stopHoldTimer() {
    state.testPadHolding = false;
    if (state.holdTimerAnimId) {
      cancelAnimationFrame(state.holdTimerAnimId);
      state.holdTimerAnimId = null;
    }
    testPad.classList.remove('holding');
    timerBar.style.width = '0%';
  }

  // --- Event Handling Core ---
  function handlePointerDown(e) {
    const btn = e.button;
    const now = performance.now();
    const threshold = parseInt(chatterThresholdInput.value, 10);

    const prev = state.buttonStates[btn] || { isDown: false, pressTime: 0, releaseTime: 0 };
    
    let isChatter = false;
    let gapMs = 0;
    if (prev.releaseTime > 0) {
      gapMs = Math.round(now - prev.releaseTime);
      if (gapMs < threshold) {
        isChatter = true;
      }
      if (gapMs < state.stats.minGapMs && gapMs > 0) {
        state.stats.minGapMs = gapMs;
        statMinGap.textContent = `${gapMs} ms`;
      }
    }

    state.buttonStates[btn] = {
      isDown: true,
      pressTime: now,
      releaseTime: prev.releaseTime,
      holdDuration: 0
    };
    state.activeButtons.add(btn);

    // Update stats
    state.stats.totalClicks++;
    statClicks.textContent = state.stats.totalClicks;

    if (isChatter) {
      state.stats.chatterCount++;
      statChatter.textContent = state.stats.chatterCount;
      statCardChatter.classList.add('danger');
      playChatterAlertSound();
      triggerChatterVisualAlert(btn, gapMs);
    } else {
      playNormalSound();
    }

    updateVisualizer(btn, true, isChatter);

    if (testPad.contains(e.target) || e.target === testPad) {
      state.testPadHolding = true;
      testPad.classList.add('holding');
      statusBanner.className = 'status-banner show';
      if (isChatter) {
        statusBanner.className = 'status-banner show chatter';
        statusBanner.innerHTML = `⚠️ <b>REBOTE DETECTADO:</b> Pulsado tras solo ${gapMs}ms de soltarse`;
      } else {
        statusBanner.className = 'status-banner show success';
        statusBanner.innerHTML = `🟢 Manteniendo ${buttonNames[btn] || 'Botón ' + btn}... Mueve el ratón o mantén pulsado`;
      }
      startHoldTimer(now);
    }

    logEvent({
      time: new Date(),
      type: 'mousedown',
      button: btn,
      buttonName: buttonNames[btn] || `Botón ${btn}`,
      gapMs: prev.releaseTime > 0 ? gapMs : null,
      holdMs: null,
      isChatter: isChatter,
      details: isChatter ? `Rebote (Gap: ${gapMs}ms < ${threshold}ms)` : 'Pulsado normal'
    });
  }

  function handlePointerUp(e) {
    const btn = e.button;
    const now = performance.now();
    const btnData = state.buttonStates[btn];
    
    let holdMs = 0;
    if (btnData && btnData.pressTime > 0) {
      holdMs = Math.round(now - btnData.pressTime);
      if (holdMs > state.stats.maxHoldMs) {
        state.stats.maxHoldMs = holdMs;
        statMaxHold.textContent = `${(holdMs / 1000).toFixed(2)} s`;
      }
    }

    state.buttonStates[btn] = {
      isDown: false,
      pressTime: btnData ? btnData.pressTime : 0,
      releaseTime: now,
      holdDuration: holdMs
    };
    state.activeButtons.delete(btn);

    updateVisualizer(btn, false);

    if (state.activeButtons.size === 0) {
      stopHoldTimer();
      if (statusBanner.classList.contains('success')) {
        statusBanner.innerHTML = `⏱️ Pulsación completada: Duración ${(holdMs / 1000).toFixed(3)}s`;
      }
    }

    logEvent({
      time: new Date(),
      type: 'mouseup',
      button: btn,
      buttonName: buttonNames[btn] || `Botón ${btn}`,
      gapMs: null,
      holdMs: holdMs,
      isChatter: false,
      details: `Soltado (Mantenido: ${holdMs}ms)`
    });
  }

  function triggerChatterVisualAlert(btn, gapMs) {
    testPad.classList.remove('chatter-alert');
    void testPad.offsetWidth;
    testPad.classList.add('chatter-alert');

    setTimeout(() => {
      testPad.classList.remove('chatter-alert');
    }, 600);
  }

  // --- Event Logger ---
  function logEvent(event) {
    state.events.unshift(event);
    if (state.events.length > 500) {
      state.events.pop();
    }
    renderLogTable();
  }

  function renderLogTable() {
    emptyLog.style.display = state.events.length === 0 ? 'block' : 'none';

    const filtered = state.events.filter(ev => {
      if (state.activeFilter === 'chatter') return ev.isChatter;
      if (state.activeFilter === 'lmb') return ev.button === 0;
      if (state.activeFilter === 'rmb') return ev.button === 2;
      return true;
    });

    const rows = filtered.slice(0, 100).map(ev => {
      const timeStr = ev.time.toTimeString().split(' ')[0] + '.' + String(ev.time.getMilliseconds()).padStart(3, '0');
      const rowClass = ev.isChatter ? 'row-chatter' : '';
      const badge = ev.isChatter 
        ? `<span class="badge-tag tag-chatter">⚠️ REBOTE (${ev.gapMs}ms)</span>`
        : `<span class="badge-tag tag-ok">OK</span>`;

      return `
        <tr class="${rowClass}">
          <td>${timeStr}</td>
          <td><b>${ev.type}</b></td>
          <td>${ev.buttonName}</td>
          <td>${ev.holdMs !== null ? `${ev.holdMs} ms` : '-'}</td>
          <td>${ev.gapMs !== null ? `${ev.gapMs} ms` : '-'}</td>
          <td>${badge}</td>
          <td>${ev.details}</td>
        </tr>
      `;
    }).join('');

    logTableBody.innerHTML = rows;
  }

  // --- Export Handlers ---
  function exportCSV() {
    if (state.events.length === 0) {
      showToast('No hay eventos registrados para exportar.');
      return;
    }
    const headers = ['Timestamp', 'Event', 'Button_ID', 'Button_Name', 'Hold_Duration_ms', 'Gap_Since_Release_ms', 'Is_Chatter', 'Details'];
    const csvRows = [headers.join(',')];

    state.events.forEach(ev => {
      const row = [
        `"${ev.time.toISOString()}"`,
        `"${ev.type}"`,
        ev.button,
        `"${ev.buttonName}"`,
        ev.holdMs !== null ? ev.holdMs : '',
        ev.gapMs !== null ? ev.gapMs : '',
        ev.isChatter ? 'TRUE' : 'FALSE',
        `"${ev.details}"`
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mouse_diagnostic_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Archivo CSV descargado con éxito');
  }

  function exportJSON() {
    if (state.events.length === 0) {
      showToast('No hay eventos registrados para exportar.');
      return;
    }
    const data = {
      summary: {
        totalClicks: state.stats.totalClicks,
        chatterCount: state.stats.chatterCount,
        maxHoldMs: state.stats.maxHoldMs,
        minGapMs: state.stats.minGapMs === Infinity ? 0 : state.stats.minGapMs
      },
      events: state.events
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mouse_diagnostic_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Archivo JSON descargado con éxito');
  }

  function copyLogToClipboard() {
    if (state.events.length === 0) {
      showToast('No hay eventos registrados.');
      return;
    }
    const textLines = state.events.slice(0, 50).map(ev => {
      return `[${ev.time.toISOString().slice(11, 23)}] ${ev.type.toUpperCase()} | ${ev.buttonName} | Hold: ${ev.holdMs || '-'}ms | Gap: ${ev.gapMs || '-'}ms | ${ev.isChatter ? '⚠️ CHATTER' : 'OK'}`;
    });
    navigator.clipboard.writeText(textLines.join('\n')).then(() => {
      showToast('Últimos 50 eventos copiados al portapapeles');
    }).catch(() => {
      showToast('No se pudo copiar al portapapeles');
    });
  }

  function clearAllLogs() {
    state.events = [];
    state.stats.totalClicks = 0;
    state.stats.chatterCount = 0;
    state.stats.maxHoldMs = 0;
    state.stats.minGapMs = Infinity;

    statClicks.textContent = '0';
    statChatter.textContent = '0';
    statMaxHold.textContent = '0.00 s';
    statMinGap.textContent = '0 ms';
    statCardChatter.classList.remove('danger');

    renderLogTable();
    showToast('Registros y estadísticas reiniciados');
  }

  // --- Drag & Drop Simulation Playground ---
  const dragItem = document.getElementById('drag-item');
  const dragArea = document.getElementById('drag-canvas-area');
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  dragItem.addEventListener('pointerdown', (e) => {
    isDragging = true;
    dragItem.setPointerCapture(e.pointerId);
    const rect = dragItem.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
  });

  dragItem.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const areaRect = dragArea.getBoundingClientRect();
    let left = e.clientX - areaRect.left - dragOffset.x;
    let top = e.clientY - areaRect.top - dragOffset.y;

    left = Math.max(0, Math.min(left, areaRect.width - dragItem.offsetWidth));
    top = Math.max(0, Math.min(top, areaRect.height - dragItem.offsetHeight));

    dragItem.style.left = `${left}px`;
    dragItem.style.top = `${top}px`;
  });

  function stopDrag(e) {
    if (isDragging) {
      isDragging = false;
      try {
        dragItem.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  dragItem.addEventListener('pointerup', stopDrag);
  dragItem.addEventListener('pointercancel', stopDrag);

  // --- Filter chips ---
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter;
      renderLogTable();
    });
  });

  // --- Action Button Bindings ---
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-copy-log').addEventListener('click', copyLogToClipboard);
  document.getElementById('btn-clear-log').addEventListener('click', clearAllLogs);

  // --- Global Pointer Listeners ---
  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointerup', handlePointerUp);

  // Initialize UI
  renderLogTable();
})();
