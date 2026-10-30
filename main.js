(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  $('#yr').textContent = new Date().getFullYear();

  /* ---------- Weather (api.weather.gov) ---------- */
  var LAT = 43.5446, LON = -96.7311; // Sioux Falls, SD (605)
  var HDR = { headers: { 'Accept': 'application/geo+json' } };
  function getJSON(url) {
    return fetch(url, HDR).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function cToF(c) { return c == null ? null : Math.round(c * 9 / 5 + 32); }
  function kmhToMph(k) { return k == null ? null : Math.round(k * 0.621371); }
  function dirName(d) { if (d == null) return ''; return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d / 22.5) % 16]; }
  function wxFail(el, msg) {
    el.innerHTML = '<p>' + msg + ' Check the <a href="https://forecast.weather.gov/MapClick.php?lat=' + LAT + '&lon=' + LON + '" target="_blank" rel="noopener">NWS forecast for Sioux Falls</a> directly.</p>';
  }

  function loadWeather() {
    var now = $('#wx-now'), fc = $('#wx-forecast');
    getJSON('https://api.weather.gov/points/' + LAT + ',' + LON).then(function (pt) {
      var p = pt.properties, rl = p.relativeLocation && p.relativeLocation.properties;
      if (rl) $('#wx-place').textContent = rl.city + ', ' + rl.state;
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
    }).catch(function () {
      wxFail(now, 'The weather service didn\'t answer.'); wxFail(fc, 'Forecast unavailable.');
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

  loadWeather(); loadAlerts(); loadGallery(); checkRealChaser();
})();
