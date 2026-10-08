const ID_PREFIX = 'gh4x-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export class Session {
  constructor() {
    this.role = 'solo';
    this.code = null;
    this.peer = null;
    this.conns = new Map();
    this.listeners = {};
    this.on = (ev, fn) => {
      if (!this.listeners[ev]) this.listeners[ev] = [];
      this.listeners[ev].push(fn);
    };
    this.emit = (ev, ...args) => {
      for (const fn of this.listeners[ev] || []) fn(...args);
    };
  }

  get connected() {
    if (this.role === 'host') return this.conns.size > 0;
    if (this.role === 'guest') return this.hostConn && this.hostConn.open;
    return false;
  }

  host(attempt = 0) {
    this.reset();
    this.role = 'host';
    this.code = genCode();
    this.peer = new Peer(ID_PREFIX + this.code);
    this.peer.on('open', () => this.emit('status', 'hosting', this.code, 0));
    this.peer.on('connection', (conn) => this.#accept(conn));
    this.peer.on('error', (err) => {
      const t = String(err.type || err.message);
      if (t === 'unavailable-id' && attempt < 3) {
        this.host(attempt + 1);
        return;
      }
      this.emit('status', 'error', t);
    });
  }

  join(code) {
    this.reset();
    this.role = 'guest';
    this.code = code.toUpperCase().trim();
    this.peer = new Peer();
    this.peer.on('open', () => {
      const conn = this.peer.connect(ID_PREFIX + this.code, { reliable: true });
      conn.on('open', () => {
        this.hostConn = conn;
        conn.send({ t: 'hi', veh: this.hostVehicle });
        this.emit('status', 'joined', this.code);
      });
      conn.on('data', (msg) => this.#handle(null, msg));
      conn.on('close', () => {
        this.hostConn = null;
        this.emit('status', 'disconnected');
      });
    });
    this.peer.on('error', (err) => {
      const t = String(err.type || err.message);
      this.emit('status', t === 'peer-unavailable' ? 'notfound' : 'error', t);
    });
  }

  #accept(conn) {
    conn.on('data', (msg) => this.#handle(conn.peer, msg));
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.emit('leave', conn.peer);
      this.emit('status', 'hosting', this.code, this.conns.size);
    });
    this.conns.set(conn.peer, conn);
  }

  #handle(fromId, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hi':
        if (this.role !== 'host') return;
        this.emit('join', fromId, msg.veh);
        this.sendTo(fromId, { t: 'wel', veh: this.hostVehicle, time: this.hostTime() });
        this.emit('status', 'hosting', this.code, this.conns.size);
        break;
      case 'wel':
        this.emit('welcome', msg.veh, msg.time);
        break;
      case 's':
        if (this.role === 'host') {
          this.emit('state', fromId, msg);
          for (const [id, c] of this.conns) if (id !== fromId && c.open) c.send(msg);
        } else {
          this.emit('state', 'host', msg);
        }
        break;
      case 'tm':
        this.emit('time', msg.ph);
        break;
      case 'veh':
        this.emit('vehicle', this.role === 'guest' ? 'host' : fromId, msg.id);
        break;
      case 'race':
        if (this.role === 'host') {
          for (const [, c] of this.conns) if (c.open) c.send(msg);
        }
        this.emit('race', msg);
        break;
      case 'rest':
        if (this.role === 'host') this.emit('rest', fromId);
        break;
      default:
        break;
    }
  }

  sendState(s) {
    if (this.role === 'host') {
      for (const [, c] of this.conns) if (c.open) c.send(s);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(s);
    }
  }

  sendTo(id, msg) {
    const c = this.conns.get(id);
    if (c && c.open) c.send(msg);
  }

  broadcast(msg) {
    if (this.role !== 'host') return;
    for (const [, c] of this.conns) if (c.open) c.send(msg);
  }

  sendVehicle(id) {
    const msg = { t: 'veh', id };
    if (this.role === 'host') this.broadcast(msg);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  sendRest() {
    if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'rest' });
  }

  reset() {
    if (this.peer) { try { this.peer.destroy(); } catch { /* ignore */ } }
    this.peer = null;
    this.hostConn = null;
    this.conns.clear();
    this.code = null;
    this.role = 'solo';
  }

  leave() {
    this.reset();
    this.emit('status', 'solo');
  }
}
