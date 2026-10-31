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

  /* ---------- Live radar (Leaflet + RainViewer) + visitor location ---------- */
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

    /* --- radar frames (RainViewer free tier: past frames only, max tile zoom 7) --- */
    var frames = [], layers = {}, cur = -1, playing = true, timer = null, host = '';
    function frameUrl(f) {
      // 512px tiles: tile z = map zoom - 1, so map zoom 8 requests z7 (the free-tier maximum).
      return host + f.path + '/512/{z}/{x}/{y}/2/1_1.png';
    }
    function getLayer(i) {
      if (layers[i]) return layers[i];
      var l = L.tileLayer(frameUrl(frames[i]), {
        tileSize: 512, zoomOffset: -1, maxNativeZoom: 8, maxZoom: 8, opacity: 0, className: 'radar-tiles', keepBuffer: 1
      });
      layers[i] = l; l.addTo(map); return l;
    }
    function fmtTime(t) {
      var d = new Date(t * 1000), mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
      var ago = mins < 2 ? 'just now' : mins < 90 ? mins + ' min ago' : (mins / 60).toFixed(1) + ' hr ago';
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + ago;
    }
    function showFrame(i, done) {
      var l = getLayer(i), finished = false;
      var reveal = function () {
        if (finished) return; finished = true;
        if (cur !== i) {
          Object.keys(layers).forEach(function (k) { if (+k !== i) layers[k].setOpacity(0); });
          l.setOpacity(0.75); cur = i;
          timeEl.textContent = fmtTime(frames[i].time); slider.value = i;
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
        timer = setTimeout(loop, next === frames.length - 1 ? 1800 : 550);
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

    function loadFrames() {
      return fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) {
          var past = d && d.radar && d.radar.past;
          if (!past || !past.length) throw new Error('no frames');
          clearTimeout(timer);
          Object.keys(layers).forEach(function (k) { map.removeLayer(layers[k]); }); layers = {}; cur = -1;
          host = d.host || 'https://tilecache.rainviewer.com'; frames = past;
          slider.max = frames.length - 1; slider.disabled = false; playBtn.disabled = false;
          if (playing) loop(); else showFrame(frames.length - 1);
        })
        .catch(function () {
          timeEl.textContent = 'Radar data unavailable right now.';
          playBtn.disabled = true; slider.disabled = true;
        });
    }
    loadFrames();
    setInterval(loadFrames, 5 * 60 * 1000);

    /* --- location: device GPS -> IP lookup -> Sioux Falls --- */
    var locToken = 0, permNote = '';
    function applyLocation(lat, lon, how, guessedPlace) {
      var token = ++locToken;
      map.setView([lat, lon], ZOOM);
      marker.setLatLng([lat, lon]);
      marker.setTooltipContent(how === 'default' ? 'Sioux Falls (default)' : 'You are here');
      var describe = function (place, fromNws) {
        if (token !== locToken) return;
        var src = how === 'gps' ? 'based on your device location' : how === 'ip' ? 'approximate, based on your internet connection' : 'default view';
        statusEl.innerHTML = '📍 Radar centered on <strong>' + esc(place) + '</strong> <span class="muted">(' + src + ')</span>' + (permNote ? ' <span class="muted">' + esc(permNote) + '</span>' : '');
      };
      describe(guessedPlace || (how === 'default' ? 'Sioux Falls, SD' : 'your area'));
      if (how === 'default') { return; }
      // Update the forecast to the visitor's spot (NWS covers the US). Alerts stay SD-wide.
      loadWeather(lat, lon, how === 'ip' ? 'near you (approx.)' : 'near you').then(function (place) {
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
