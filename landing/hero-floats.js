(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const config = {
    nature: {
      size: 604,
      x: 93,
      y: 32,
      bounceSpeed: 6.1,
      bounceDeltaX: 2,
      bounceDeltaY: 16,
      mouseInfluence: 5,
      rotation: -13,
      rotationZ: 11.5,
    },
    pony: {
      size: 524,
      x: 10,
      y: 83.5,
      bounceSpeed: 5.8,
      bounceDeltaX: 5,
      bounceDeltaY: 25,
      mouseInfluence: 2,
      rotation: 13.5,
      rotationZ: -15.5,
    },
  };

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

  initFloat('nature');
  initFloat('pony');
})();
