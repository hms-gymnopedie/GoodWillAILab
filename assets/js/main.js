(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  };

  /* ---------- i18n (KO ⇄ EN) ----------
     한국어는 HTML 원문을 그대로 사용하고, 영어는 페이지의 #i18n-en JSON에서 가져옵니다. */
  const enDict = (() => {
    const el = document.getElementById('i18n-en');
    try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
  })();

  const textNodes = [...document.querySelectorAll('[data-i18n]')];
  const attrNodes = [...document.querySelectorAll('[data-i18n-attr]')];
  const metaDesc = document.querySelector('meta[name="description"]');

  const koSnapshot = {
    title: document.title,
    description: metaDesc ? metaDesc.content : '',
    text: textNodes.map((el) => el.innerHTML),
    attrs: attrNodes.map((el) => {
      const [attr] = el.dataset.i18nAttr.split(':');
      return el.getAttribute(attr);
    }),
  };

  const langBtn = document.querySelector('.lang-toggle');
  let currentLang = 'ko';

  function applyLang(lang) {
    currentLang = lang === 'en' ? 'en' : 'ko';
    const en = currentLang === 'en';

    textNodes.forEach((el, i) => {
      const value = en ? enDict[el.dataset.i18n] : koSnapshot.text[i];
      if (value != null) el.innerHTML = value;
    });
    attrNodes.forEach((el, i) => {
      const [attr, key] = el.dataset.i18nAttr.split(':');
      const value = en ? enDict[key] : koSnapshot.attrs[i];
      if (value != null) el.setAttribute(attr, value);
    });

    document.title = en && enDict._title ? enDict._title : koSnapshot.title;
    if (metaDesc) metaDesc.content = en && enDict._description ? enDict._description : koSnapshot.description;
    root.lang = currentLang;

    if (langBtn) {
      langBtn.textContent = en ? 'KO' : 'EN';
      langBtn.setAttribute('aria-label', en ? '한국어로 보기' : 'Switch to English');
    }
    updateSoundLabel();
    store.set('gwl-lang', currentLang);
  }

  if (langBtn) {
    langBtn.addEventListener('click', () => applyLang(currentLang === 'en' ? 'ko' : 'en'));
  }

  /* ---------- 432Hz ambient sound ----------
     음원 파일 없이 Web Audio로 432Hz 기반 화음을 합성합니다. 기본은 꺼짐이며, 사용자가 누를 때만 재생합니다. */
  const soundBtn = document.querySelector('.sound-toggle');
  let audio = null;
  let soundOn = false;

  function buildAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    filter.connect(master);
    master.connect(ctx.destination);

    // A=432Hz 조율: 108(A2) · 162(E3) · 216(A3) · 272.2(C#4) · 432(A4)
    const voices = [
      { f: 108, g: 0.32, type: 'sine' },
      { f: 162, g: 0.18, type: 'sine' },
      { f: 216, g: 0.20, type: 'sine' },
      { f: 272.2, g: 0.07, type: 'sine' },
      { f: 432, g: 0.05, type: 'triangle' },
    ];
    voices.forEach((v, i) => {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.value = v.f;
      osc.detune.value = (i % 2 ? 1 : -1) * 3;

      const gain = ctx.createGain();
      gain.gain.value = v.g;

      // 느린 숨결 같은 볼륨 흔들림
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.023;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = v.g * 0.45;
      lfo.connect(lfoGain).connect(gain.gain);

      osc.connect(gain).connect(filter);
      osc.start();
      lfo.start();
    });
    return { ctx, master };
  }

  function updateSoundLabel() {
    if (!soundBtn) return;
    const en = currentLang === 'en';
    const label = soundOn
      ? (en ? enDict['sound.labelOff'] : '432Hz 앰비언트 사운드 끄기')
      : (en ? enDict['sound.label'] : '432Hz 앰비언트 사운드 켜기');
    soundBtn.setAttribute('aria-label', label);
    soundBtn.setAttribute('aria-pressed', String(soundOn));
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', async () => {
      if (!audio) audio = buildAudio();
      if (!audio) return;
      const { ctx, master } = audio;
      const now = ctx.currentTime;
      soundOn = !soundOn;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      if (soundOn) {
        await ctx.resume();
        master.gain.linearRampToValueAtTime(0.09, now + 2);
      } else {
        master.gain.linearRampToValueAtTime(0, now + 1.5);
        setTimeout(() => { if (!soundOn) ctx.suspend(); }, 1600);
      }
      updateSoundLabel();
    });
  }

  /* ---------- Warm Lumos Glow ---------- */
  const lumos = document.querySelector('.lumos');
  if (lumos && canHover) {
    if (reducedMotion) {
      // 움직임 없이 화면 상단에 고정된 은은한 빛만 표시
      lumos.style.transform = `translate3d(${window.innerWidth * 0.7}px, ${window.innerHeight * 0.3}px, 0)`;
      lumos.classList.add('is-on');
    } else {
      let tx = window.innerWidth / 2, ty = window.innerHeight / 3;
      let x = tx, y = ty, raf = 0;
      const EASE = 0.1;

      const tick = () => {
        x += (tx - x) * EASE;
        y += (ty - y) * EASE;
        lumos.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
      };
      window.addEventListener('pointermove', (e) => {
        tx = e.clientX; ty = e.clientY;
        lumos.classList.add('is-on');
        if (!raf) raf = requestAnimationFrame(tick);
      }, { passive: true });
      document.addEventListener('pointerleave', () => lumos.classList.remove('is-on'));
      lumos.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }

  /* ---------- Header state ---------- */
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Reveal on scroll ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach((el) => io.observe(el));
  }

  /* ---------- Initial language ---------- */
  const params = new URLSearchParams(location.search);
  applyLang(params.get('lang') || store.get('gwl-lang') || 'ko');
})();
