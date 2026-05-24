(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const defaults = {
    nature: {
      size: 604,
      x: 93,
      y: 32,
      bounceSpeed: 6.1,
      bounceDeltaX: 2,
      bounceDeltaY: 16,
      mouseInfluence: 5,
      rotation: 0,
      rotationZ: 0,
    },
    pony: {
      size: 524,
      x: 10,
      y: 83.5,
      bounceSpeed: 5.8,
      bounceDeltaX: 5,
      bounceDeltaY: 25,
      mouseInfluence: 2,
      rotation: 0,
      rotationZ: 0,
    },
  };

  const config = structuredClone(defaults);
  const floats = {};
  const bounceTweens = {};

  function getCard(id) {
    return document.querySelector(`[data-float-id="${id}"]`);
  }

  function applyLayout(id) {
    const cfg = config[id];
    const card = getCard(id);
    if (!card) return;

    card.style.width = `${cfg.size}px`;
    card.style.left = `${cfg.x}%`;
    card.style.top = `${cfg.y}%`;
  }

  function applyBounce(id) {
    const cfg = config[id];
    const entry = floats[id];
    if (!entry || prefersReducedMotion) return;

    if (bounceTweens[id]) bounceTweens[id].kill();

    gsap.set(entry.motion, { x: 0, y: 0 });

    bounceTweens[id] = gsap.to(entry.motion, {
      x: cfg.bounceDeltaX,
      y: -cfg.bounceDeltaY,
      duration: cfg.bounceSpeed / 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  function applyAll(id) {
    applyLayout(id);
    applyBounce(id);
    updateTilt(id);
  }

  function initFloat(id) {
    const card = getCard(id);
    if (!card) return;

    const motion = card.querySelector('.hero-float-motion');
    const tilt = card.querySelector('.hero-float-tilt');
    floats[id] = { card, motion, tilt, hover: false, rotX: 0, rotY: 0 };

    applyAll(id);

    card.addEventListener('mouseenter', () => {
      floats[id].hover = true;
    });

    card.addEventListener('mouseleave', () => {
      floats[id].hover = false;
      gsap.to(floats[id], {
        rotX: 0,
        rotY: 0,
        duration: 0.5,
        ease: 'power2.out',
        onUpdate: () => updateTilt(id),
      });
    });

    card.addEventListener('mousemove', (e) => {
      if (!floats[id].hover) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      const influence = config[id].mouseInfluence;

      floats[id].rotY = px * influence;
      floats[id].rotX = -py * influence;
      updateTilt(id);
    });
  }

  function updateTilt(id) {
    const cfg = config[id];
    const { tilt, rotX, rotY } = floats[id];
    gsap.set(tilt, {
      rotateX: rotX,
      rotateY: cfg.rotation + rotY,
      rotateZ: cfg.rotationZ,
      transformPerspective: 800,
    });
  }

  /* ── Tweak panel ── */
  const panel = document.getElementById('tweak-panel');
  const targetSelect = document.getElementById('tweak-target');
  const fields = {
    size: document.getElementById('tweak-size'),
    x: document.getElementById('tweak-x'),
    y: document.getElementById('tweak-y'),
    bounceSpeed: document.getElementById('tweak-bounce-speed'),
    bounceDeltaX: document.getElementById('tweak-bounce-dx'),
    bounceDeltaY: document.getElementById('tweak-bounce-dy'),
    mouseInfluence: document.getElementById('tweak-mouse'),
    rotation: document.getElementById('tweak-rotation'),
    rotationZ: document.getElementById('tweak-rotation-z'),
  };
  const outputs = {
    size: document.getElementById('tweak-size-val'),
    x: document.getElementById('tweak-x-val'),
    y: document.getElementById('tweak-y-val'),
    bounceSpeed: document.getElementById('tweak-bounce-speed-val'),
    bounceDeltaX: document.getElementById('tweak-bounce-dx-val'),
    bounceDeltaY: document.getElementById('tweak-bounce-dy-val'),
    mouseInfluence: document.getElementById('tweak-mouse-val'),
    rotation: document.getElementById('tweak-rotation-val'),
    rotationZ: document.getElementById('tweak-rotation-z-val'),
  };

  function activeId() {
    return targetSelect.value;
  }

  function syncPanelFromConfig() {
    const id = activeId();
    const cfg = config[id];
    Object.keys(fields).forEach((key) => {
      fields[key].value = cfg[key];
      outputs[key].textContent = cfg[key];
    });
  }

  function onFieldChange(key) {
    const id = activeId();
    config[id][key] = parseFloat(fields[key].value);
    outputs[key].textContent = fields[key].value;

    if (key === 'size' || key === 'x' || key === 'y') {
      applyLayout(id);
    } else if (key.startsWith('bounce')) {
      applyBounce(id);
    } else if (key === 'rotation' || key === 'rotationZ') {
      updateTilt(id);
    }
  }

  Object.keys(fields).forEach((key) => {
    fields[key].addEventListener('input', () => onFieldChange(key));
  });

  targetSelect.addEventListener('change', syncPanelFromConfig);

  document.getElementById('tweak-toggle').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    document.getElementById('tweak-toggle').setAttribute(
      'aria-expanded',
      String(!panel.classList.contains('collapsed'))
    );
  });

  document.getElementById('tweak-copy').addEventListener('click', () => {
    const text = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('tweak-copy');
      const prev = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = prev; }, 1200);
    });
  });

  initFloat('nature');
  initFloat('pony');
  syncPanelFromConfig();
})();
