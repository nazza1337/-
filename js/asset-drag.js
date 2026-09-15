(function () {
  const MAX_DRAG = 140;
  const RETURN_SPEED = 0.14;
  const SNAP_EPS = 0.5;

  const assets = [];

  function init() {
    document.querySelectorAll('.el').forEach((el) => {
      if (getComputedStyle(el).display === 'none') return;

      el.setAttribute('draggable', 'false');
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'grab';
      el.style.userSelect = 'none';
      el.style.webkitUserSelect = 'none';
      el.style.touchAction = 'none';

      let wrap = el.parentElement;
      if (!wrap.classList.contains('drag-wrap')) {
        const cs = getComputedStyle(el);

        wrap = document.createElement('div');
        wrap.className = 'drag-wrap';
        wrap.style.position = 'absolute';
        wrap.style.top = cs.top;
        wrap.style.left = cs.left;
        wrap.style.right = cs.right;
        wrap.style.bottom = cs.bottom;
        wrap.style.width = cs.width;
        wrap.style.maxWidth = cs.maxWidth === 'none' ? '' : cs.maxWidth;
        wrap.style.zIndex = cs.zIndex;
        wrap.style.pointerEvents = 'none';
        wrap.style.willChange = 'transform';
        wrap.style.transform = 'translate3d(0,0,0)';

        el.parentElement.insertBefore(wrap, el);
        wrap.appendChild(el);

        el.style.position = 'relative';
        el.style.top = '0';
        el.style.left = '0';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.width = '100%';
        el.style.maxWidth = 'none';
        el.style.zIndex = 'auto';
      }

      const rect = wrap.getBoundingClientRect();

      const state = {
        el,
        wrap,
        startCx: rect.left + rect.width / 2,
        startCy: rect.top + rect.height / 2,
        offsetX: 0,
        offsetY: 0,
        targetOffsetX: 0,
        targetOffsetY: 0,
        dragging: false,
        grabDX: 0,
        grabDY: 0
      };

      const onMove = (e) => {
        if (!state.dragging) return;
        e.preventDefault();

        let nx = e.clientX - state.grabDX - state.startCx;
        let ny = e.clientY - state.grabDY - state.startCy;

        const dist = Math.hypot(nx, ny);
        if (dist > MAX_DRAG) {
          const k = MAX_DRAG / dist;
          nx *= k;
          ny *= k;
        }

        state.targetOffsetX = nx;
        state.targetOffsetY = ny;
      };

      const onUp = () => {
        if (!state.dragging) return;
        state.dragging = false;
        el.style.cursor = 'grab';
        state.targetOffsetX = 0;
        state.targetOffsetY = 0;

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();

        state.dragging = true;

        const r = wrap.getBoundingClientRect();
        state.startCx = r.left + r.width / 2 - state.offsetX;
        state.startCy = r.top + r.height / 2 - state.offsetY;
        state.grabDX = e.clientX - (r.left + r.width / 2);
        state.grabDY = e.clientY - (r.top + r.height / 2);

        el.style.cursor = 'grabbing';

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });

      assets.push(state);
    });

    window.addEventListener('resize', () => {
      assets.forEach((s) => {
        const r = s.wrap.getBoundingClientRect();
        s.startCx = r.left + r.width / 2 - s.offsetX;
        s.startCy = r.top + r.height / 2 - s.offsetY;
      });
    });

    tick();
  }

  function tick() {
    assets.forEach((s) => {
      s.offsetX += (s.targetOffsetX - s.offsetX) * RETURN_SPEED;
      s.offsetY += (s.targetOffsetY - s.offsetY) * RETURN_SPEED;

      if (Math.abs(s.targetOffsetX - s.offsetX) < SNAP_EPS &&
          Math.abs(s.targetOffsetY - s.offsetY) < SNAP_EPS) {
        s.offsetX = s.targetOffsetX;
        s.offsetY = s.targetOffsetY;
      }

      s.wrap.style.transform = `translate3d(${s.offsetX}px, ${s.offsetY}px, 0)`;
    });
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();