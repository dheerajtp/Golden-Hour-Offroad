const $ = (id) => document.getElementById(id);

export function initHud(session, driver) {
  const panel = $('panel');

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyM') panel.classList.toggle('hidden');
  });

  $('pJoin').addEventListener('click', () => {
    const v = $('pCodeIn').value;
    if (v.trim()) session.join(v);
  });
  $('pHostBtn').addEventListener('click', () => session.host());
  $('pLeave').addEventListener('click', () => session.leave());
  $('pCopy').addEventListener('click', () => {
    if (session.code) {
      try { navigator.clipboard.writeText(session.code); } catch { /* ignore */ }
      $('pCopy').textContent = 'copied!';
      setTimeout(() => { $('pCopy').textContent = 'copy'; }, 1200);
    }
  });
  $('pCodeIn').addEventListener('keydown', (e) => {
    if (e.code === 'Enter') $('pJoin').click();
    e.stopPropagation();
  });
  $('pCodeIn').addEventListener('focus', () => driver.keys.clear());

  const chatSec = $('pChat');
  const chatLog = $('pChatLog');
  const chatIn = $('pChatIn');

  const chatName = (id) => {
    if (id === 'me') return 'You';
    if (id === 'host') return 'Host';
    return String(id).slice(-4).toUpperCase();
  };

  const addChat = (from, text) => {
    const row = document.createElement('div');
    row.className = 'chatMsg';
    const who = document.createElement('b');
    who.textContent = chatName(from);
    const span = document.createElement('span');
    span.textContent = text; // textContent only — no HTML injection
    row.append(who, document.createTextNode(': '), span);
    chatLog.appendChild(row);
    while (chatLog.children.length > 50) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    if (from !== 'me' && panel.classList.contains('hidden')) {
      toast(`chat · ${chatName(from)}: ${text}`);
    }
  };
  session.on('chat', addChat);

  const sendChat = () => {
    session.sendChat(chatIn.value);
    chatIn.value = '';
  };
  $('pChatSend').addEventListener('click', sendChat);
  chatIn.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') sendChat();
    e.stopPropagation();
  });
  chatIn.addEventListener('focus', () => driver.keys.clear());

  const render = (status, a, count) => {
    const codeRow = $('pCodeRow');
    const controls = $('pControls');
    const leave = $('pLeave');
    chatSec.classList.toggle('hidden', status !== 'hosting' && status !== 'joined');
    if (status === 'solo' || status === 'disconnected') chatLog.textContent = '';
    if (status === 'hosting') {
      $('pStatus').textContent = 'Hosting';
      codeRow.classList.remove('hidden');
      controls.classList.add('hidden');
      leave.classList.remove('hidden');
      $('pCode').textContent = a || '----';
      $('pCount').textContent = count ? `driving with you: ${count}` : 'waiting for friends…';
    } else if (status === 'joined') {
      $('pStatus').textContent = `Joined ${a}`;
      codeRow.classList.add('hidden');
      controls.classList.add('hidden');
      leave.classList.remove('hidden');
    } else if (status === 'notfound') {
      $('pStatus').textContent = 'Code not found';
    } else if (status === 'disconnected') {
      $('pStatus').textContent = 'Host left the session';
      codeRow.classList.add('hidden');
      controls.classList.remove('hidden');
      leave.classList.add('hidden');
    } else if (status === 'error') {
      $('pStatus').textContent = 'Connection error';
    } else {
      $('pStatus').textContent = 'Not connected — solo';
      codeRow.classList.add('hidden');
      controls.classList.remove('hidden');
      leave.classList.add('hidden');
    }
  };
  session.on('status', render);
  render('solo');
}

export function updateRaceHud(zone) {
  const el = $('raceHud');
  if (zone.state === 'countdown') {
    el.textContent = String(Math.max(1, Math.ceil(zone.timer)));
    el.classList.remove('hidden');
  } else if (zone.goFlash > 0) {
    el.textContent = 'GO!';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

export function toast(text) {
  const el = $('raceToast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(el.__t);
  el.__t = setTimeout(() => el.classList.add('hidden'), 4000);
}

export function setHint(text) {
  const el = $('restHint');
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}
