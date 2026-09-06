/* Katya — the pre-sales chat on bins-usa.com.
 *
 * Ported from the React widget on binsusa.com (WMS Cloud). Same behaviour, no
 * framework, because this site is a static page. The comments that matter are kept:
 * every one of them marks a LiveAvatar defect that fails silently.
 */
(function () {
  var API = 'https://bins-usa-backend.onrender.com';
  var SDK_URL = 'https://unpkg.com/@heygen/liveavatar-web-sdk@0.0.18/dist/index.umd.js';
  var lang = function () { return (document.documentElement.lang === 'es') ? 'es' : 'en'; };
  var L = function (es, en) { return lang() === 'es' ? es : en; };

  /* Their UMD hands the factory `window.events$1` for Node's EventEmitter and never
     ships one, so evaluation throws partway and leaves a global with the enums but
     none of the classes. Supply it before the script loads. */
  function ensureEventEmitter() {
    if (window.events$1) return;
    function EE() { this._e = {}; }
    EE.prototype.on = function (n, f) { (this._e[n] = this._e[n] || []).push(f); return this; };
    EE.prototype.addListener = EE.prototype.on;
    EE.prototype.once = function (n, f) {
      var self = this;
      var w = function () { self.off(n, w); f.apply(null, arguments); };
      w.listener = f; return this.on(n, w);
    };
    EE.prototype.off = function (n, f) {
      var a = this._e[n];
      if (a) this._e[n] = a.filter(function (x) { return x !== f && x.listener !== f; });
      return this;
    };
    EE.prototype.removeListener = EE.prototype.off;
    EE.prototype.removeAllListeners = function (n) { if (n) delete this._e[n]; else this._e = {}; return this; };
    EE.prototype.emit = function (n) {
      var a = (this._e[n] || []).slice(), r = [].slice.call(arguments, 1);
      a.forEach(function (fn) { try { fn.apply(null, r); } catch (e) {} });
      return a.length > 0;
    };
    EE.prototype.listenerCount = function (n) { return (this._e[n] || []).length; };
    EE.prototype.listeners = function (n) { return (this._e[n] || []).slice(); };
    EE.prototype.setMaxListeners = function () { return this; };
    window.events$1 = { EventEmitter: EE };
  }

  var sdkPromise = null;
  function loadSdk() {
    if (window.LiveAvatarSDK && window.LiveAvatarSDK.LiveAvatarSession) return Promise.resolve(window.LiveAvatarSDK);
    if (sdkPromise) return sdkPromise;
    // A megabyte, fetched only when someone asks to talk. Version pinned: this SDK is
    // 0.0.x and moves without warning.
    sdkPromise = new Promise(function (resolve, reject) {
      ensureEventEmitter();
      var el = document.createElement('script');
      el.src = SDK_URL; el.async = true;
      el.onload = function () {
        (window.LiveAvatarSDK && window.LiveAvatarSDK.LiveAvatarSession) ? resolve(window.LiveAvatarSDK) : reject(new Error('sdk'));
      };
      el.onerror = function () { reject(new Error('sdk')); };
      document.head.appendChild(el);
    });
    return sdkPromise;
  }

  var VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*0.5+0.5,0.5-p.y*0.5);gl_Position=vec4(p,0.,1.);}';
  var FS = [
    'precision mediump float;varying vec2 v;',
    'uniform sampler2D vid;uniform sampler2D bg;uniform vec2 sv;uniform vec2 sb;',
    'vec2 cover(vec2 uv,vec2 s){return (uv-0.5)*s+0.5;}',
    'void main(){',
    ' vec4 c=texture2D(vid,cover(v,sv));',
    ' float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b));',
    // Green must dominate and be saturated: her hair is dark and her jacket black,
    // and both sit against that screen.
    ' float isGreen=step(mx-0.001,c.g)*step(0.17,mx-mn)*step(0.27,c.g)',
    '   *step(c.r*1.18,c.g)*step(c.b*1.12,c.g);',
    ' gl_FragColor=mix(c,texture2D(bg,cover(v,sb)),isGreen);',
    '}'
  ].join('\n');

  var el = {}, session = null, gl = null, raf = 0, msgs = [], busy = false;

  function place() {
    if (!el.stage || !el.panel || el.stage.style.display === 'none') return;
    var r = el.panel.getBoundingClientRect();
    // A phone's panel fills the screen, so a tall stage above it lands off the top
    // edge. She shrinks there and is clamped into view.
    var narrow = window.innerWidth < 600;
    var w = narrow ? 150 : 230, h = narrow ? 165 : 253;
    el.stage.style.width = w + 'px';
    el.stage.style.height = h + 'px';
    el.stage.style.left = Math.round(r.left + r.width / 2 - w / 2) + 'px';
    el.stage.style.top = Math.max(6, Math.round(r.top - h + (narrow ? 26 : 10))) + 'px';
  }

  function stopLive() {
    cancelAnimationFrame(raf); raf = 0;
    var s = session; session = null;
    if (s) { try { s.stop(); } catch (e) {} }
    if (el.stage) el.stage.style.display = 'none';
    if (el.callBtn) el.callBtn.textContent = L('🎥 Hablar con Katya', '🎥 Talk to Katya');
  }

  function initGl() {
    var cvs = el.canvas, g = null;
    try { g = cvs.getContext('webgl', { alpha: false, antialias: false }); } catch (e) { g = null; }
    if (!g) return null;
    var sh = function (t, src) { var x = g.createShader(t); g.shaderSource(x, src); g.compileShader(x); return x; };
    var prog = g.createProgram();
    g.attachShader(prog, sh(g.VERTEX_SHADER, VS));
    g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) return null;
    g.useProgram(prog);
    var buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    var loc = g.getAttribLocation(prog, 'p');
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    var mkTex = function () {
      var t = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      return t;
    };
    var ctx = { gl: g, texV: mkTex(), texB: mkTex(), bgReady: false,
                sv: g.getUniformLocation(prog, 'sv'), sb: g.getUniformLocation(prog, 'sb') };
    g.uniform1i(g.getUniformLocation(prog, 'vid'), 0);
    g.uniform1i(g.getUniformLocation(prog, 'bg'), 1);
    g.viewport(0, 0, cvs.width, cvs.height);
    return ctx;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var c = gl, vid = el.video, cvs = el.canvas;
    if (!c || !vid || !vid.videoWidth) return;
    if (now - (frame.last || 0) < 33) return;   // the stream is no faster
    frame.last = now;
    var g = c.gl;
    // Cover-crop as a uv scale so video and backdrop crop identically.
    var cover = function (sw, sh) {
      var a = (sw / sh) / (cvs.width / cvs.height);
      return a > 1 ? [1 / a, 1] : [1, a];
    };
    if (!c.bgReady && el.room && el.room.complete && el.room.naturalWidth) {
      // Isolated: if the backdrop cannot become a texture she should still be visible
      // against green, rather than the whole frame going black.
      try {
        g.activeTexture(g.TEXTURE1);
        g.bindTexture(g.TEXTURE_2D, c.texB);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, el.room);
        var b = cover(el.room.naturalWidth, el.room.naturalHeight);
        g.uniform2f(c.sb, b[0], b[1]);
      } catch (e) { console.warn('[katya] backdrop unusable as a texture'); }
      c.bgReady = true;
    }
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, c.texV);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, vid);
    var s = cover(vid.videoWidth, vid.videoHeight);
    g.uniform2f(c.sv, s[0], s[1]);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }

  async function startLive() {
    if (session) return stopLive();
    el.callBtn.textContent = L('Conectando…', 'Connecting…');
    try {
      var out = await Promise.all([
        loadSdk(),
        fetch(API + '/api/liveavatar/session', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ language: lang() })
        }).then(function (r) { return r.json(); })
      ]);
      var SDK = out[0], data = out[1];
      if (!data || !data.session_token) throw new Error('token');

      session = new SDK.LiveAvatarSession(data.session_token, {});
      session.on('session.stream_ready', function () {
        session.attach(el.video);
        el.stage.style.display = 'block';
        el.callBtn.textContent = L('⏹ Terminar', '⏹ End call');
        place();
        if (!gl) gl = initGl();
        if (!gl) el.canvas.style.display = 'none';   // no WebGL: show the raw stream
        if (!raf) frame(0);
        // Attaching a track does not start playback, and a first visit has no sticky
        // activation — without this the first call comes up mute.
        var p = el.video.play();
        if (p && p.catch) p.catch(function () {
          var once = function () { el.video.play(); document.removeEventListener('click', once); };
          document.addEventListener('click', once);
        });
      });
      session.on('session.disconnected', stopLive);

      await session.start();
      // The microphone is a separate switch and only works once the room is connected.
      // Started from stream_ready it hits the SDK's own guard, which warns to console
      // and returns — no rejection, and an avatar that hears nobody.
      await session.voiceChat.start();
      if (session.voiceChat.state !== 'ACTIVE') {
        say('assistant', L('No pude usar su micrófono — revise el permiso, o escríbame abajo.',
                           "I couldn't reach your microphone — check the permission, or type below."));
      }
    } catch (e) {
      stopLive();
      say('assistant', L('No pude iniciar el video ahora mismo. Escríbame y le respondo igual.',
                         "I couldn't start the video just now. Type your question and I'll answer anyway."));
    }
  }

  function say(role, text) {
    var d = document.createElement('div');
    d.style.cssText = 'margin:8px 0;display:flex;' + (role === 'user' ? 'justify-content:flex-end' : '');
    var b = document.createElement('div');
    b.style.cssText = 'max-width:82%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;'
      + (role === 'user' ? 'background:#2563eb;color:#fff' : 'background:#f1f5f9;color:#1e293b');
    b.textContent = text;
    d.appendChild(b); el.log.appendChild(d);
    el.log.scrollTop = el.log.scrollHeight;
  }

  async function send() {
    var text = el.input.value.trim();
    if (!text || busy) return;
    el.input.value = ''; busy = true;
    say('user', text);
    msgs.push({ role: 'user', content: text });
    var typing = document.createElement('div');
    typing.style.cssText = 'margin:8px 0;font-size:13px;color:#94a3b8';
    typing.textContent = L('Katya está escribiendo…', 'Katya is typing…');
    el.log.appendChild(typing); el.log.scrollTop = el.log.scrollHeight;
    try {
      var r = await fetch(API + '/api/liveavatar/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: msgs.slice(-10), lang: lang() })
      });
      var d = await r.json();
      typing.remove();
      say('assistant', d.reply);
      msgs.push({ role: 'assistant', content: d.reply });
    } catch (e) {
      typing.remove();
      say('assistant', L('No pude responder ahora. Escríbanos a sales@bins-usa.com.',
                         "I couldn't answer just now. Email us at sales@bins-usa.com."));
    }
    busy = false;
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.innerHTML = [
      '<div id="katyaStage" style="display:none;position:fixed;z-index:9998;pointer-events:none">',
      '  <canvas id="katyaCanvas" width="460" height="506" style="width:100%;height:100%;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.28)"></canvas>',
      '  <video id="katyaVideo" playsinline autoplay style="position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none"></video>',
      '</div>',
      '<div id="katyaPanel" style="display:none;position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.22);z-index:9999;flex-direction:column;overflow:hidden">',
      '  <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e2e8f0">',
      '    <img id="katyaFace" alt="Katya" style="width:34px;height:34px;border-radius:50%;object-fit:cover;background:#e2e8f0"/>',
      '    <div style="flex:1"><div style="font-weight:800;font-size:14px">Katya</div>',
      '      <div id="katyaSub" style="font-size:11px;color:#64748b"></div></div>',
      '    <button id="katyaCall" type="button" style="border:none;border-radius:9px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;background:#0d9488;color:#fff"></button>',
      '    <button id="katyaClose" type="button" aria-label="Close" style="border:none;background:none;font-size:20px;cursor:pointer;color:#64748b;line-height:1">&times;</button>',
      '  </div>',
      '  <div id="katyaLog" style="flex:1;overflow-y:auto;padding:14px"></div>',
      '  <div style="display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0">',
      '    <input id="katyaInput" type="text" style="flex:1;border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;font-size:14px;font-family:inherit"/>',
      '    <button id="katyaSend" type="button" style="border:none;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;background:#2563eb;color:#fff">→</button>',
      '  </div>',
      '</div>',
      '<button id="katyaLauncher" type="button" style="position:fixed;right:20px;bottom:20px;z-index:9999;border:none;border-radius:999px;padding:0;width:60px;height:60px;cursor:pointer;background:#2563eb;box-shadow:0 8px 24px rgba(37,99,235,.35);overflow:hidden">',
      '  <img id="katyaFace2" alt="" style="width:100%;height:100%;object-fit:cover"/>',
      '</button>'
    ].join('');
    document.body.appendChild(wrap);

    el.stage = document.getElementById('katyaStage');
    el.canvas = document.getElementById('katyaCanvas');
    el.video = document.getElementById('katyaVideo');
    el.panel = document.getElementById('katyaPanel');
    el.log = document.getElementById('katyaLog');
    el.input = document.getElementById('katyaInput');
    el.callBtn = document.getElementById('katyaCall');
    // crossOrigin before src: without it the browser taints the image and WebGL
    // refuses it as a texture.
    el.room = new Image(); el.room.crossOrigin = 'anonymous'; el.room.src = API + '/api/liveavatar/room.jpg';
    ['katyaFace', 'katyaFace2'].forEach(function (id) { document.getElementById(id).src = API + '/api/liveavatar/katya.png'; });

    function texts() {
      document.getElementById('katyaSub').textContent = L('Asistente de Bins-USA', 'Bins-USA assistant');
      el.input.placeholder = L('Escriba su pregunta…', 'Type your question…');
      if (!session) el.callBtn.textContent = L('🎥 Hablar con Katya', '🎥 Talk to Katya');
    }
    texts();
    new MutationObserver(texts).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    function open() {
      el.panel.style.display = 'flex';
      document.getElementById('katyaLauncher').style.display = 'none';
      if (!el.log.children.length) {
        say('assistant', L('¡Hola! 👋 Soy Katya. Pregúnteme lo que quiera sobre Bins-USA — planes, funciones o cómo empezar.',
                           "Hi! 👋 I'm Katya. Ask me anything about Bins-USA — plans, features, or how to get started."));
      }
      el.input.focus();
    }
    function close() {
      el.panel.style.display = 'none';
      document.getElementById('katyaLauncher').style.display = 'block';
      stopLive();
    }
    document.getElementById('katyaLauncher').addEventListener('click', open);
    document.getElementById('katyaClose').addEventListener('click', close);
    document.getElementById('katyaSend').addEventListener('click', send);
    el.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    el.callBtn.addEventListener('click', startLive);

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    // Nobody hangs up on a tab they have already left, and the meter does not care
    // that they are gone. Give it a minute in case they come straight back.
    var away = null;
    document.addEventListener('visibilitychange', function () {
      clearTimeout(away);
      if (document.hidden && session) away = setTimeout(stopLive, 60000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
