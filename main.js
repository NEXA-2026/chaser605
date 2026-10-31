(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  $('#yr').textContent = new Date().getFullYear();

  /* ---------- Weather (api.weather.gov) ---------- */
  var SF_LAT = 43.5446, SF_LON = -96.7311; // Sioux Falls, SD (605) — default location
  var LAT = SF_LAT, LON = SF_LON, PLACE_NAME = 'Sioux Falls, SD';
  var HDR = { headers: { 'Accept': 'application/geo+json' } };
  function getJSON(url) {
    return fetch(url, HDR).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function cToF(c) { return c == null ? null : Math.round(c * 9 / 5 + 32); }
  function kmhToMph(k) { return k == null ? null : Math.round(k * 0.621371); }
  function dirName(d) { if (d == null) return ''; return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d / 22.5) % 16]; }
  function wxFail(el, msg) {
    el.innerHTML = '<p>' + msg + ' Check the <a href="https://forecast.weather.gov/MapClick.php?lat=' + LAT + '&lon=' + LON + '" target="_blank" rel="noopener">NWS forecast for ' + esc(PLACE_NAME) + '</a> directly.</p>';
  }

  // Loads forecast + current conditions for a point. Resolves with the place name
  // (e.g. "Omaha, NE"); rejects if NWS has no data for the point (e.g. outside the US).
  var wxToken = 0;
  function loadWeather(lat, lon, tag) {
    var now = $('#wx-now'), fc = $('#wx-forecast'), token = ++wxToken;
    lat = Math.round(lat * 10000) / 10000; lon = Math.round(lon * 10000) / 10000;
    return getJSON('https://api.weather.gov/points/' + lat + ',' + lon).then(function (pt) {
      if (token !== wxToken) return null;
      LAT = lat; LON = lon;
      var p = pt.properties, rl = p.relativeLocation && p.relativeLocation.properties;
      var place = rl ? rl.city + ', ' + rl.state : 'your area';
      PLACE_NAME = place;
      $('#wx-place').textContent = place + (tag ? ' · ' + tag : '');
      now.innerHTML = '<p class="muted">Loading current conditions…</p>';
      fc.innerHTML = '<p class="muted">Loading forecast…</p>';
      getJSON(p.forecast).then(function (f) {
        var per = f.properties.periods.slice(0, 6);
        fc.innerHTML = '<h3>Forecast</h3><div class="fc">' + per.map(function (x) {
          return '<div><b>' + esc(x.name) + '</b><span class="t">' + x.temperature + '°' + esc(x.temperatureUnit) + '</span><br>' + esc(x.shortForecast) + '</div>';
        }).join('') + '</div>';
      }).catch(function () { wxFail(fc, 'Forecast is hiding behind a cloud.'); });

      getJSON(p.observationStations).then(function (st) {
        var ids = st.features.slice(0, 4).map(function (s) { return s.properties.stationIdentifier; });
        var tryNext = function (i) {
          if (i >= ids.length) throw new Error('no obs');
          return getJSON('https://api.weather.gov/stations/' + ids[i] + '/observations/latest').then(function (o) {
            if (o.properties.temperature.value == null) return tryNext(i + 1);
            return { o: o.properties, id: ids[i] };
          }, function () { return tryNext(i + 1); });
        };
        return tryNext(0);
      }).then(function (r) {
        var o = r.o, t = cToF(o.temperature.value), w = kmhToMph(o.windSpeed.value), g = kmhToMph(o.windGust && o.windGust.value);
        var hum = o.relativeHumidity.value, feels = o.heatIndex.value != null ? o.heatIndex.value : o.windChill.value;
        var when = new Date(o.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        now.innerHTML = '<h3>Right Now</h3><div class="wx-big">' +
          (o.icon ? '<img class="wx-icon" src="' + esc(o.icon) + '" alt="" width="64" height="64">' : '') +
          '<div><div class="wx-temp">' + (t == null ? '--' : t + '°F') + '</div><div class="wx-cond">' + esc(o.textDescription || '') + '</div></div></div>' +
          '<ul class="wx-meta"><li>💨 ' + (w == null ? 'Calm' : dirName(o.windDirection.value) + ' ' + w + ' mph') + (g ? ' (gusts ' + g + ')' : '') + '</li>' +
          '<li>💧 Humidity ' + (hum == null ? '--' : Math.round(hum) + '%') + '</li>' +
          (feels != null ? '<li>🌡️ Feels like ' + cToF(feels) + '°F</li>' : '') +
          '<li>📍 Station ' + esc(r.id) + '</li><li>🕒 As of ' + when + '</li></ul>';
      }).catch(function () { wxFail(now, 'Couldn\'t reach a weather station right now.'); });
      return place;
    });
  }
  function loadDefaultWeather() {
    loadWeather(SF_LAT, SF_LON).catch(function () {
      wxFail($('#wx-now'), 'The weather service didn\'t answer.'); wxFail($('#wx-forecast'), 'Forecast unavailable.');
    });
  }

  function loadAlerts() {
    var box = $('#alerts');
    getJSON('https://api.weather.gov/alerts/active?area=SD').then(function (d) {
      var fs = d.features || [];
      if (!fs.length) { box.innerHTML = '<div class="alert-ok">✅ No active NWS alerts for South Dakota right now.</div>'; return; }
      var rank = function (e) { return /Warning/.test(e) ? 0 : /Watch/.test(e) ? 1 : 2; };
      fs.sort(function (a, b) { return rank(a.properties.event) - rank(b.properties.event); });
      var shown = fs.slice(0, 12);
      box.innerHTML = '<p><strong>' + fs.length + ' active NWS alert' + (fs.length > 1 ? 's' : '') + ' in South Dakota</strong>' + (fs.length > shown.length ? ' (showing ' + shown.length + ')' : '') + '</p>' +
        shown.map(function (f) {
          var p = f.properties, cls = ['warning', 'watch', 'adv'][rank(p.event)];
          var txt = (p.headline || '') + (p.description ? '\n\n' + p.description : '');
          return '<details class="alert ' + cls + '"><summary>⚠️ ' + esc(p.event) + ' — ' + esc(p.areaDesc.length > 90 ? p.areaDesc.slice(0, 90) + '…' : p.areaDesc) + '</summary><p>' + esc(txt) + '</p></details>';
        }).join('');
    }).catch(function () {
      box.innerHTML = '<div class="alert alert-fail adv">Couldn\'t load alerts. See <a href="https://alerts.weather.gov/cap/sd.php?x=0" target="_blank" rel="noopener">official South Dakota alerts</a>.</div>';
    });
  }

  /* ---------- Gallery + lightbox ---------- */
  var items = [], cur = 0, lb = $('#lightbox'), stage = $('.lb-stage'), cap = $('.lb-cap');
  function loadGallery() {
    var grid = $('#grid');
    fetch('gallery.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      items = (d.items || []).filter(function (i) { return i && i.src; });
      if (!items.length) { grid.innerHTML = '<p class="muted">Nothing here yet — check back soon!</p>'; return; }
      grid.innerHTML = '';
      items.forEach(function (it, i) {
        var b = document.createElement('button'); b.className = 'tile'; b.type = 'button';
        b.setAttribute('aria-label', 'Open ' + (it.title || (it.type === 'video' ? 'video' : 'photo')));
        var media;
        if (it.type === 'video') {
          media = '<video src="' + esc(it.src) + '#t=0.1" ' + (it.thumb ? 'poster="' + esc(it.thumb) + '" ' : '') + 'preload="metadata" muted playsinline></video><span class="play">▶</span>';
        } else {
          media = '<img src="' + esc(it.thumb || it.src) + '" alt="' + esc(it.title || '') + '" loading="lazy">';
        }
        b.innerHTML = media + (it.title ? '<span class="cap">' + esc(it.title) + '</span>' : '');
        b.addEventListener('click', function () { open(i); });
        grid.appendChild(b);
      });
    }).catch(function () { grid.innerHTML = '<p class="muted">Gallery couldn\'t load. Try refreshing.</p>'; });
  }
  function show() {
    var it = items[cur]; stage.innerHTML = '';
    var el;
    if (it.type === 'video') { el = document.createElement('video'); el.src = it.src; el.controls = true; el.autoplay = true; el.playsInline = true; }
    else { el = document.createElement('img'); el.src = it.src; el.alt = it.title || ''; }
    stage.appendChild(el);
    cap.textContent = [it.title, it.date].filter(Boolean).join(' · ');
    var multi = items.length > 1; document.querySelectorAll('.lb-nav').forEach(function (n) { n.style.display = multi ? '' : 'none'; });
  }
  function open(i) { cur = i; lb.hidden = false; document.body.style.overflow = 'hidden'; show(); $('.lb-close').focus(); }
  function close() { lb.hidden = true; stage.innerHTML = ''; document.body.style.overflow = ''; }
  function step(d) { cur = (cur + d + items.length) % items.length; show(); }
  $('.lb-close').addEventListener('click', close);
  $('.prev').addEventListener('click', function () { step(-1); });
  $('.next').addEventListener('click', function () { step(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target === stage) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
  });
  var sx = null;
  lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) { if (sx == null || items.length < 2) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); sx = null; });

  /* ---------- Real chaser link: only show if it resolves ---------- */
  function checkRealChaser() {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, 6000);
    fetch('https://605chaser.com', { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function () { $('#real-chaser').hidden = false; })
      .catch(function () { /* unreachable: leave hidden */ })
      .then(function () { clearTimeout(t); });
  }

  /* ---------- Live radar (Leaflet + RainViewer, with motion-extrapolation nowcast) + visitor location ---------- */
  function initRadar() {
    var statusEl = $('#radar-status'), timeEl = $('#radar-time'), playBtn = $('#radar-play'),
        slider = $('#radar-slider'), locBtn = $('#radar-locate');
    if (typeof L === 'undefined') {
      statusEl.textContent = 'The radar map couldn\'t load. Try refreshing, or see radar.weather.gov.';
      playBtn.disabled = locBtn.disabled = slider.disabled = true;
      return;
    }
    var ZOOM = 6;
    var map = L.map('radar-map', {
      center: [SF_LAT, SF_LON], zoom: ZOOM, minZoom: 3, maxZoom: 8,
      worldCopyJump: true, scrollWheelZoom: false, dragging: !L.Browser.mobile
    });
    // OpenStreetMap base tiles, darkened with CSS (.base-tiles) to suit the stormy theme.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 8, className: 'base-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | Radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'
    }).addTo(map);
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    map.on('mouseout', function () { map.scrollWheelZoom.disable(); });

    /* --- visitor marker --- */
    var marker = L.marker([SF_LAT, SF_LON], {
      icon: L.divIcon({ className: 'you-pin', html: '<span class="you-dot"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      keyboard: false
    }).addTo(map);
    marker.bindTooltip('You are here', { permanent: true, direction: 'top', offset: [0, -10], className: 'you-tip' });

    /* --- radar timeline: ~1 hr of observed radar (RainViewer) + a ~60 min motion-extrapolation nowcast ---
       RainViewer free tier: past frames only, max tile zoom 7. The "forecast" frames reuse the newest observed
       RainViewer frame (same tiles, same colours), slid along the storm motion estimated from the last few frames. */
    var frames = [], layers = {}, cur = -1, playing = true, timer = null, rvHost = '', nowIdx = -1, buildTok = 0;
    var rvPast = [], lastBuildLL = null, built = false;
    var noteEl = $('#radar-note'), badge = $('#radar-badge'), mapEl = $('#radar-map'), sliderWrap = $('#radar-slider-wrap'), nowMark = $('#radar-now');
    var PAST_KEEP = 7;          // 7 RainViewer frames = last ~60 min
    var FC_STEP = 10, FC_MAX = 60; // forecast frames every 10 min out to +60 min
    var MAX_OP = 0.75;
    var WORLD_PX = 16384;       // world width in px at the estimation scale (512px tiles at z5 == 256px tiles at z6)
    var EST_Z = 5, EST_TILE = 512, EST_DS = 2;

    function tileUrl(path, size, z, x, y) { return rvHost + path + '/' + size + '/' + z + '/' + x + '/' + y + '/2/1_1.png'; }
    var imgCache = {};
    function loadImg(url) { // CORS-enabled load (RainViewer sends Access-Control-Allow-Origin: *), cached per URL
      if (!imgCache[url]) {
        imgCache[url] = new Promise(function (res) {
          var im = new Image(); im.crossOrigin = 'anonymous';
          im.onload = function () { res(im); }; im.onerror = function () { res(null); };
          im.src = url;
        });
      }
      return imgCache[url];
    }

    /* Forecast layer: draws the newest observed frame translated by (sx, sy) world-fractions. Source tiles are the
       same 512px RainViewer tiles the past frames use, so the colours are identical. */
    var ShiftLayer = L.GridLayer.extend({
      initialize: function (path, shift, options) { L.GridLayer.prototype.initialize.call(this, options); this._path = path; this._shift = shift; },
      createTile: function (c, done) {
        var S = 512, zr = c.z - 1, n = Math.pow(2, zr), k = 256 * Math.pow(2, c.z);
        var cv = L.DomUtil.create('canvas', 'leaflet-tile'); cv.width = cv.height = S;
        var ox = c.x * S - this._shift.x * k, oy = c.y * S - this._shift.y * k, ctx = cv.getContext('2d'), jobs = [], self = this;
        for (var ty = Math.floor(oy / S); ty <= Math.floor((oy + S - 1) / S); ty++) {
          for (var tx = Math.floor(ox / S); tx <= Math.floor((ox + S - 1) / S); tx++) {
            if (ty < 0 || ty >= n) continue;
            (function (tx, ty) {
              jobs.push(loadImg(tileUrl(self._path, 512, zr, ((tx % n) + n) % n, ty)).then(function (im) {
                if (im) ctx.drawImage(im, tx * S - ox, ty * S - oy, S, S);
              }));
            })(tx, ty);
          }
        }
        Promise.all(jobs).then(function () { done(null, cv); });
        return cv;
      }
    });

    /* ---- motion estimation: global block matching between observed frames ---- */
    function lonlat2tile(lat, lon, z) {
      var n = Math.pow(2, z), r = lat * Math.PI / 180;
      return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n };
    }
    function intensityGrid(path, tx0, ty0) { // 2x2 tiles -> downsampled alpha-intensity grid
      var size = 2 * EST_TILE, n = Math.pow(2, EST_Z), cv = document.createElement('canvas');
      cv.width = cv.height = size; var ctx = cv.getContext('2d');
      var jobs = [];
      for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) (function (i, j) {
        jobs.push(loadImg(tileUrl(path, 512, EST_Z, ((tx0 + i) % n + n) % n, ty0 + j)).then(function (im) {
          if (im) ctx.drawImage(im, i * EST_TILE, j * EST_TILE);
        }));
      })(i, j);
      return Promise.all(jobs).then(function () {
        var px = ctx.getImageData(0, 0, size, size).data, g = size / EST_DS, out = new Float32Array(g * g), cnt = 0;
        for (var y = 0; y < g; y++) for (var x = 0; x < g; x++) {
          var s = 0;
          for (var dy = 0; dy < EST_DS; dy++) for (var dx = 0; dx < EST_DS; dx++) s += px[((y * EST_DS + dy) * size + x * EST_DS + dx) * 4 + 3];
          var v = s / (EST_DS * EST_DS * 255); out[y * g + x] = v; if (v > 0.05) cnt++;
        }
        return { g: g, d: out, count: cnt };
      });
    }
    // Best translation (cells) taking grid A onto grid B, with sub-cell refinement; score is a 0..1 correlation.
    function matchShift(A, B, R) {
      var g = A.g, ia = [], va = [], ea = 0, eb = 0, i;
      for (i = 0; i < A.d.length; i++) { if (A.d[i] > 0.05) { ia.push(i); va.push(A.d[i]); ea += A.d[i] * A.d[i]; } }
      for (i = 0; i < B.d.length; i++) eb += B.d[i] * B.d[i];
      if (!ia.length || !eb) return null;
      var norm = Math.sqrt(ea * eb), W = 2 * R + 1, sc = new Float32Array(W * W), best = -1, bx = 0, by = 0;
      for (var sy = -R; sy <= R; sy++) for (var sx = -R; sx <= R; sx++) {
        var s = 0;
        for (var k = 0; k < ia.length; k++) {
          var idx = ia[k], y = (idx / g) | 0, x = idx - y * g, nx = x + sx, ny = y + sy;
          if (nx < 0 || ny < 0 || nx >= g || ny >= g) continue;
          s += va[k] * B.d[ny * g + nx];
        }
        s /= norm; sc[(sy + R) * W + sx + R] = s;
        if (s > best) { best = s; bx = sx; by = sy; }
      }
      var refine = function (m, c, p) { var den = m - 2 * c + p; return den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (m - p) / den)) : 0; };
      var at = function (x, y) { return (x < -R || x > R || y < -R || y > R) ? 0 : sc[(y + R) * W + x + R]; };
      return { dx: bx + refine(at(bx - 1, by), best, at(bx + 1, by)), dy: by + refine(at(bx, by - 1), best, at(bx, by + 1)), score: best };
    }
    // Returns {vx, vy, method} in estimation-scale px per minute, or null.
    function estimateMotion(lat, lon) {
      var obs = rvPast.filter(function (f) { return f.time * 1000 <= Date.now() + 60000; }).slice(-4);
      if (obs.length < 3) return Promise.resolve(null);
      var t = lonlat2tile(lat, lon, EST_Z), n = Math.pow(2, EST_Z);
      var tx0 = Math.floor(t.x - 0.5), ty0 = Math.max(0, Math.min(n - 2, Math.floor(t.y - 0.5)));
      return Promise.all(obs.map(function (f) { return intensityGrid(f.path, tx0, ty0); })).then(function (grids) {
        var last = grids.length - 1, B = grids[last];
        if (B.count < 150) return null; // too little rain nearby to track
        var sumx = 0, sumy = 0, sumw = 0;
        for (var lag = 1; lag <= last; lag++) {
          var A = grids[last - lag];
          if (A.count < 100) continue;
          var dtMin = (obs[last].time - obs[last - lag].time) / 60;
          var m = matchShift(A, B, 6 + 5 * lag);
          if (!m || m.score < 0.35) continue;
          var w = m.score * m.score * lag; // longer baselines are more precise
          sumx += m.dx * EST_DS / dtMin * w; sumy += m.dy * EST_DS / dtMin * w; sumw += w;
        }
        if (!sumw) return null;
        return { vx: sumx / sumw, vy: sumy / sumw, method: 'radar' };
      });
    }
    // Fallback: 700 hPa steering wind at the visitor's location (Open-Meteo, free, no key).
    function windMotion(lat, lon) {
      return fetchJSONTimeout('https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(2) + '&longitude=' + lon.toFixed(2) +
        '&hourly=wind_speed_700hPa,wind_direction_700hPa&wind_speed_unit=kmh&forecast_days=2&timezone=GMT', 7000).then(function (j) {
        var h = j.hourly, now = Date.now(), bi = -1, bd = 1e18;
        h.time.forEach(function (s, i) { var d = Math.abs(Date.parse(s + 'Z') - now); if (d < bd) { bd = d; bi = i; } });
        var spd = h.wind_speed_700hPa[bi], from = h.wind_direction_700hPa[bi];
        if (spd == null || from == null) throw new Error('no wind');
        var rad = from * Math.PI / 180, east = -spd * Math.sin(rad), north = -spd * Math.cos(rad); // km/h, direction the air moves toward
        var mpp = 40075016.7 / WORLD_PX * Math.cos(lat * Math.PI / 180); // ground metres per estimation px
        return { vx: east * 1000 / 60 / mpp, vy: -north * 1000 / 60 / mpp, method: 'wind' };
      });
    }
    function getLayer(i) {
      if (layers[i]) return layers[i];
      var f = frames[i], l;
      if (f.kind === 'fc') {
        l = new ShiftLayer(f.path, f.shift, { tileSize: 512, maxZoom: 8, opacity: 0, className: 'radar-tiles', keepBuffer: 1 });
      } else {
        // RainViewer 512px tiles: tile z = map zoom - 1, so map zoom 8 requests z7 (free-tier max).
        l = L.tileLayer(rvHost + f.path + '/512/{z}/{x}/{y}/2/1_1.png', {
          tileSize: 512, zoomOffset: -1, maxNativeZoom: 8, maxZoom: 8, opacity: 0, className: 'radar-tiles', keepBuffer: 1, crossOrigin: 'anonymous'
        });
      }
      layers[i] = l; l.addTo(map); return l;
    }
    function clock(t) { return new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    function fmtTime(f) {
      var diff = Math.round((f.time * 1000 - Date.now()) / 60000);
      if (f.kind === 'fc') return clock(f.time) + ' (forecast) · +' + Math.max(diff, 1) + ' min';
      var mins = Math.max(0, -diff);
      return clock(f.time) + ' · ' + (mins < 2 ? 'just now' : mins < 90 ? mins + ' min ago' : (mins / 60).toFixed(1) + ' hr ago');
    }
    function showFrame(i, done) {
      var l = getLayer(i), finished = false;
      var reveal = function () {
        if (finished) return; finished = true;
        if (cur !== i) {
          Object.keys(layers).forEach(function (k) { if (+k !== i) layers[k].setOpacity(0); });
          l.setOpacity(frames[i].op || MAX_OP); cur = i;
          var fc = frames[i].kind === 'fc';
          timeEl.textContent = fmtTime(frames[i]); slider.value = i;
          badge.hidden = !fc; mapEl.classList.toggle('is-forecast', fc); timeEl.classList.toggle('is-forecast', fc);
        }
        done && done();
      };
      if (l._loading === false || (l._tiles && Object.keys(l._tiles).length && !l._loading)) return reveal();
      l.once('load', reveal); setTimeout(reveal, 2500);
    }
    function loop() {
      clearTimeout(timer);
      if (!playing || !frames.length) return;
      var next = (cur + 1) % frames.length;
      showFrame(next, function () {
        timer = setTimeout(loop, next === frames.length - 1 ? 1800 : next === nowIdx ? 1100 : frames[next].kind === 'fc' ? 700 : 500);
      });
    }
    function setPlaying(p) {
      playing = p; playBtn.textContent = p ? '⏸ Pause' : '▶ Play'; playBtn.setAttribute('aria-pressed', String(!p));
      if (p) loop(); else clearTimeout(timer);
    }
    function pruneLayers() { // drop hidden frames after pan/zoom so we don't re-request tiles for all of them
      Object.keys(layers).forEach(function (k) { if (+k !== cur) { map.removeLayer(layers[k]); delete layers[k]; } });
    }
    map.on('zoomend moveend', pruneLayers);
    playBtn.addEventListener('click', function () { setPlaying(!playing); });
    slider.addEventListener('input', function () { setPlaying(false); showFrame(+slider.value); });

    // Build the frame list (observed + projected) and (re)start playback.
    function buildTimeline() {
      if (!rvPast.length) return;
      var tok = ++buildTok, ll = marker.getLatLng(); lastBuildLL = ll;
      var motionP = estimateMotion(ll.lat, ll.lng).catch(function () { return null; }).then(function (m) {
        return m || windMotion(ll.lat, ll.lng).catch(function () { return null; });
      });
      var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 9000); });
      Promise.race([motionP, timeout]).then(function (motion) {
        if (tok !== buildTok) return;
        var now = Date.now();
        var past = rvPast.filter(function (f) { return f.time * 1000 <= now + 60000; }).slice(-PAST_KEEP)
          .map(function (f) { return { kind: 'past', time: f.time, path: f.path }; });
        if (!past.length) return;
        var latest = past[past.length - 1], list = past.slice(); nowIdx = list.length - 1;
        if (motion && isFinite(motion.vx) && isFinite(motion.vy)) {
          var spdKmh = Math.sqrt(motion.vx * motion.vx + motion.vy * motion.vy) * 60 * 2446 * Math.cos(ll.lat * Math.PI / 180) / 1000;
          var cap = spdKmh > 130 ? 130 / spdKmh : 1; // sanity cap on speed
          for (var m = FC_STEP; m <= FC_MAX + 30; m += FC_STEP) {
            var validMs = (latest.time + m * 60) * 1000;
            if (validMs <= now - 60000 || validMs > now + FC_MAX * 60000 + 5 * 60000) continue; // only from now to ~+60 min
            var ahead = Math.max(0, (validMs - now) / 60000);
            list.push({
              kind: 'fc', time: validMs / 1000, path: latest.path, op: MAX_OP * (1 - 0.45 * Math.min(1, ahead / FC_MAX)),
              shift: { x: motion.vx * cap * m / WORLD_PX, y: motion.vy * cap * m / WORLD_PX }
            });
          }
        }
        var nFc = list.length - past.length;
        mapEl.setAttribute('data-motion', motion ? motion.method + ' ' + motion.vx.toFixed(2) + ',' + motion.vy.toFixed(2) : 'none');
        if (!nFc) {
          noteEl.hidden = false;
          noteEl.textContent = 'Couldn\'t work out which way the storms are moving right now — showing observed radar only.';
        } else if (motion.method === 'wind') {
          noteEl.hidden = false;
          noteEl.textContent = 'Not much rain nearby to track, so the forecast slides radar along the regional steering winds (700 hPa, from Open-Meteo).';
        } else { noteEl.hidden = true; }
        clearTimeout(timer);
        Object.keys(layers).forEach(function (k) { map.removeLayer(layers[k]); }); layers = {}; cur = -1;
        frames = list; built = true;
        slider.max = frames.length - 1; slider.disabled = false; playBtn.disabled = false;
        var n = frames.length, pct = n > 1 ? nowIdx / (n - 1) * 100 : 100;
        sliderWrap.style.setProperty('--now', pct + '%');
        sliderWrap.classList.toggle('has-fc', nFc > 0);
        nowMark.hidden = nFc === 0;
        nowMark.style.left = 'calc(' + pct + '% + ' + (9 - 18 * pct / 100) + 'px)';
        if (playing) loop(); else showFrame(nowIdx);
      });
    }
    function loadFrames() {
      return fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) {
          var past = d && d.radar && d.radar.past;
          if (!past || !past.length) throw new Error('no frames');
          rvHost = d.host || 'https://tilecache.rainviewer.com'; rvPast = past;
          buildTimeline();
        })
        .catch(function () {
          if (built) return; // keep showing what we have
          timeEl.textContent = 'Radar data unavailable right now.';
          playBtn.disabled = true; slider.disabled = true;
        });
    }
    loadFrames();
    setInterval(loadFrames, 5 * 60 * 1000);
    // Called when the visitor's location changes: re-estimate motion if they moved far from the last estimate.
    function relocateTimeline(lat, lon) {
      if (!built || !lastBuildLL) return;
      if (map.distance ? L.latLng(lat, lon).distanceTo(lastBuildLL) > 250000 : true) buildTimeline();
    }

    /* --- location: device GPS -> IP lookup -> Sioux Falls --- */
    var locToken = 0, permNote = '';
    function applyLocation(lat, lon, how, guessedPlace) {
      var token = ++locToken;
      map.setView([lat, lon], ZOOM);
      marker.setLatLng([lat, lon]);
      relocateTimeline(lat, lon);
      marker.setTooltipContent(how === 'default' ? 'Sioux Falls (default)' : 'You are here');
      var describe = function (place, fromNws) {
        if (token !== locToken) return;
        var src = how === 'gps' ? 'based on your device location' : how === 'ip' ? 'approximate, based on your internet connection' : 'default view';
        statusEl.innerHTML = '📍 Radar centered on <strong>' + esc(place) + '</strong> <span class="muted">(' + src + ')</span>' + (permNote ? ' <span class="muted">' + esc(permNote) + '</span>' : '');
      };
      describe(guessedPlace || (how === 'default' ? 'Sioux Falls, SD' : 'your area'));
      if (how === 'default') { return; }
      // Update the forecast to the visitor's spot (NWS covers the US). Alerts stay SD-wide.
      var inUS = lat > 17 && lat < 72 && lon > -180 && lon < -64; // skip the NWS call (404) for clearly non-US spots
      (inUS ? loadWeather(lat, lon, how === 'ip' ? 'near you (approx.)' : 'near you') : Promise.reject(new Error('non-US'))).then(function (place) {
        if (place) describe(place, true);
      }).catch(function () {
        // Outside NWS coverage: keep Sioux Falls forecast, radar still shows the visitor's area.
        if (token !== locToken) return;
        loadDefaultWeather();
        $('#wx-place').textContent = 'Sioux Falls, SD · NWS forecasts cover the US only';
      });
    }
    function fetchJSONTimeout(url, ms) {
      var ctl = window.AbortController ? new AbortController() : null;
      var t = setTimeout(function () { ctl && ctl.abort(); }, ms);
      return fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
    }
    function ipLocate() {
      var ok = function (lat, lon, city, region) {
        lat = parseFloat(lat); lon = parseFloat(lon);
        if (!isFinite(lat) || !isFinite(lon)) throw new Error('bad coords');
        return { lat: lat, lon: lon, place: [city, region].filter(Boolean).join(', ') };
      };
      return fetchJSONTimeout('https://get.geojs.io/v1/ip/geo.json', 6000).then(function (j) {
        return ok(j.latitude, j.longitude, j.city, j.region);
      }).catch(function () {
        return fetchJSONTimeout('https://ipapi.co/json/', 6000).then(function (j) {
          if (j.error) throw new Error(j.reason);
          return ok(j.latitude, j.longitude, j.city, j.region_code || j.region);
        });
      });
    }
    function gpsLocate(timeoutMs) {
      return new Promise(function (resolve, reject) {
        if (!navigator.geolocation) return reject(new Error('unsupported'));
        navigator.geolocation.getCurrentPosition(function (pos) {
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }, reject, { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600000 });
      });
    }
    function locate(fromButton) {
      statusEl.textContent = '📍 Finding your location…';
      var viaIp = function (denied) {
        permNote = fromButton && denied ? 'Couldn\'t get your exact location — check that location access is allowed for this site (it also needs a secure https connection).' : '';
        return ipLocate().then(function (r) { applyLocation(r.lat, r.lon, 'ip', r.place); })
          .catch(function () { applyLocation(SF_LAT, SF_LON, 'default'); });
      };
      var tryGps = function () {
        permNote = '';
        return gpsLocate(fromButton ? 12000 : 8000).then(function (r) { applyLocation(r.lat, r.lon, 'gps'); })
          .catch(function (err) { return viaIp(!!err); });
      };
      // If permission was already denied, skip the wait and go straight to the IP lookup on page load.
      if (!fromButton && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (s) {
          return s.state === 'denied' ? viaIp(false) : tryGps();
        }, tryGps);
      } else { tryGps(); }
    }
    locBtn.addEventListener('click', function () { locate(true); });
    locate(false);
  }

  loadDefaultWeather(); loadAlerts(); loadGallery(); checkRealChaser(); initRadar();
})();
