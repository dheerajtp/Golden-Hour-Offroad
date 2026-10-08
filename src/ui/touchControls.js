const GLYPHS = {
  left: '&#9664;', right: '&#9654;', gas: '&#9650;', brake: '&#9660;',
};

function pressBtn(el, onPress, onRelease) {
  const down = (e) => {
    e.preventDefault();
    el.classList.add('on');
    onPress();
  };
  const up = (e) => {
    if (e) e.preventDefault();
    el.classList.remove('on');
    onRelease();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function initTouch(driver, actions) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const forced = new URLSearchParams(location.search).has('touch');
  const enabled = coarse || forced;
  const wrap = document.getElementById('touch');
  if (!enabled) return { enabled: false, isTouch: false };
  wrap.classList.remove('hidden');
  document.body.classList.add('touch');

  const mk = (id, html, cls) => {
    const b = document.createElement('button');
    b.id = id;
    b.className = 'tbtn' + (cls ? ' ' + cls : '');
    b.innerHTML = html;
    wrap.appendChild(b);
    return b;
  };

  const key = (code) => [
    () => driver.keys.add(code),
    () => driver.keys.delete(code),
  ];
  pressBtn(mk('tLeft', GLYPHS.left), ...key('KeyA'));
  pressBtn(mk('tRight', GLYPHS.right), ...key('KeyD'));
  pressBtn(mk('tGas', GLYPHS.gas), ...key('KeyW'));
  pressBtn(mk('tBrake', GLYPHS.brake), ...key('KeyS'));

  const bar = document.createElement('div');
  bar.id = 'tBar';
  wrap.appendChild(bar);
  const small = (id, html, usePress, onPress, onRelease) => {
    const b = document.createElement('button');
    b.id = id;
    b.className = 'tbtn';
    b.innerHTML = html;
    bar.appendChild(b);
    if (usePress) pressBtn(b, onPress, onRelease);
    else {
      b.addEventListener('click', (e) => { e.preventDefault(); onPress(); });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    return b;
  };
  small('tTruck1', '1', false, () => actions.switchTruck(0));
  small('tTruck2', '2', false, () => actions.switchTruck(1));
  small('tTruck3', '3', false, () => actions.switchTruck(2));
  small('tLights', 'L', false, () => actions.toggleLights());
  small('tF', 'F', false, () => actions.footAction());
  small('tFast', '&#187;', true, () => actions.setFast(true), () => actions.setFast(false));
  small('tMenu', '&#9776;', false, () => actions.togglePanel());

  return { enabled: true, isTouch: true };
}
