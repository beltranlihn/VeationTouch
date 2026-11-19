// VEATION Touch relay on Cloudflare Workers. One Durable Object (RoomRelay) per room, addressed by idFromName(roomId).
// Uses the WebSocket Hibernation API: the link and the browser sockets survive the object being evicted from memory;
// heartbeats are answered by the platform (setWebSocketAutoResponse) without waking it.
import {
  route, RoomHub, LIMITS, CORS, roomCookie, randomId, bearer, sha256hex, safeEqual,
  helpPage, offlinePage, badPage, errorPage,
} from './core.mjs';

const respond = (r) => {
  const h = new Headers();
  for (const [k, v] of r.headers) h.append(k, v);
  return new Response([101, 204, 205, 304].includes(r.status) || !r.body?.length ? null : r.body, { status: r.status, headers: h });
};

export default {
  async fetch(request, env) {
    const r = route(request.method, request.url, request.headers.get('cookie'));
    switch (r.type) {
      case 'bad': return respond(badPage());
      case 'help': return respond(helpPage());
      case 'enter': {
        const h = new Headers({ location: r.location, 'set-cookie': roomCookie(r.room), 'cache-control': 'no-store' });
        return new Response(null, { status: 302, headers: h });
      }
      case 'status':
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
        break;
      default: break;
    }
    const stub = env.ROOM.get(env.ROOM.idFromName(r.room));
    return stub.fetch(request);
  },
};

export class RoomRelay {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.hub = new RoomHub();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    ctx.blockConcurrencyWhile(async () => {
      this.hub.name = (await ctx.storage.get('name')) || '';
      for (const ws of ctx.getWebSockets()) {
        const a = ws.deserializeAttachment();
        if (a?.k === 'link') this.hub.link = ws;
        else if (a?.k === 'b') this.hub.restoreBrowser(a.id, ws);
      }
    });
  }

  async fetch(request) {
    const r = route(request.method, request.url, request.headers.get('cookie'));
    const upgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    if (r.type === 'link') return this.acceptLink(request, upgrade);
    if (r.type === 'status') {
      return new Response(JSON.stringify({ online: this.hub.online, name: this.hub.name }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
    }
    if (r.type !== 'proxy') return respond(badPage());
    const clientIp = request.headers.get('cf-connecting-ip') || '';
    if (upgrade) {
      if (!this.hub.online) return respond(offlinePage());
      if (this.hub.browsers.size >= LIMITS.browserSockets) return respond(errorPage(429, 'Too many devices are connected to this room'));
      const [client, server] = Object.values(new WebSocketPair());
      const id = randomId(12);
      this.ctx.acceptWebSocket(server, ['b']);
      server.serializeAttachment({ k: 'b', id });
      if (!this.hub.openBrowser(server, { path: r.path, headers: request.headers, clientIp, id })) { server.close(1013, 'room unavailable'); }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (!this.hub.online) return respond(offlinePage());
    const len = Number(request.headers.get('content-length') || 0);
    if (len > LIMITS.body) return respond(errorPage(413, 'Request too large'));
    const body = ['GET', 'HEAD'].includes(request.method) ? null : new Uint8Array(await request.arrayBuffer());
    const res = await this.hub.proxyHttp({ method: request.method, path: r.path, headers: request.headers, body, clientIp });
    if (res.offline) return respond(offlinePage());
    return respond(request.method === 'HEAD' ? { ...res, body: null } : res);
  }

  async acceptLink(request, upgrade) {
    if (!upgrade) return new Response('expected a WebSocket', { status: 426 });
    const secret = bearer(request.headers.get('authorization'));
    if (!secret) return new Response('forbidden', { status: 403 });
    const hash = await sha256hex(secret);
    let allowed = false;
    await this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get('secretHash');
      if (!stored) { await this.ctx.storage.put('secretHash', hash); allowed = true; } // the first link claims the room
      else allowed = safeEqual(stored, hash);
    });
    if (!allowed) return new Response('forbidden', { status: 403 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, ['link']);
    server.serializeAttachment({ k: 'link' });
    this.hub.attachLink(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const a = ws.deserializeAttachment();
    if (a?.k === 'link') {
      const before = this.hub.name;
      this.hub.onLinkMessage(ws, message);
      if (this.hub.name !== before) await this.ctx.storage.put('name', this.hub.name);
    } else if (a?.k === 'b') this.hub.onBrowserMessage(a.id, message);
  }

  async webSocketClose(ws) { this.gone(ws); try { ws.close(1000); } catch { /* already closed */ } }
  async webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const a = ws.deserializeAttachment();
    if (a?.k === 'link') this.hub.onLinkClose(ws);
    else if (a?.k === 'b') this.hub.onBrowserClose(a.id);
  }
}
