(() => {
  'use strict';

  const CONFIG = Object.freeze({
    latitude: 56.1439,
    longitude: 47.2489,
    weatherRefreshMs: 15 * 60 * 1000,
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startedAt = performance.now();

  const cache = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); }
      catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch { /* localStorage unavailable */ }
    },
  };

  function initClock() {
    const root = $('#time');
    const dateElement = $('#date');
    if (!root || !dateElement) return;

    const digits = [];
    const createSlot = (parent, className = '') => {
      const slot = document.createElement('span');
      slot.className = `slot${className ? ` ${className}` : ''}`;
      parent.append(slot);
      return slot;
    };
    const createColon = (parent) => {
      const slot = createSlot(parent, 'colon');
      const colon = document.createElement('span');
      colon.textContent = ':';
      slot.append(colon);
    };

    const hourMinute = document.createElement('span');
    hourMinute.className = 'hm';
    const seconds = document.createElement('span');
    seconds.className = 'sec';
    root.append(hourMinute, seconds);
    digits.push(createSlot(hourMinute), createSlot(hourMinute));
    createColon(hourMinute);
    digits.push(createSlot(hourMinute), createSlot(hourMinute));
    digits.push(createSlot(seconds), createSlot(seconds));

    function setDigit(slot, value) {
      if (slot.dataset.value === value) return;
      const firstRender = slot.dataset.value === undefined;
      slot.dataset.value = value;
      const oldDigit = slot.querySelector('.dg:not(.out)');
      if (oldDigit) {
        oldDigit.classList.add('out');
        oldDigit.addEventListener('animationend', () => oldDigit.remove(), { once: true });
        window.setTimeout(() => oldDigit.remove(), 650);
      }
      const next = document.createElement('span');
      next.className = `dg${firstRender || reducedMotion ? '' : ' in'}`;
      next.textContent = value;
      slot.append(next);
    }

    const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    let lastDate = '';
    function tick() {
      const now = new Date();
      const formatted = timeFormatter.format(now);
      const numeric = formatted.replace(/\D/g, '');
      digits.forEach((slot, i) => setDigit(slot, numeric[i] || '0'));
      const date = dateFormatter.format(now);
      if (date !== lastDate) {
        dateElement.textContent = date;
        lastDate = date;
      }
      root.setAttribute('aria-label', formatted);
      window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    }
    tick();
  }

  /* ---------- floating windows: open, close, focus and drag ---------- */
  function initWindowManager() {
    const windows = $$('[data-window]');
    if (!windows.length) return;

    let topLayer = 30;
    let dragState = null;
    let lastWidth = window.innerWidth;
    const launcherButtons = $$('[data-open-window]');

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    function setAbsolutePosition(win) {
      if (win.dataset.positioned === 'true') return;
      const rect = win.getBoundingClientRect();
      win.style.left = `${Math.round(rect.left)}px`;
      win.style.top = `${Math.round(rect.top)}px`;
      win.style.right = 'auto';
      win.style.bottom = 'auto';
      win.style.transform = 'none';
      win.dataset.positioned = 'true';
    }

    function keepOnscreen(win) {
      if (win.hidden) return;
      const rect = win.getBoundingClientRect();
      const left = clamp(rect.left, 8, window.innerWidth - rect.width - 8);
      const top = clamp(rect.top, 8, window.innerHeight - rect.height - 8);
      win.style.left = `${Math.round(left)}px`;
      win.style.top = `${Math.round(top)}px`;
    }

    function bringToFront(win) {
      topLayer += 1;
      win.style.zIndex = String(topLayer);
    }

    function updateLauncherState(id, expanded) {
      launcherButtons
        .filter((button) => button.dataset.openWindow === id)
        .forEach((button) => button.setAttribute('aria-expanded', String(expanded)));
    }

    function openWindow(id) {
      const win = document.getElementById(id);
      if (!win) return;
      win.hidden = false;
      setAbsolutePosition(win);
      keepOnscreen(win);
      bringToFront(win);
      updateLauncherState(id, true);
    }

    function closeWindow(win) {
      win.hidden = true;
      updateLauncherState(win.id, false);
    }

    windows.forEach((win, index) => {
      if (!win.hidden) {
        setAbsolutePosition(win);
        keepOnscreen(win);
        win.style.zIndex = String(20 + index);
      }

      win.addEventListener('pointerdown', () => bringToFront(win), { passive: true });

      const handle = $('[data-drag-handle]', win);
      if (!handle) return;

      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target.closest('button, a')) return;

        setAbsolutePosition(win);
        bringToFront(win);
        const rect = win.getBoundingClientRect();
        dragState = {
          win,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
        };
        win.classList.add('dragging');
        try { handle.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable. */ }
        event.preventDefault();
      });

      handle.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.win !== win || dragState.pointerId !== event.pointerId) return;
        const rect = win.getBoundingClientRect();
        const nextLeft = dragState.left + event.clientX - dragState.startX;
        const nextTop = dragState.top + event.clientY - dragState.startY;
        win.style.left = `${Math.round(clamp(nextLeft, 8, window.innerWidth - rect.width - 8))}px`;
        win.style.top = `${Math.round(clamp(nextTop, 8, window.innerHeight - rect.height - 8))}px`;
      });

      const finishDrag = (event) => {
        if (!dragState || dragState.win !== win || dragState.pointerId !== event.pointerId) return;
        dragState = null;
        win.classList.remove('dragging');
        try {
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        } catch { /* Ignore an already released pointer. */ }
      };
      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);
      handle.addEventListener('lostpointercapture', finishDrag);
    });

    launcherButtons.forEach((button) => {
      button.addEventListener('click', () => openWindow(button.dataset.openWindow));
    });

    $$('[data-close-window]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const win = button.closest('[data-window]');
        if (win) closeWindow(win);
      });
    });

    window.addEventListener('resize', () => {
      const crossedPhoneBreakpoint = (lastWidth <= 640) !== (window.innerWidth <= 640);
      lastWidth = window.innerWidth;
      windows.forEach((win) => {
        if (crossedPhoneBreakpoint) {
          win.style.left = '';
          win.style.top = '';
          win.style.right = '';
          win.style.bottom = '';
          win.style.transform = '';
          delete win.dataset.positioned;
        }
        if (!win.hidden) {
          setAbsolutePosition(win);
          keepOnscreen(win);
        }
      });
    }, { passive: true });
  }

  const DAY_ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sunset: '<path d="M3 18h18M5 15a7 7 0 0 1 14 0M12 2v4M4.9 6.9l2.2 2.2M19.1 6.9l-2.2 2.2"/>',
    moon: '<path d="M19.7 15.15A8.35 8.35 0 0 1 8.85 4.3 8.45 8.45 0 1 0 19.7 15.15Z" fill="currentColor" stroke="none"/>',
  };

  function initGreeting() {
    const root = $('#greeting');
    const icon = $('#greeting-i');
    const label = $('#greeting-text');
    if (!root || !icon || !label) return;

    function update() {
      const hour = new Date().getHours();
      let message, iconName;
      if (hour >= 5 && hour < 12) [message, iconName] = ['Good morning', 'sun'];
      else if (hour >= 12 && hour < 17) [message, iconName] = ['Good afternoon', 'sun'];
      else if (hour >= 17 && hour < 22) [message, iconName] = ['Good evening', 'sunset'];
      else [message, iconName] = ['Good night', 'moon'];
      label.textContent = message;
      icon.innerHTML = DAY_ICONS[iconName];
      root.setAttribute('aria-label', `${message}, local time`);
    }
    update();
    window.setInterval(update, 60 * 1000);
  }

  const WEATHER_ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M19.7 15.15A8.35 8.35 0 0 1 8.85 4.3 8.45 8.45 0 1 0 19.7 15.15Z" fill="currentColor" stroke="none"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/>',
    rain: '<path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 8 3.5 3.5 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    snow: '<path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 8 3.5 3.5 0 0 0 7 15z"/><path d="M8 19h.01M12 20h.01M16 19h.01"/>',
    storm: '<path d="M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 7 3.5 3.5 0 0 0 7 14z"/><path d="M12 14l-2 4h3l-2 4"/>',
    fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
  };
  function describeWeather(code, isDay) {
    if (code === 0) return [isDay ? 'ясно' : 'ясная ночь', isDay ? 'sun' : 'moon'];
    if (code === 1) return ['малооблачно', isDay ? 'sun' : 'moon'];
    if (code === 2) return ['облачно с прояснениями', 'cloud'];
    if (code === 3) return ['пасмурно', 'cloud'];
    if (code === 45 || code === 48) return ['туман', 'fog'];
    if (code >= 51 && code <= 57) return ['морось', 'rain'];
    if (code >= 61 && code <= 67) return ['дождь', 'rain'];
    if (code >= 71 && code <= 77) return ['снег', 'snow'];
    if (code >= 80 && code <= 82) return ['ливень', 'rain'];
    if (code === 85 || code === 86) return ['снегопад', 'snow'];
    if (code >= 95) return ['гроза', 'storm'];
    return ['переменная погода', 'cloud'];
  }
  function formatTemperature(value) {
    const rounded = Math.round(value);
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}°`;
  }
  function renderWeather(weather) {
    const root = $('#wx'), icon = $('#wx-i'), temp = $('#wx-t'), description = $('#wx-d');
    if (!root || !icon || !temp || !description || !Number.isFinite(weather.temp) || !Number.isFinite(weather.code)) return;
    const [text, iconName] = describeWeather(weather.code, weather.isDay);
    icon.innerHTML = WEATHER_ICONS[iconName] || WEATHER_ICONS.cloud;
    temp.textContent = formatTemperature(weather.temp);
    description.textContent = text;
    root.hidden = false;
  }
  async function loadWeather() {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${CONFIG.latitude}&longitude=${CONFIG.longitude}`
      + '&current=temperature_2m,is_day,weather_code&timezone=auto';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Weather API: ${response.status}`);
      const payload = await response.json();
      const current = payload.current;
      if (!current) throw new Error('Weather API: missing current conditions');
      const weather = { temp: Number(current.temperature_2m), code: Number(current.weather_code), isDay: Number(current.is_day) === 1 };
      cache.set('weather', { weather, at: Date.now() });
      renderWeather(weather);
    } catch {
      // goyda
    } finally {
      window.clearTimeout(timeout);
    }
  }
  function initWeather() {
    const cached = cache.get('weather');
    if (cached?.weather && Date.now() - cached.at < 3 * 60 * 60 * 1000) renderWeather(cached.weather);
    loadWeather();
    window.setInterval(loadWeather, CONFIG.weatherRefreshMs);
  }

  function getOS() {
    const ua = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    if (/Windows/i.test(platform) || /Windows/i.test(ua)) return 'Windows';
    if (/Android/i.test(ua)) return 'Android';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1)) return 'iOS / iPadOS';
    if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) return 'macOS';
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'Linux';
    return platform || 'n/a';
  }
  function getBrowser() {
    const ua = navigator.userAgent || '';
    const brands = navigator.userAgentData?.brands || [];
    const chromiumBrand = brands.find((brand) => /Google Chrome|Chromium|Microsoft Edge/i.test(brand.brand));
    if (/Edg\//.test(ua)) return `Edge ${ua.match(/Edg\/(\d+)/)?.[1] || ''}`.trim();
    if (/OPR\//.test(ua)) return `Opera ${ua.match(/OPR\/(\d+)/)?.[1] || ''}`.trim();
    if (/Firefox\//.test(ua)) return `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] || ''}`.trim();
    if (/CriOS\//.test(ua)) return `Chrome ${ua.match(/CriOS\/(\d+)/)?.[1] || ''}`.trim();
    if (/Chrome\//.test(ua) || chromiumBrand) return `${chromiumBrand?.brand || 'Chrome'} ${ua.match(/Chrome\/(\d+)/)?.[1] || chromiumBrand?.version || ''}`.trim();
    if (/Safari\//.test(ua)) return `Safari ${ua.match(/Version\/(\d+)/)?.[1] || ''}`.trim();
    return 'n/a';
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  }
  function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
  function setText(id, value) {
    const node = $(`#${id}`);
    if (node) node.textContent = value;
  }
  function initSystem() {
    setText('f-os', getOS());
    setText('f-br', getBrowser());
    setText('f-loc', `${navigator.language || 'n/a'} · ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'n/a'}`);
    setText('f-res', `${window.screen?.width || '—'} × ${window.screen?.height || '—'}`);
    const updateViewport = () => setText('f-vp', `${window.innerWidth} × ${window.innerHeight}`);
    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });

    const cpu = Number(navigator.hardwareConcurrency);
    setText('f-cpu', cpu > 0 ? `${cpu} threads` : 'n/a');

    const memoryLabel = $('#f-mem-k');
    const memoryValue = $('#f-mem');
    const memoryMeter = $('#f-mem-m');
    const memoryBar = $('#f-mem-m > span');
    const approximateRam = Number(navigator.deviceMemory);
    const heap = performance.memory;
    if (approximateRam > 0) {
      if (memoryLabel) memoryLabel.textContent = 'RAM (est.)';
      if (memoryValue) memoryValue.textContent = `~${approximateRam} GB`;
      if (memoryMeter) memoryMeter.hidden = true;
    } else if (heap && Number.isFinite(heap.usedJSHeapSize) && Number.isFinite(heap.jsHeapSizeLimit)) {
      if (memoryLabel) memoryLabel.textContent = 'JS heap';
      if (memoryValue) memoryValue.textContent = `${formatBytes(heap.usedJSHeapSize)} / ${formatBytes(heap.jsHeapSizeLimit)}`;
      if (memoryMeter) memoryMeter.hidden = false;
      if (memoryBar) memoryBar.style.width = `${Math.min(100, heap.usedJSHeapSize / heap.jsHeapSizeLimit * 100)}%`;
    } else {
      if (memoryLabel) memoryLabel.textContent = 'memory';
      if (memoryValue) memoryValue.textContent = 'n/a';
      if (memoryMeter) memoryMeter.hidden = true;
    }

    const updateNetwork = () => {
      if (!navigator.onLine) { setText('f-net', 'offline'); return; }
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!connection) { setText('f-net', 'online'); return; }
      const bits = [connection.effectiveType, Number.isFinite(connection.downlink) ? `${connection.downlink} Mb/s` : ''].filter(Boolean);
      setText('f-net', bits.join(' · ') || 'online');
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    connection?.addEventListener?.('change', updateNetwork);

    function updateBattery(battery) {
      const percent = Math.round(battery.level * 100);
      setText('f-bat', `${percent}%${battery.charging ? ' · charging' : ''}`);
    }
    if (typeof navigator.getBattery === 'function') {
      navigator.getBattery().then((battery) => {
        updateBattery(battery);
        battery.addEventListener('levelchange', () => updateBattery(battery));
        battery.addEventListener('chargingchange', () => updateBattery(battery));
      }).catch(() => setText('f-bat', 'n/a'));
    } else {
      setText('f-bat', 'n/a');
    }

    let frames = [];
    let previousFrame = 0;
    let raf = 0;
    const measure = (timestamp) => {
      if (previousFrame) frames.push(timestamp - previousFrame);
      previousFrame = timestamp;
      if (frames.length < 45 && !document.hidden) {
        raf = requestAnimationFrame(measure);
      } else {
        if (frames.length) {
          const sorted = [...frames].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          const hz = Math.max(1, Math.round(1000 / median));
          setText('f-hz', `${hz} Hz`);
        } else setText('f-hz', 'n/a');
        if (raf) cancelAnimationFrame(raf);
      }
    };
    raf = requestAnimationFrame(measure);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && frames.length < 45) {
        previousFrame = 0;
        raf = requestAnimationFrame(measure);
      }
    });

    window.setInterval(() => setText('f-up', formatUptime(performance.now() - startedAt)), 1000);
    setText('f-up', formatUptime(performance.now() - startedAt));
  }

  function initArt() {
    const canvas = $('#art');
    const win = $('#fastfetch-window');
    if (!canvas || !win) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLUMNS = 44, ROWS = 22, RAMP = ' .,:;-=+*#%@';
    const FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    const colorStops = ['#4f4a86', '#8f86d6', '#e58a9b', '#f0b98d', '#d8d3a6'].map((hex) =>
      [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
    );
    function palette(value) {
      const position = Math.min(.9999, Math.max(0, value)) * (colorStops.length - 1);
      const index = Math.floor(position), fraction = position - index;
      return colorStops[index].map((channel, i) => channel + (colorStops[index + 1][i] - channel) * fraction);
    }
    let width = 0, height = 0, charWidth = 0, charHeight = 0, fontSize = 0;
    let lightX = -.5, lightY = -.4, rafId = 0, lastFrame = 0, resizeTimer = 0;
    const pointer = { active: false, x: 0, y: 0 };
    const randomAt = (i, j) => {
      const value = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const tilt = .38, cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt);

    function sizeCanvas() {
      const bounds = canvas.parentElement.getBoundingClientRect();
      if (bounds.width < 10 || win.hidden) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const maxWidth = Math.min(bounds.width, 460);
      fontSize = Math.max(5, maxWidth / (COLUMNS * .6));
      ctx.font = `${fontSize}px ${FONT}`;
      charWidth = ctx.measureText('M').width;
      if (charWidth * COLUMNS > maxWidth) {
        fontSize *= maxWidth / (charWidth * COLUMNS);
        ctx.font = `${fontSize}px ${FONT}`;
        charWidth = ctx.measureText('M').width;
      }
      charHeight = fontSize * 1.22;
      width = charWidth * COLUMNS;
      height = charHeight * ROWS;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fontSize}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      return true;
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      const targetX = pointer.active ? pointer.x : -.55 + Math.cos(time * .0004) * .5;
      const targetY = pointer.active ? pointer.y : -.35 + Math.sin(time * .0003) * .25;
      lightX += (targetX - lightX) * .07;
      lightY += (targetY - lightY) * .07;
      const lightZ = .6, length = Math.hypot(lightX, lightY, lightZ);
      const lx = lightX / length, ly = lightY / length, lz = lightZ / length;
      const radius = Math.min(width, height) * .46, centerX = width / 2, centerY = height / 2;
      const spin = time * .00028;

      for (let row = 0; row < ROWS; row++) {
        for (let column = 0; column < COLUMNS; column++) {
          const px = (column + .5) * charWidth, py = (row + .5) * charHeight;
          const x = (px - centerX) / radius, y = (py - centerY) / radius;
          const distanceSquared = x * x + y * y;
          if (distanceSquared > 1) {
            const random = randomAt(column, row);
            if (random > .983) {
              const alpha = .14 + .26 * (.5 + .5 * Math.sin(time * .002 + column * 3.1 + row * 7.3));
              ctx.fillStyle = `rgba(214,208,236,${alpha.toFixed(3)})`;
              ctx.fillText(random > .995 ? '+' : '.', px, py);
            }
            continue;
          }
          const z = Math.sqrt(1 - distanceSquared);
          const rotatedY = y * cosTilt - z * sinTilt;
          const rotatedZ = y * sinTilt + z * cosTilt;
          const longitude = Math.atan2(x, rotatedZ) + spin;
          const latitude = Math.asin(Math.max(-1, Math.min(1, rotatedY)));
          const pattern = .5 + .5 * Math.sin(latitude * 9 + 1.6 * Math.sin(longitude * 2 + latitude * 3 + time * .0002) + .6 * Math.sin(longitude * 5 - time * .00015));
          const lambert = Math.max(0, x * lx + y * ly + z * lz);
          const light = .05 + .95 * Math.pow(lambert, .9);
          const brightness = light * (.45 + .55 * pattern);
          const rampIndex = Math.floor(brightness * (RAMP.length - 1));
          if (rampIndex <= 0) {
            if (distanceSquared > .8) { ctx.fillStyle = 'rgba(120,110,170,.28)'; ctx.fillText('.', px, py); }
            continue;
          }
          const color = palette(pattern), factor = .38 + .62 * light;
          ctx.fillStyle = `rgb(${(color[0] * factor) | 0},${(color[1] * factor) | 0},${(color[2] * factor) | 0})`;
          ctx.fillText(RAMP[rampIndex], px, py);
        }
      }
    }
    function loop(time) {
      if (document.hidden || win.hidden) { rafId = 0; return; }
      rafId = requestAnimationFrame(loop);
      if (time - lastFrame < 33) return;
      lastFrame = time;
      draw(time);
    }
    function start() {
      if (!sizeCanvas()) return;
      if (reducedMotion) { draw(2000); return; }
      if (!rafId && !document.hidden && !win.hidden) rafId = requestAnimationFrame(loop);
    }
    function stopOrStart() {
      if (document.hidden || win.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        return;
      }
      start();
    }

    window.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' || win.hidden) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const half = Math.min(rect.width, rect.height) * .46;
      pointer.x = Math.max(-1.4, Math.min(1.4, (event.clientX - (rect.left + rect.width / 2)) / half));
      pointer.y = Math.max(-1.4, Math.min(1.4, (event.clientY - (rect.top + rect.height / 2)) / half));
      pointer.active = true;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { pointer.active = false; });
    document.addEventListener('visibilitychange', stopOrStart);
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (sizeCanvas()) {
          if (reducedMotion) draw(2000);
          else stopOrStart();
        }
      }, 60);
    });
    resizeObserver.observe(canvas.parentElement);
    const mutationObserver = new MutationObserver(stopOrStart);
    mutationObserver.observe(win, { attributes: true, attributeFilter: ['hidden'] });
    const fontReady = document.fonts?.load('13px "JetBrains Mono"') || Promise.resolve();
    Promise.race([fontReady, new Promise((resolve) => window.setTimeout(resolve, 1800))]).then(start, start);
  }

  initClock();
  initWindowManager();
  initGreeting();
  initWeather();
  initSystem();
  initArt();
})();
