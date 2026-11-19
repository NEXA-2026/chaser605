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

  function fetchJSONTimeout(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, ms);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }

  /* ---------- Snow outlook (Open-Meteo: forecast + ERA5 archive + ECMWF SEAS5 seasonal), same visitor location as radar ---------- */
  function initSnow() {
    var body = $('#snow-body'), placeEl = $('#snow-place'), tok = 0, lastKey = null, defaultTimer = null;
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function toIn(v, unit) { if (v == null) return null; return unit === 'inch' ? v : unit === 'mm' ? v / 25.4 : v / 2.54; }
    function ds(d) { return d.toISOString().slice(0, 10); }               // Date (UTC) -> 'YYYY-MM-DD'
    function pd(s) { return new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); }
    function addDays(s, n) { var d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ds(d); }
    function dayDiff(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
    function nice(s) { return MON[+s.slice(5, 7) - 1] + ' ' + (+s.slice(8, 10)); }
    function fmt(v) { return v == null || !isFinite(v) ? '--' : v < 9.95 ? v.toFixed(1) : String(Math.round(v)); }
    function inSeasonMD(md) { var m = +md.slice(0, 2); return m >= 10 || m <= 4; }
    function quant(a, q) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); }
    function om(host, path, q) { return fetchJSONTimeout('https://' + host + '/v1/' + path + '?' + q, 15000).then(function (j) { if (j && j.error) throw new Error(j.reason); return j; }); }
    function series(j) { // -> { 'YYYY-MM-DD': inches }
      var out = {}, t = j.daily.time, v = j.daily.snowfall_sum, u = j.daily_units.snowfall_sum;
      for (var i = 0; i < t.length; i++) { var x = toIn(v[i], u); if (x != null) out[t[i]] = x; }
      return out;
    }
    function store(k, v) { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* private mode / full */ } }
    function recall(k, maxAge) { try { var o = JSON.parse(localStorage.getItem(k)); return o && Date.now() - o.t < maxAge ? o.v : null; } catch (e) { return null; } }

    // 30-winter normal from the ERA5 archive (cached in the browser for 30 days: it's the heaviest request).
    function climatology(lat, lon, lastSeasonEndYear) {
      var key = 'c605-snowclim-v1:' + lat + ',' + lon + ':' + lastSeasonEndYear, hit = recall(key, 30 * 864e5);
      if (hit) return Promise.resolve(hit);
      return om('archive-api.open-meteo.com', 'archive', 'latitude=' + lat + '&longitude=' + lon + '&start_date=' + (lastSeasonEndYear - 30) +
        '-10-01&end_date=' + lastSeasonEndYear + '-04-30&daily=snowfall_sum&timezone=auto').then(function (j) {
        var t = j.daily.time, v = j.daily.snowfall_sum, u = j.daily_units.snowfall_sum, seasons = {}, days = {}, sum = {}, cnt = {};
        for (var i = 0; i < t.length; i++) {
          var md = t[i].slice(5), x = toIn(v[i], u);
          if (!inSeasonMD(md) || x == null) continue;
          var y = +t[i].slice(0, 4), s = +md.slice(0, 2) >= 10 ? y : y - 1;
          seasons[s] = (seasons[s] || 0) + x; days[s] = (days[s] || 0) + 1;
          sum[md] = (sum[md] || 0) + x; cnt[md] = (cnt[md] || 0) + 1;
        }
        var totals = [], years = [], daymean = {};
        Object.keys(seasons).forEach(function (s) { if (days[s] >= 205) { totals.push(seasons[s]); years.push(+s); } });
        if (totals.length < 20) throw new Error('short climatology');
        Object.keys(sum).forEach(function (md) { daymean[md] = sum[md] / cnt[md]; });
        var hi = 0, lo = 0;
        totals.forEach(function (x, i) { if (x > totals[hi]) hi = i; if (x < totals[lo]) lo = i; });
        var c = { mean: totals.reduce(function (a, b) { return a + b; }, 0) / totals.length, n: totals.length, from: years[0], to: years[years.length - 1] + 1,
          hi: { y: years[hi], v: totals[hi] }, lo: { y: years[lo], v: totals[lo] }, daymean: daymean };
        store(key, c);
        return c;
      });
    }
    function normalBetween(clim, a, b) { // sum of daily normals for dates a..b inclusive
      var s = 0; if (!clim) return null;
      for (var d = a; d <= b; d = addDays(d, 1)) s += clim.daymean[d.slice(5)] || 0;
      return s;
    }
    function seasonLabel(y) { return y + '–' + String(y + 1).slice(2); }

    function render(o) {
      var c = o.clim, normal = c ? c.mean : null;
      var html = '';
      var tinyNormal = c && normal < 0.5, nothing = o.toDate < 0.05 && o.next16 < 0.05 && (!o.pred || o.pred.mean < 0.3);
      if (tinyNormal && nothing) {
        body.innerHTML = '<div class="card snow-none"><h3>☀️ Snow? Around here?</h3><p>The only flakes in this town are on the breakfast menu. ' +
          'A normal winter here brings <strong>' + fmt(normal) + ' in</strong> of snow (30-winter average), there\'s been <strong>' + fmt(o.toDate) + ' in</strong> ' +
          (o.post ? 'last season' : 'so far this season') + ', and none is in the ' + (o.post ? 'books' : '16-day forecast') + '. Grab the sunscreen, not the shovel. 🕶️</p>' +
          '<p class="muted">Want snow? Head north — the radar\'s below if you\'re hunting for some.</p></div>';
        return;
      }
      // stat cards
      var cards = '';
      cards += '<div class="card snow-stat"><span class="tagchip actual">ACTUAL</span><h3>' + (o.post ? 'Last season total' : 'So far this season') + '</h3>' +
        '<div class="snow-big">' + fmt(o.toDate) + '<small> in</small></div><p class="snow-meta">' +
        (o.post ? 'Oct 1 – Apr 30, ' + seasonLabel(o.sy) : 'Oct 1 – ' + nice(o.lastActual)) +
        (c && !o.post ? '<br>Normal by now: ' + fmt(o.normalToDate) + ' in' : '') + '</p></div>';
      cards += '<div class="card snow-stat"><span class="tagchip avg">30-YR AVERAGE</span><h3>Normal season</h3>' +
        (c ? '<div class="snow-big">' + fmt(normal) + '<small> in</small></div><p class="snow-meta">Average of ' + c.n + ' winters, ' + seasonLabel(c.from) + ' to ' + seasonLabel(c.to - 1) +
          '<br>Snowiest: ' + seasonLabel(c.hi.y) + ' (' + fmt(c.hi.v) + ' in) · Least: ' + seasonLabel(c.lo.y) + ' (' + fmt(c.lo.v) + ' in)</p>'
          : '<p class="snow-meta">Historical average couldn\'t load right now.</p>') + '</div>';
      if (o.post) {
        var nxt = o.sy + 1;
        cards += '<div class="card snow-stat"><span class="tagchip fc">COMING UP</span><h3>Next season</h3><div class="snow-big snow-mid">Oct 1</div><p class="snow-meta">' +
          seasonLabel(nxt) + ' snow tracking starts Oct 1. ' + (c ? 'Last season was <strong>' + Math.round(o.toDate / normal * 100) + '%</strong> of normal.' : '') + '</p></div>';
      } else if (o.pred) {
        cards += '<div class="card snow-stat is-fc"><span class="tagchip fc">FORECAST</span><h3>Predicted season total</h3><div class="snow-big">' + fmt(o.pred.mean) + '<small> in</small></div>' +
          '<p class="snow-meta">Likely range ' + fmt(o.pred.p25) + '–' + fmt(o.pred.p75) + ' in (middle half of ' + o.pred.n + ' model runs)<br>' +
          'So far + next 16 days + seasonal model' + (o.pred.tailDays ? ' (+ normal for the last ' + o.pred.tailDays + ' days)' : '') + '</p></div>';
      } else {
        cards += '<div class="card snow-stat is-fc"><span class="tagchip fc">FORECAST</span><h3>Next 16 days</h3><div class="snow-big">' + fmt(o.next16) + '<small> in</small></div>' +
          '<p class="snow-meta">' + nice(o.today) + ' – ' + nice(o.fcEnd) + '<br>The season-long forecast model didn\'t answer, so no full-season prediction right now.</p></div>';
      }
      // outlook line
      var line = '';
      if (o.post) {
        line = c ? (o.toDate >= normal * 1.15 ? '📈 Last winter came in <strong>above normal</strong>.' : o.toDate <= normal * 0.85 ? '📉 Last winter came in <strong>below normal</strong>.' : '↔️ Last winter landed <strong>near normal</strong>.') : '';
        line += ' Snow season is on break — the chart below is last winter\'s week-by-week actuals.';
      } else if (o.pred && c && normal >= 0.5) {
        var pct = Math.round(o.pred.mean / normal * 100);
        var cat = pct >= 115 ? ['📈', 'ABOVE normal'] : pct <= 85 ? ['📉', 'BELOW normal'] : ['↔️', 'NEAR normal'];
        line = cat[0] + ' Season outlook: leaning <strong>' + cat[1] + '</strong> — about ' + pct + '% of a normal winter (forecast).';
      } else if (c && normal >= 0.5) {
        var d = o.toDate + o.next16 - normalBetween(c, o.start, o.fcEnd);
        line = (d >= 0 ? '📈 Running ahead of normal' : '📉 Running behind normal') + ' through ' + nice(o.fcEnd) + ' (actual so far + 16-day forecast vs. average), by ' + fmt(Math.abs(d)) + ' in.';
      }
      if (!o.post) line += ' Next 16 days: <strong>' + fmt(o.next16) + ' inches</strong> forecast' + (o.next16 < 0.05 ? ' — nada.' : '.');
      if (c && normal < 3) line += ' Snow is a rare visitor here, so every flake counts. ❄️';
      else if (!o.post && o.toDate < 0.05 && o.next16 < 0.05) line += ' The snow hasn\'t clocked in yet — the shovels are on standby.';
      html += '<div class="snow-cards">' + cards + '</div>' + (line ? '<p class="snow-line">' + line + '</p>' : '');
      // weekly chart
      var W = o.weeks, max = 1;
      W.forEach(function (w) { max = Math.max(max, w.act + w.fc, w.norm || 0); });
      var bars = W.map(function (w) {
        var tot = w.act + w.fc, h = function (v) { return (v / max * 100).toFixed(1) + '%'; };
        var cls = w.kind, tip = nice(w.start) + '–' + nice(w.end) + ': ' +
          (w.kind === 'future' ? 'beyond the 16-day forecast' : [w.kind !== 'fc' ? fmt(w.act) + ' in actual' : '', w.kind !== 'past' ? fmt(w.fc) + ' in forecast' : ''].filter(Boolean).join(' + ')) +
          (w.norm != null ? ' · normal ' + fmt(w.norm) + ' in' : '');
        return '<div class="wk ' + cls + (w.isNow ? ' now' : '') + '" title="' + esc(tip) + '"><div class="wk-col">' +
          (w.kind !== 'future' && tot >= 0.05 ? '<span class="wk-val">' + fmt(tot) + '</span>' : '') +
          '<span class="wk-bar fc" style="height:' + h(w.fc) + '"></span><span class="wk-bar act" style="height:' + h(w.act) + '"></span>' +
          (w.norm != null ? '<span class="wk-norm" style="bottom:' + h(w.norm) + '"></span>' : '') +
          '</div><span class="wk-lab">' + (w.isNow ? 'NOW' : nice(w.start)) + '</span></div>';
      }).join('');
      html += '<div class="card snow-chart-card"><h3>Weekly snow, winter ' + seasonLabel(o.sy) + '</h3>' +
        '<div class="snow-legend"><span><i class="lg act"></i>Actual</span>' + (o.post ? '' : '<span><i class="lg fc"></i>Forecast</span>') +
        (c ? '<span><i class="lg norm"></i>Normal for that week</span>' : '') + '<span class="muted">Inches per week (Oct 1 – Apr 30)' + (o.post ? '' : ' · blank weeks are past the 16-day forecast') + '</span></div>' +
        '<div class="snow-chart" role="img" aria-label="' + esc('Weekly snowfall bar chart for winter ' + seasonLabel(o.sy) + '. ' + fmt(o.toDate) + ' inches actual so far' + (o.post ? '' : ', ' + fmt(o.next16) + ' inches forecast in the next 16 days') + '.') + '">' + bars + '</div></div>';
      body.innerHTML = html;
      var nowEl = body.querySelector('.wk.now'), ch = body.querySelector('.snow-chart');
      if (nowEl && ch && ch.scrollWidth > ch.clientWidth) ch.scrollLeft = Math.max(0, nowEl.offsetLeft - ch.clientWidth / 2);
    }

    function load(lat, lon, how, place) {
      clearTimeout(defaultTimer);
      lat = +(+lat).toFixed(2); lon = +(+lon).toFixed(2);
      var key = lat + ',' + lon;
      setPlace(place || (how === 'default' ? 'Sioux Falls, SD' : 'your area'), how);
      if (key === lastKey) return;
      lastKey = key;
      var t = ++tok;
      body.innerHTML = '<div class="card"><p class="muted">❄️ Counting snowflakes…</p></div>';
      var q = 'latitude=' + lat + '&longitude=' + lon + '&daily=snowfall_sum&timezone=auto';
      om('api.open-meteo.com', 'forecast', q + '&past_days=92&forecast_days=16').then(function (fj) {
        var fs = series(fj), ft = fj.daily.time, today = ft[ft.length - 16], fcEnd = ft[ft.length - 1];
        var y = +today.slice(0, 4), m = +today.slice(5, 7), post = m >= 5 && m <= 9;
        var sy = m >= 10 ? y : y - 1, start = sy + '-10-01', end = (sy + 1) + '-04-30';
        var lastActual = post ? end : addDays(today, -1), lastClimYear = post ? sy : sy; // last complete winter ends Apr 30 of `sy`
        var need = start < ft[0] ? om('archive-api.open-meteo.com', 'archive', q + '&start_date=' + start + '&end_date=' + (addDays(ft[0], -1) < end ? addDays(ft[0], -1) : end)).then(series) : Promise.resolve({});
        var clim = climatology(lat, lon, lastClimYear).catch(function () { return null; });
        var seas = post ? Promise.resolve(null) : om('seasonal-api.open-meteo.com', 'seasonal', 'latitude=' + lat + '&longitude=' + lon + '&daily=snowfall_sum&forecast_days=210').catch(function () { return null; });
        return Promise.all([need, clim, seas]).then(function (r) {
          if (t !== tok) return;
          var arch = r[0], c = r[1], sj = r[2], val = function (d) { return d in fs ? fs[d] : d in arch ? arch[d] : null; };
          var toDate = 0, gaps = 0;
          for (var d = start; d <= lastActual; d = addDays(d, 1)) { var v = val(d); if (v == null) gaps++; else toDate += v; }
          var fcLast = fcEnd < end ? fcEnd : end, next16 = 0;
          if (!post) for (d = today; d <= fcLast; d = addDays(d, 1)) next16 += fs[d] || 0;
          var pred = null;
          if (sj && sj.daily && !post) {
            var u = sj.daily_units.snowfall_sum, st = sj.daily.time, mem = Object.keys(sj.daily).filter(function (k) { return /^snowfall_sum/.test(k); });
            var after = addDays(fcLast, 1), lastSeas = st[st.length - 1], tail = 0, tailDays = 0;
            if (lastSeas < end && c) { tail = normalBetween(c, addDays(lastSeas, 1), end); tailDays = dayDiff(lastSeas, end); }
            var tots = mem.map(function (k) {
              var s = 0, arr = sj.daily[k];
              for (var i = 0; i < st.length; i++) if (st[i] >= after && st[i] <= end && arr[i] != null) s += toIn(arr[i], u);
              return toDate + next16 + s + tail;
            }).filter(isFinite);
            if (tots.length && (lastSeas >= end || c)) pred = { mean: tots.reduce(function (a, b) { return a + b; }, 0) / tots.length, p25: quant(tots, 0.25), p75: quant(tots, 0.75), n: tots.length, tailDays: tailDays };
          }
          // weekly buckets: 7-day blocks from Oct 1 through Apr 30
          var weeks = [];
          for (var ws = start; ws <= end; ws = addDays(ws, 7)) {
            var we = addDays(ws, 6) < end ? addDays(ws, 6) : end, act = 0, fc = 0, hasAct = false, hasFc = false;
            for (d = ws; d <= we; d = addDays(d, 1)) {
              if (d <= lastActual) { var a = val(d); if (a != null) { act += a; hasAct = true; } }
              else if (!post && d <= fcLast && d in fs) { fc += fs[d]; hasFc = true; }
            }
            weeks.push({ start: ws, end: we, act: act, fc: fc, norm: c ? normalBetween(c, ws, we) : null,
              kind: hasAct && !hasFc ? 'past' : hasFc && !hasAct ? 'fc' : hasFc ? 'mix' : ws > lastActual ? 'future' : 'past',
              isNow: !post && today >= ws && today <= we });
          }
          render({ clim: c, toDate: toDate, normalToDate: c ? normalBetween(c, start, lastActual) : null, next16: next16, pred: pred, weeks: weeks,
            today: today, fcEnd: fcLast, lastActual: lastActual, start: start, sy: sy, post: post, gaps: gaps });
        });
      }).catch(function () {
        if (t !== tok) return;
        lastKey = null;
        body.innerHTML = '<div class="card"><p>❄️ The snow data got lost in a whiteout. Try refreshing in a bit, or check the <a href="https://forecast.weather.gov/MapClick.php?lat=' + lat + '&lon=' + lon + '" target="_blank" rel="noopener">NWS forecast</a>.</p></div>';
      });
    }
    function setPlace(place, how) {
      placeEl.textContent = place + (how === 'ip' ? ' (approx.)' : how === 'default' ? ' (default)' : '');
    }
    // If no location arrives (e.g. the visitor never answers the location prompt), fall back to Sioux Falls.
    defaultTimer = setTimeout(function () { if (lastKey == null) load(SF_LAT, SF_LON, 'default'); }, 12000);
    return { load: load, setPlace: setPlace };
  }

  /* ---------- Live cams: nearby public weather/road cams + place search ---------- */
  function initCams() {
    var grid = $('#cams-grid'), statusEl = $('#cams-status'), viewer = $('#cams-viewer'), extra = $('#cams-extra'),
        placeEl = $('#cams-place'), form = $('#cams-search'), qEl = $('#cams-q'), nearBtn = $('#cams-near');
    if (!grid || !form) return null;
    var SRC = {
      sd: { name: 'SD DOT · SD511', url: 'https://www.sd511.org/' },
      mt: { name: 'Montana DOT · 511', url: 'https://www.511mt.net/' },
      nyc: { name: 'NYC DOT', url: 'https://webcams.nyctmc.org/' },
      iem: { name: 'Iowa Environmental Mesonet', url: 'https://mesonet.agron.iastate.edu/current/webcam.php' },
      yt: { name: 'YouTube', url: 'https://www.youtube.com/' }
    };
    var NEAR_MI = 150, STREAM_MI = 400, STILL_SHOW = 8;
    var here = null, mode = 'near', defaultTimer = null, refreshTimer = null, reqTok = 0, lastQuery = '';
    var STATES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia' };

    // Camera index (built from public DOT feeds + verified 24/7 YouTube streams) and Iowa cams fetched live from the IEM.
    var indexP = null, iemP = null;
    function loadIndex() {
      if (!indexP) indexP = fetch('cams.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
        var P = d.pfx || [];
        return (d.cams || []).map(function (c) {
          return { src: c.s, name: c.n, desc: c.d || '', region: c.r || '', lat: c.la, lon: c.lo, yt: c.yt || null,
            views: (c.v || []).map(function (v) { return { label: v[0], url: v[1] >= 0 ? P[v[1]] + v[2] : v[2] }; }) };
        });
      }).catch(function () { indexP = null; return []; });
      return indexP;
    }
    function loadIem() {
      if (!iemP) iemP = fetchJSONTimeout('https://mesonet.agron.iastate.edu/geojson/webcam.geojson?network=KCCI', 8000).then(function (j) {
        var now = Date.now();
        return (j.features || []).filter(function (f) {
          var t = Date.parse(f.properties && f.properties.utc_valid); return f.geometry && f.properties.cid && (!isFinite(t) || now - t < 3 * 3600e3);
        }).map(function (f) {
          var p = f.properties;
          return { src: 'iem', name: p.name, desc: (p.county ? p.county + ' County, ' : '') + (p.state || 'IA'), region: p.state || 'IA',
            lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], yt: null,
            views: [{ label: 'Live view', url: 'https://mesonet.agron.iastate.edu/data/camera/stills/' + encodeURIComponent(p.cid) + '.jpg' }] };
        });
      }).catch(function () { iemP = null; return []; });
      return iemP;
    }
    function allCams() { return Promise.all([loadIndex(), loadIem()]).then(function (a) { return a[0].concat(a[1]); }); }

    function miles(la1, lo1, la2, lo2) {
      var r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
      var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
      return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function withDist(list, lat, lon) {
      return list.map(function (c) { return { c: c, d: miles(lat, lon, c.lat, c.lon) }; }).sort(function (a, b) { return a.d - b.d; });
    }
    function fmtMi(d) { return d == null ? '' : d < 1 ? 'under 1 mi' : Math.round(d) + ' mi'; }
    // DOT road-weather cams are full 4K snapshots (~0.5 MB), so tiles use a small copy from the free wsrv.nl image proxy
    // (refreshed every 10 minutes); the full-size image only loads when a cam is opened. Falls back to the original if the proxy fails.
    function thumbOf(c) {
      if (c.yt) return 'https://i.ytimg.com/vi/' + c.yt + '/mqdefault.jpg';
      var u = c.views[0].url;
      if (c.src === 'sd' || c.src === 'mt') return 'https://wsrv.nl/?url=' + encodeURIComponent(u + '?t=' + Math.floor(Date.now() / 6e5)) + '&w=440&h=275&fit=cover&output=webp&q=70';
      return u;
    }

    var cur = []; // items currently shown (for the viewer)
    function tile(it, i) {
      var c = it.c, live = !!c.yt;
      return '<button type="button" class="cam-tile" data-i="' + i + '" aria-label="Watch ' + esc(c.name) + (it.d != null ? ', ' + esc(fmtMi(it.d)) + ' away' : '') + '">' +
        '<img loading="lazy" decoding="async" alt="" src="' + esc(thumbOf(c)) + '"' + (c.yt ? '' : ' data-raw="' + esc(c.views[0].url) + '"') + '>' +
        '<span class="cam-badge' + (live ? ' live' : '') + '">' + (live ? '● LIVE VIDEO' : '📷 STILL CAM') + '</span>' +
        (live ? '<span class="play" aria-hidden="true">▶</span>' : '') +
        '<span class="cap"><b>' + esc(c.name) + '</b><small>' + esc([c.yt ? c.desc.split(' · ')[0] : (c.desc || c.region), fmtMi(it.d)].filter(Boolean).join(' · ')) + '</small></span></button>';
    }
    function group(title, items, limit) {
      if (!items.length) return '';
      var start = cur.length; cur = cur.concat(items);
      var h = '<div class="cams-group"><h3>' + title + '</h3><div class="grid">';
      items.forEach(function (it, k) { h += k < limit ? tile(it, start + k) : ''; });
      h += '</div>' + (items.length > limit ? '<button type="button" class="btn btn-sm cams-more" data-from="' + (start + limit) + '" data-to="' + (start + items.length) + '">Show ' + (items.length - limit) + ' more</button>' : '') + '</div>';
      return h;
    }
    function ytSearchUrl(place) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(place + ' live cam') + '&sp=EgJAAQ%253D%253D'; }
    function linkOuts(place, note) {
      return '<div class="card"><p>' + (note || '🎥 Want more? Lots of towns have live cams on YouTube.') + '</p><div class="cams-links">' +
        '<a class="btn btn-sm" href="' + esc(ytSearchUrl(place)) + '" target="_blank" rel="noopener">▶ YouTube live cams: ' + esc(place) + '</a></div></div>';
    }

    // Show cams around a point. still = road/weather snapshot cams, streams = live video.
    function render(lat, lon, label, how, matches) {
      return allCams().then(function (list) {
        if (!list.length) { statusEl.textContent = '📷 The cam list didn\'t load. Try refreshing in a bit.'; grid.innerHTML = ''; return; }
        var sorted = withDist(list, lat, lon);
        var still = sorted.filter(function (x) { return !x.c.yt && x.d <= NEAR_MI; }).slice(0, 40);
        var streams = sorted.filter(function (x) { return x.c.yt && x.d <= STREAM_MI; }).slice(0, 8);
        (matches || []).forEach(function (m) { // text matches (e.g. "I-90") that aren't already nearby
          var key = m.c.name + m.c.lat; if (still.concat(streams).some(function (x) { return x.c.name + x.c.lat === key; })) return;
          (m.c.yt ? streams : still).push(m);
        });
        var widened = false;
        if (!still.length) { still = sorted.filter(function (x) { return !x.c.yt && x.d <= 500; }).slice(0, 4); widened = still.length > 0; }
        var featured = streams.length < 2 ? sorted.filter(function (x) { return x.c.yt && x.d > STREAM_MI; }).slice(0, 4) : [];
        cur = [];
        var nStill = still.filter(function (x) { return x.d <= NEAR_MI; }).length, nVid = streams.filter(function (x) { return x.d <= NEAR_MI; }).length, nNear = nStill + nVid;
        var vidTitle = nVid ? '● Live video near ' + esc(label) : '● Closest live video streams',
            stillTitle = widened ? '📷 Closest road &amp; weather cams we have' : '📷 Road &amp; weather cams near ' + esc(label);
        // nearest kind first: a local road cam beats a stream 300 miles away
        var stillFirst = still.length && (!streams.length || still[0].d <= streams[0].d), gVid, gStill;
        if (stillFirst) { gStill = group(stillTitle, still, STILL_SHOW); gVid = group(vidTitle, streams.slice(0, 6), 6); }
        else { gVid = group(vidTitle, streams.slice(0, 6), 6); gStill = group(stillTitle, still, STILL_SHOW); }
        grid.innerHTML = (stillFirst ? gStill + gVid : gVid + gStill) + group('● 24/7 live sky &amp; weather streams', featured, 4);
        var src = how === 'gps' ? 'your device location' : how === 'ip' ? 'approximate, from your connection' : how === 'default' ? 'default' : how === 'search' ? 'search' : '';
        statusEl.innerHTML = (nNear ? '📷 <strong>' + nNear + '</strong> live cam' + (nNear === 1 ? '' : 's') + ' within ' + NEAR_MI + ' mi of <strong>' + esc(label) + '</strong>'
          : '📷 No public cams in our list within ' + NEAR_MI + ' mi of <strong>' + esc(label) + '</strong> yet' + (still.length || streams.length ? ' — here are the closest' : '')) +
          (src ? ' <span class="muted">(' + src + ')</span>' : '') + '. Tap a cam to watch.';
        extra.innerHTML = linkOuts(label, nNear ? null : '🎥 Your area may still have cams on YouTube — try this search:');
      });
    }

    function showNear() {
      if (!here) return;
      mode = 'near';
      placeEl.textContent = here.place + (here.how === 'ip' ? ' (approx.)' : here.how === 'default' ? ' (default)' : '');
      render(here.lat, here.lon, here.place, here.how);
    }
    function load(lat, lon, how, place) {
      clearTimeout(defaultTimer);
      here = { lat: lat, lon: lon, how: how, place: place || (how === 'default' ? 'Sioux Falls, SD' : 'your area') };
      if (mode === 'near') showNear();
    }
    function setPlace(place, how) {
      if (!here || !place) return;
      here.place = place; here.how = how || here.how;
      if (mode === 'near') showNear();
    }

    // --- search: geocode the place with Open-Meteo, then list cams near it (plus any cams whose name matches) ---
    function geocode(q) {
      var parts = q.split(',').map(function (s) { return s.trim(); }), name = parts[0], hint = (parts[1] || '').toUpperCase();
      return fetchJSONTimeout('https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=' + encodeURIComponent(name), 8000).then(function (j) {
        var r = j.results || []; if (!r.length) return null;
        var full = STATES[hint] || hint;
        var pick = (hint && r.filter(function (x) { return (x.admin1 || '').toUpperCase() === full.toUpperCase() || x.country_code === hint || (x.country || '').toUpperCase() === hint; })[0]) ||
          r.filter(function (x) { return x.country_code === 'US'; })[0] || r[0];
        var st = pick.country_code === 'US' ? Object.keys(STATES).filter(function (k) { return STATES[k] === pick.admin1; })[0] : null;
        return { lat: pick.latitude, lon: pick.longitude, label: pick.name + (st ? ', ' + st : pick.admin1 ? ', ' + pick.admin1 : pick.country ? ', ' + pick.country : '') };
      }).catch(function () { return null; });
    }
    function textMatches(list, q) {
      var toks = q.toLowerCase().replace(/[,]/g, ' ').split(/\s+/).filter(function (t) { return t.length > 1; });
      if (!toks.length) return [];
      return list.filter(function (c) { var s = (c.name + ' ' + c.desc + ' ' + c.region).toLowerCase(); return toks.every(function (t) { return s.indexOf(t) >= 0; }); });
    }
    function search(q) {
      q = q.trim(); if (!q) { showNear(); return; }
      var tok = ++reqTok; mode = 'search'; lastQuery = q;
      statusEl.textContent = '🔍 Searching for cams near “' + q + '”…';
      Promise.all([geocode(q), allCams()]).then(function (a) {
        if (tok !== reqTok) return;
        var g = a[0], list = a[1], tm = textMatches(list, q);
        if (g) {
          placeEl.textContent = g.label + ' (search)';
          return render(g.lat, g.lon, g.label, 'search', withDist(tm, g.lat, g.lon).slice(0, 30));
        }
        if (tm.length) {
          var c0 = here || { lat: tm[0].lat, lon: tm[0].lon }, items = withDist(tm, c0.lat, c0.lon).slice(0, 40);
          cur = [];
          grid.innerHTML = group('● Live video matching “' + esc(q) + '”', items.filter(function (x) { return x.c.yt; }), 8) +
            group('📷 Cams matching “' + esc(q) + '”', items.filter(function (x) { return !x.c.yt; }), STILL_SHOW);
          statusEl.innerHTML = '🔍 <strong>' + tm.length + '</strong> cam' + (tm.length === 1 ? '' : 's') + ' matching “' + esc(q) + '”' + (here ? ' <span class="muted">(distances from you)</span>' : '') + '. Tap a cam to watch.';
          extra.innerHTML = linkOuts(q);
          return;
        }
        grid.innerHTML = '';
        statusEl.innerHTML = '🔍 Couldn\'t find a place or cam called “' + esc(q) + '”. Try a city and state, like <em>Denver, CO</em>.';
        extra.innerHTML = linkOuts(q, '🎥 Or try YouTube:');
      });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); search(qEl.value); });
    qEl.addEventListener('search', function () { if (!qEl.value.trim() && mode === 'search') showNear(); }); // the ✕ in the box
    nearBtn.addEventListener('click', function () {
      qEl.value = ''; mode = 'near';
      if (here) showNear(); else statusEl.textContent = '📍 Finding your location…';
      var rb = $('#radar-locate'); if (rb && (!here || here.how !== 'gps')) rb.click(); // ask for precise location (same as the radar button)
    });

    // --- viewer: lazy-loads the player only when a cam is tapped ---
    function closeViewer() { clearInterval(refreshTimer); viewer.hidden = true; viewer.innerHTML = ''; grid.querySelectorAll('.cam-tile.is-on').forEach(function (b) { b.classList.remove('is-on'); }); }
    function openCam(i, btn) {
      var it = cur[i]; if (!it) return;
      var c = it.c, s = SRC[c.src] || {};
      clearInterval(refreshTimer);
      grid.querySelectorAll('.cam-tile.is-on').forEach(function (b) { b.classList.remove('is-on'); });
      if (btn) btn.classList.add('is-on');
      var srcLink = c.yt ? '<a href="https://www.youtube.com/watch?v=' + esc(c.yt) + '" target="_blank" rel="noopener">Watch on YouTube</a> · ' + esc(c.desc.split(' · ')[1] || '')
        : 'Cam: <a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>';
      viewer.innerHTML = '<div class="cv-head"><div><h3 class="rye">' + esc(c.name) + '</h3><p>' + esc([c.yt ? c.desc.split(' · ')[0] : c.desc || c.region, it.d != null ? fmtMi(it.d) + ' away' : ''].filter(Boolean).join(' · ')) + '</p></div>' +
        '<button type="button" class="cv-close" aria-label="Close cam">✕</button></div>' +
        '<div class="cv-stage"></div><div class="cv-bar"><div class="views"></div><span class="cv-time"></span><span class="src">' + srcLink + '</span></div>';
      viewer.hidden = false;
      var stage = viewer.querySelector('.cv-stage'), views = viewer.querySelector('.views'), timeEl = viewer.querySelector('.cv-time');
      viewer.querySelector('.cv-close').addEventListener('click', closeViewer);
      if (c.yt) {
        stage.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(c.yt) + '?autoplay=1&mute=1&playsinline=1&rel=0" title="' + esc(c.name) + ' live stream" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
        timeEl.textContent = '● Live video (muted — tap for sound)';
      } else {
        var vi = 0;
        var show = function () {
          var v = c.views[vi], img = new Image();
          img.alt = c.name + ' — ' + v.label; img.decoding = 'async';
          img.onload = function () { stage.innerHTML = ''; stage.appendChild(img); timeEl.textContent = '📷 ' + v.label + ' · checked ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · refreshes every minute'; };
          img.onerror = function () { stage.innerHTML = '<p class="err">📷 This camera is offline right now. Try another one.</p>'; timeEl.textContent = ''; };
          img.src = v.url + (v.url.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000);
        };
        if (c.views.length > 1) {
          views.innerHTML = c.views.map(function (v, k) { return '<button type="button" class="cv-view" data-k="' + k + '" aria-pressed="' + (k === 0) + '">' + esc(v.label) + '</button>'; }).join('');
          views.addEventListener('click', function (e) {
            var b = e.target.closest('.cv-view'); if (!b) return;
            vi = +b.getAttribute('data-k'); views.querySelectorAll('.cv-view').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); show();
          });
        }
        stage.innerHTML = '<p class="err">Loading cam…</p>';
        show();
        refreshTimer = setInterval(function () { if (!viewer.hidden && !document.hidden) show(); }, 60000);
      }
      viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    grid.addEventListener('click', function (e) {
      var more = e.target.closest('.cams-more');
      if (more) {
        var from = +more.getAttribute('data-from'), to = +more.getAttribute('data-to'), h = '';
        for (var k = from; k < to; k++) h += tile(cur[k], k);
        more.previousElementSibling.insertAdjacentHTML('beforeend', h); more.remove(); return;
      }
      var b = e.target.closest('.cam-tile'); if (b) openCam(+b.getAttribute('data-i'), b);
    });
    // Hide thumbnails that fail to load (camera offline).
    grid.addEventListener('error', function (e) {
      var im = e.target;
      if (im.tagName === 'IMG' && im.dataset.raw && im.src.indexOf('wsrv.nl') >= 0) { im.src = im.dataset.raw; return; }
      if (e.target.tagName === 'IMG' && e.target.closest('.cam-tile')) { e.target.style.visibility = 'hidden'; e.target.insertAdjacentHTML('afterend', '<span class="err">📷 offline</span>'); }
    }, true);

    loadIndex(); loadIem(); // small, start early
    defaultTimer = setTimeout(function () { if (!here) load(SF_LAT, SF_LON, 'default'); }, 12000);
    return { load: load, setPlace: setPlace };
  }

  /* ---------- Live radar (Leaflet + RainViewer, with motion-extrapolation nowcast) + visitor location ---------- */
  function initRadar() {
    var statusEl = $('#radar-status'), timeEl = $('#radar-time'), playBtn = $('#radar-play'),
        slider = $('#radar-slider'), locBtn = $('#radar-locate');
    if (typeof L === 'undefined') {
      statusEl.textContent = 'The radar map couldn\'t load. Try refreshing, or see radar.weather.gov.';
      playBtn.disabled = locBtn.disabled = slider.disabled = true;
      if (Snow) Snow.load(SF_LAT, SF_LON, 'default');
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
      if (Snow) Snow.load(lat, lon, how, guessedPlace);
      if (Cams) Cams.load(lat, lon, how, guessedPlace);
      if (how === 'default') { return; }
      // Update the forecast to the visitor's spot (NWS covers the US). Alerts stay SD-wide.
      var inUS = lat > 17 && lat < 72 && lon > -180 && lon < -64; // skip the NWS call (404) for clearly non-US spots
      (inUS ? loadWeather(lat, lon, how === 'ip' ? 'near you (approx.)' : 'near you') : Promise.reject(new Error('non-US'))).then(function (place) {
        if (place) describe(place, true);
        if (place && Snow && token === locToken) Snow.setPlace(place, how);
        if (place && Cams && token === locToken) Cams.setPlace(place, how);
      }).catch(function () {
        // Outside NWS coverage: keep Sioux Falls forecast, radar still shows the visitor's area.
        if (token !== locToken) return;
        loadDefaultWeather();
        $('#wx-place').textContent = 'Sioux Falls, SD · NWS forecasts cover the US only';
      });
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

  var Snow = null;
  try { Snow = initSnow(); } catch (e) { /* snow section is optional */ }
  var Cams = null;
  try { Cams = initCams(); } catch (e) { /* cams section is optional */ }
  loadDefaultWeather(); loadAlerts(); loadGallery(); checkRealChaser(); initRadar();
})();
