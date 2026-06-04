gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Hero entrance ── */
const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
heroTl
  .from('.hero-eyebrow', { y: 30, opacity: 0, duration: 0.8 })
  .from('.hero-title .line', { y: 60, opacity: 0, duration: 1, stagger: 0.15 }, '-=0.4')
  .from('.hero-sub', { y: 30, opacity: 0, duration: 0.8 }, '-=0.5')
  .from('.hero-actions', { y: 20, opacity: 0, duration: 0.7 }, '-=0.4')
  .from('.scroll-hint', { opacity: 0, duration: 0.6 }, '-=0.3');

/* Continuous orb drift */
if (!prefersReducedMotion) {
  gsap.to('.orb-1', { x: 40, y: -30, duration: 6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gsap.to('.orb-2', { x: -30, y: 20, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gsap.to('.orb-3', { x: 20, y: -15, duration: 5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

/* ── Scroll reveals ── */
gsap.utils.toArray('.reveal').forEach((el) => {
  gsap.from(el, {
    y: 50,
    opacity: 0,
    duration: 1,
    ease: 'power3.out',
    immediateRender: false,
    scrollTrigger: {
      trigger: el,
      start: 'top 85%',
      toggleActions: 'play none none none',
      once: true,
    },
  });
});

gsap.utils.toArray('.reveal-statement').forEach((el, i) => {
  gsap.from(el, {
    y: 26,
    opacity: 0,
    duration: 0.7,
    delay: i * 0.08,
    ease: 'power3.out',
    immediateRender: false,
    scrollTrigger: {
      trigger: '.not-average',
      start: 'top 72%',
      toggleActions: 'play none none none',
      once: true,
    },
  });
});

/* ── Before / After comparison ── */
const comparisonSection = document.querySelector('.comparison');
const comparisonPin = document.querySelector('.comparison-pin');
const layerBefore = document.getElementById('comparison-before');
const slider = document.getElementById('comparison-slider');

const boringLetters = [...document.querySelectorAll('.word-boring .letter')];
const funLetters = [...document.querySelectorAll('.word-fun .letter')];

let boringThresholds = [];
let funThresholds = [];
const boringCrossed = new Set();
const funCrossed = new Set();
let comparisonReady = false;
let comparisonTicking = false;

function cacheLetterThresholds() {
  const stageRect = comparisonPin.getBoundingClientRect();
  const stageW = stageRect.width || window.innerWidth;
  boringThresholds = boringLetters.map((letter) => {
    const rect = letter.getBoundingClientRect();
    return (rect.left + rect.width / 2 - stageRect.left) / stageW;
  });
  funThresholds = funLetters.map((letter) => {
    const rect = letter.getBoundingClientRect();
    return (rect.left + rect.width / 2 - stageRect.left) / stageW;
  });
}

function animateLetter(letter, type) {
  letter.classList.add(type === 'boring' ? 'pop-boring' : 'pop-fun');
  if (type === 'fun') {
    gsap.fromTo(
      letter,
      { scale: 0.2, rotation: gsap.utils.random(-30, 30), y: 30 },
      {
        scale: 1,
        rotation: 0,
        y: 0,
        opacity: 1,
        duration: 0.7,
        ease: 'elastic.out(1, 0.5)',
        overwrite: true,
      }
    );
  } else {
    gsap.to(letter, {
      scale: gsap.utils.random(0.2, 0.5),
      rotation: gsap.utils.random(-20, 20),
      y: gsap.utils.random(-40, -80),
      opacity: 0,
      duration: 0.6,
      ease: 'back.in(2)',
      overwrite: true,
    });
  }
}

function applyComparisonProgress(progress) {
  const p = gsap.utils.clamp(0, 1, progress);
  const clipLeft = p * 100;

  layerBefore.style.clipPath = `inset(0 0 0 ${clipLeft}%)`;
  slider.style.left = `${p * 100}%`;

  boringLetters.forEach((letter, i) => {
    if (p > boringThresholds[i] && !boringCrossed.has(i)) {
      boringCrossed.add(i);
      animateLetter(letter, 'boring');
    } else if (p <= boringThresholds[i] && boringCrossed.has(i)) {
      boringCrossed.delete(i);
      letter.classList.remove('pop-boring');
      gsap.set(letter, { clearProps: 'all' });
    }
  });

  funLetters.forEach((letter, i) => {
    if (p > funThresholds[i] && !funCrossed.has(i)) {
      funCrossed.add(i);
      animateLetter(letter, 'fun');
    } else if (p <= funThresholds[i] && funCrossed.has(i)) {
      funCrossed.delete(i);
      letter.classList.remove('pop-fun');
      gsap.set(letter, { opacity: 0.3, scale: 0.8, rotation: 0, y: 0 });
    }
  });
}

function initComparisonScroll() {
  if (comparisonReady) return;
  comparisonReady = true;

  cacheLetterThresholds();
  updateComparisonFromScroll();
  window.addEventListener('scroll', requestComparisonUpdate, { passive: true });
  window.addEventListener('resize', () => {
    resetComparisonLetters();
    cacheLetterThresholds();
    updateComparisonFromScroll();
  });
}

function resetComparisonLetters() {
  boringCrossed.clear();
  funCrossed.clear();
  boringLetters.forEach((letter) => {
    letter.classList.remove('pop-boring');
    gsap.set(letter, { clearProps: 'all' });
  });
  funLetters.forEach((letter) => {
    letter.classList.remove('pop-fun');
    gsap.set(letter, { opacity: 0.3, scale: 0.8, rotation: 0, y: 0 });
  });
}

function getComparisonProgress() {
  const rect = comparisonSection.getBoundingClientRect();
  const scrollable = comparisonSection.offsetHeight - window.innerHeight;
  if (scrollable <= 0) return rect.top <= 0 ? 1 : 0;
  return gsap.utils.clamp(0, 1, -rect.top / scrollable);
}

function updateComparisonFromScroll() {
  comparisonTicking = false;
  applyComparisonProgress(getComparisonProgress());
}

function requestComparisonUpdate() {
  if (comparisonTicking) return;
  comparisonTicking = true;
  requestAnimationFrame(updateComparisonFromScroll);
}

initComparisonScroll();

window.addEventListener('load', () => {
  resetComparisonLetters();
  cacheLetterThresholds();
  updateComparisonFromScroll();
  ScrollTrigger.refresh();
});

/* Slider knob pulse while in view */
gsap.to('.slider-knob', {
  scale: 1.08,
  boxShadow: '0 0 40px rgba(255,45,122,0.7), 0 4px 20px rgba(0,0,0,0.4)',
  duration: 1.2,
  repeat: -1,
  yoyo: true,
  ease: 'sine.inOut',
  scrollTrigger: {
    trigger: comparisonSection,
    start: 'top bottom',
    end: 'bottom top',
    toggleActions: 'play pause resume pause',
  },
});

/* ── Productivity parallax bg ── */
gsap.to('.productivity-bg img', {
  y: 80,
  scale: 1.1,
  scrollTrigger: {
    trigger: '.productivity',
    start: 'top bottom',
    end: 'bottom top',
    scrub: 1,
  },
});

/* Feature stagger */
gsap.from('.feature', {
  x: -40,
  opacity: 0,
  duration: 0.8,
  stagger: 0.15,
  ease: 'power3.out',
  immediateRender: false,
  scrollTrigger: {
    trigger: '.feature-list',
    start: 'top 80%',
    toggleActions: 'play none none none',
    once: true,
  },
});

/* ── Extension CTA floating icons ── */
if (!prefersReducedMotion) {
  gsap.utils.toArray('.float-icon').forEach((icon, i) => {
    gsap.to(icon, {
      y: gsap.utils.random(-30, -60),
      x: gsap.utils.random(-20, 20),
      rotation: gsap.utils.random(-180, 180),
      duration: gsap.utils.random(4, 7),
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      delay: i * 0.4,
    });
  });
}

/* CTA button glow pulse */
gsap.to('.extension-cta .btn-primary', {
  boxShadow: '0 0 40px rgba(255,45,122,0.6), 0 8px 32px rgba(255,45,122,0.3)',
  duration: 2,
  repeat: -1,
  yoyo: true,
  ease: 'sine.inOut',
  scrollTrigger: {
    trigger: '.extension-cta',
    start: 'top 70%',
    toggleActions: 'play pause resume pause',
  },
});

/* ── Nav background on scroll ── */
ScrollTrigger.create({
  start: 100,
  onUpdate: (self) => {
    const nav = document.querySelector('.nav');
    if (self.scroll() > 80) {
      nav.style.background = 'rgba(255, 249, 252, 0.95)';
    } else {
      nav.style.background = 'rgba(255, 249, 252, 0.75)';
    }
  },
});

/* Refresh after images load */
window.addEventListener('load', () => ScrollTrigger.refresh());
