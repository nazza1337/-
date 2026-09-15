let isMusicPlaying = false;
const bgAudio = document.getElementById('bgAudio');
const soundToggle = document.getElementById('soundToggle');

window.addEventListener('load', () => {
  const boot = document.getElementById('boot');
  const bootFill = document.getElementById('bootFill');
  const bootPct = document.getElementById('bootPct');
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      setTimeout(() => {
        boot.classList.add('hidden');
        document.body.classList.remove('is-booting');
        bgAudio.volume = 0.2;
        initAssetTracker();
      }, 500);
    }
    bootFill.style.width = progress + '%';
    bootPct.textContent = String(Math.floor(progress)).padStart(3, '0');
  }, 200);
});


document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const lang = this.dataset.lang;
    if (lang !== currentLang) {
      currentLang = lang;
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      updateLanguage(lang);
    }
  });
});

function updateLanguage(lang) {
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key]) el.textContent = t[key];
  });
}


soundToggle.addEventListener('click', () => {
  if (isMusicPlaying) {
    bgAudio.pause();
    soundToggle.textContent = 'music off';
    isMusicPlaying = false;
  } else {
    bgAudio.volume = 0.2;
    bgAudio.play().then(() => {
      soundToggle.textContent = 'music on';
      isMusicPlaying = true;
    }).catch(() => {
      soundToggle.textContent = 'music off';
    });
  }
});


const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.lay').forEach(el => observer.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});


function initAssetTracker() {
  const canvas = document.createElement('canvas');
  canvas.id = 'blob-canvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let width, height;
  const targets = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }

  function updateTargets() {
    const elements = document.querySelectorAll('.el');
    targets.length = 0;
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < height && rect.bottom > 0 && rect.width > 0 && rect.height > 0) {
        targets.push({
          el: el,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          w: rect.width,
          h: rect.height,
          id: el.src ? el.src.split('/').pop().split('.')[0].toUpperCase().substring(0, 3) : 'OBJ'
        });
      }
    });
  }

  window.addEventListener('resize', () => { resize(); updateTargets(); });
  window.addEventListener('scroll', updateTargets);
  resize();

  let lastScrollY = window.scrollY;
  let isScrollingFast = false;
  let scrollTimeout;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const delta = Math.abs(currentScrollY - lastScrollY);
    if (delta > 30) {
      isScrollingFast = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => { isScrollingFast = false; }, 150);
    }
    lastScrollY = currentScrollY;
  });

  function getCorners(t) {
    return [
      { x: t.x - t.w / 2, y: t.y - t.h / 2 },
      { x: t.x + t.w / 2, y: t.y - t.h / 2 },
      { x: t.x - t.w / 2, y: t.y + t.h / 2 },
      { x: t.x + t.w / 2, y: t.y + t.h / 2 }
    ];
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    updateTargets();
    const time = performance.now() * 0.001;
    const connAlpha = isScrollingFast ? 0.05 : 0.4;
    const boxAlpha = isScrollingFast ? 0.25 : 0.75;
    const C = [0, 255, 0];
    const col = (a) => `rgba(${C[0]}, ${C[1]}, ${C[2]}, ${a})`;

    ctx.lineWidth = 1;
    ctx.font = '10px monospace';

    const connections = [];
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const c1s = getCorners(targets[i]);
        const c2s = getCorners(targets[j]);
        let best = null, bestDist = Infinity;
        for (const a of c1s) {
          for (const b of c2s) {
            const dx = a.x - b.x, dy = a.y - b.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) { bestDist = d; best = { a, b }; }
          }
        }
        if (bestDist < 700) {
          connections.push({ a: best.a, b: best.b, dist: bestDist, i, j });
        }
      }
    }

    connections.forEach(conn => {
      const alpha = (1 - conn.dist / 700) * connAlpha;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = col(alpha);
      ctx.beginPath();
      ctx.moveTo(conn.a.x, conn.a.y);
      ctx.lineTo(conn.b.x, conn.b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const speed = 0.3;
      const t1 = (time * speed + conn.i * 0.17) % 1;
      const t2 = (time * speed + conn.j * 0.23 + 0.5) % 1;
      [t1, t2].forEach(t => {
        const px = conn.a.x + (conn.b.x - conn.a.x) * t;
        const py = conn.a.y + (conn.b.y - conn.a.y) * t;
        ctx.fillStyle = col(Math.min(alpha * 2.5, 1));
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    targets.forEach((t, idx) => {
      const pulse = 0.7 + Math.sin(time * 2 + idx * 1.3) * 0.3;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = col(boxAlpha * pulse);
      ctx.strokeRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h);
      ctx.setLineDash([]);
      const cSize = 14 + Math.sin(time * 3 + idx) * 4;
      ctx.lineWidth = 2;
      ctx.strokeStyle = col(boxAlpha * pulse);
      ctx.beginPath();
      ctx.moveTo(t.x - t.w / 2, t.y - t.h / 2 + cSize);
      ctx.lineTo(t.x - t.w / 2, t.y - t.h / 2);
      ctx.lineTo(t.x - t.w / 2 + cSize, t.y - t.h / 2);
      ctx.moveTo(t.x + t.w / 2 - cSize, t.y - t.h / 2);
      ctx.lineTo(t.x + t.w / 2, t.y - t.h / 2);
      ctx.lineTo(t.x + t.w / 2, t.y - t.h / 2 + cSize);
      ctx.moveTo(t.x - t.w / 2, t.y + t.h / 2 - cSize);
      ctx.lineTo(t.x - t.w / 2, t.y + t.h / 2);
      ctx.lineTo(t.x - t.w / 2 + cSize, t.y + t.h / 2);
      ctx.moveTo(t.x + t.w / 2 - cSize, t.y + t.h / 2);
      ctx.lineTo(t.x + t.w / 2, t.y + t.h / 2);
      ctx.lineTo(t.x + t.w / 2, t.y + t.h / 2 - cSize);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = col(boxAlpha);
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`TRK_${t.id}`, t.x - t.w / 2, t.y - t.h / 2 - 8);
      ctx.fillText(`#${String(idx).padStart(3, '0')}`, t.x + t.w / 2 + 8, t.y);
      ctx.fillText(`v=${(0.1 + idx * 0.03).toFixed(2)}`, t.x + t.w / 2 + 8, t.y + 12);
    });

    requestAnimationFrame(draw);
  }
  draw();
}