(() => {
  'use strict';

  const APP_VERSION = '0.2.0';
  const STORAGE_KEY = 'revierai_beta_01_state';
  const MEDIA_DB = 'RevierAI_Media_v1';
  const DEFAULT_CENTER = { lat: 46.7867, lng: 12.6396 };

  const CATEGORY_META = {
    highseat: { label: 'Hochsitz/Kanzel', emoji: '⌂', color: '#86be62' },
    camera: { label: 'Wildkamera', emoji: '▣', color: '#74aee8' },
    salt: { label: 'Salzlecke', emoji: '◇', color: '#c4e286' },
    feeding: { label: 'Fütterung/Kirrung', emoji: '♨', color: '#dbb66d' },
    trail: { label: 'Wildwechsel', emoji: '↝', color: '#b48be2' },
    danger: { label: 'Gefahr/Sperrbereich', emoji: '!', color: '#dc8379' },
    shot: { label: 'Anschuss', emoji: '×', color: '#f18f66' },
    sighting: { label: 'Beobachtung', emoji: '◉', color: '#f0d58a' },
    other: { label: 'Sonstiges', emoji: '•', color: '#aab7ae' }
  };

  const state = loadState();
  let currentRoute = 'home';
  let activeMap = null;
  let activeMapLayers = [];
  let pendingMapPoint = null;
  let selectedObservationPhoto = null;
  let selectedAnalysisPhoto = null;
  let selectedTrackingPhoto = null;
  let aiModelPromise = null;
  let currentAnalysisEmbedding = null;
  let currentAnalysisAiResult = null;
  let currentReidMatches = [];

  const view = document.getElementById('view');
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modalContent');
  const toastElement = document.getElementById('toast');
  const networkBadge = document.getElementById('networkBadge');

  function defaultState() {
    return {
      observations: [],
      profiles: [],
      mapPoints: [],
      trackingCases: [],
      manualAnalyses: [],
      trophyRecords: [],
      weatherCache: null,
      mapCenter: DEFAULT_CENTER,
      mapZoom: 13,
      mapLayer: 'street',
      settings: {
        revierName: 'Mein Revier',
        testerName: 'Markus',
        defaultVisibility: 'private',
        aiBackendUrl: window.REVIERAI_CONFIG?.AI_BACKEND_URL || '',
        aiClientToken: window.REVIERAI_CONFIG?.AI_CLIENT_TOKEN || ''
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return mergeState(defaultState(), JSON.parse(raw));
    } catch (error) {
      console.error('State konnte nicht geladen werden:', error);
      return defaultState();
    }
  }

  function mergeState(base, incoming) {
    const merged = { ...base, ...incoming };
    merged.settings = { ...base.settings, ...(incoming?.settings || {}) };
    for (const key of ['observations', 'profiles', 'mapPoints', 'trackingCases', 'manualAnalyses', 'trophyRecords']) {
      if (!Array.isArray(merged[key])) merged[key] = [];
    }
    return merged;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function id(prefix = 'id') {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value, withTime = true) {
    if (!value) return '–';
    const date = new Date(value);
    return new Intl.DateTimeFormat('de-AT', withTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { dateStyle: 'medium' }).format(date);
  }

  function formatCoords(lat, lng) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return 'kein GPS';
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }

  function toast(message) {
    toastElement.textContent = message;
    toastElement.classList.add('show');
    clearTimeout(window.__revierToast);
    window.__revierToast = setTimeout(() => toastElement.classList.remove('show'), 1900);
  }

  function setNetworkStatus() {
    const online = navigator.onLine;
    networkBadge.textContent = online ? 'Online' : 'Offline – lokal';
    networkBadge.className = `status-pill ${online ? 'online' : 'offline'}`;
  }

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    modalContent.innerHTML = '';
    document.body.style.overflow = '';
  }

  function navigate(route) {
    currentRoute = route;
    if (activeMap) {
      activeMap.remove();
      activeMap = null;
      activeMapLayers = [];
    }
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function render() {
    const renderer = routes[currentRoute] || routes.home;
    view.innerHTML = renderer();
    updateNav();
    bindRouteEvents();
    afterRender[currentRoute]?.();
  }

  function updateNav() {
    document.querySelectorAll('.bottom-nav [data-route]').forEach(button => {
      button.classList.toggle('active', button.dataset.route === currentRoute);
    });
  }

  function bindRouteEvents() {
    view.querySelectorAll('[data-route]').forEach(button => {
      button.addEventListener('click', () => navigate(button.dataset.route));
    });
    view.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => handleAction(button.dataset.action, button));
    });
  }

  function card(route, icon, title, copy) {
    return `<button class="card" type="button" data-route="${route}">
      <span class="card-icon">${icon}</span><b>${escapeHtml(title)}</b><small>${escapeHtml(copy)}</small>
    </button>`;
  }

  function emptyState(icon, title, copy, buttonHtml = '') {
    return `<div class="empty"><div style="font-size:38px;margin-bottom:8px">${icon}</div><b>${escapeHtml(title)}</b><br>${escapeHtml(copy)}${buttonHtml ? `<div style="margin-top:12px">${buttonHtml}</div>` : ''}</div>`;
  }

  function homeView() {
    const recent = [...state.observations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
    const recommendation = getCachedRecommendation();
    return `<section class="page">
      <h1>Grüß dich, ${escapeHtml(state.settings.testerName)}</h1>
      <p class="sub">${escapeHtml(state.settings.revierName)} · Daten bleiben in dieser Beta auf deinem Gerät.</p>

      <div class="hero">
        <div class="eyebrow">${recommendation ? 'Aktuelle Ansitz-Einschätzung' : 'Beta 0.1 ist bereit'}</div>
        <h2>${recommendation ? `${recommendation.score} % · ${escapeHtml(recommendation.label)}` : 'Jetzt echte Revierdaten erfassen'}</h2>
        <p>${recommendation ? escapeHtml(recommendation.reason) : 'Beobachtungen, Kartenpunkte, Tierprofile, Wetter und Nachsuchen werden jetzt tatsächlich gespeichert und wieder angezeigt.'}</p>
        <div class="actions">
          <button class="primary" type="button" data-route="${recommendation ? 'weather' : 'observe'}">${recommendation ? 'Wetter öffnen' : 'Erste Beobachtung'}</button>
          <button class="secondary" type="button" data-route="map">Revierkarte</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><strong>${state.observations.length}</strong><small>Beobachtungen</small></div>
        <div class="stat"><strong>${state.profiles.length}</strong><small>Tierprofile</small></div>
        <div class="stat"><strong>${state.mapPoints.length}</strong><small>Kartenpunkte</small></div>
      </div>

      <div class="section grid">
        ${card('observe', '◉', 'Beobachtung', 'Foto, GPS und Notizen speichern')}
        ${card('map', '⌖', 'Revierkarte', 'Echte Karte und eigene Punkte')}
        ${card('profiles', '♜', 'Tierprofile', 'Bekannte Stücke verwalten')}
        ${card('weather', '☁', 'Wetter', 'Live-Wind und Dämmerung')}
        ${card('tracking', '↝', 'Nachsuche', 'Anschuss und Pirschzeichen')}
        ${card('analyze', '◎', 'Fotoanalyse', 'Manuell bewerten und zuordnen')}
      </div>

      <div class="section">
        <div class="section-head"><h2>Letzte Beobachtungen</h2><button class="link-button" type="button" data-route="observe">Alle</button></div>
        ${recent.length ? `<div class="list">${recent.map(observationRow).join('')}</div>` : emptyState('◉', 'Noch keine Beobachtung', 'Erfasse draußen ein Foto, GPS und deine Notizen.', '<button class="primary" data-route="observe">Jetzt erfassen</button>')}
      </div>
    </section>`;
  }

  function observationRow(item) {
    const profile = state.profiles.find(p => p.id === item.profileId);
    return `<button class="list-item clickable" type="button" data-action="open-observation" data-id="${item.id}">
      <span class="thumb" data-media-thumb="${item.photoId || ''}">${item.species === 'Gamswild' ? '♑' : '♜'}</span>
      <span class="meta"><b>${escapeHtml(item.species)}${item.sex ? ` · ${escapeHtml(item.sex)}` : ''}</b><small>${formatDate(item.createdAt)} · ${profile ? escapeHtml(profile.name) : formatCoords(item.latitude, item.longitude)}</small></span>
      <span class="badge">${item.visibility === 'shared' ? 'geteilt' : 'privat'}</span>
    </button>`;
  }

  function observeView() {
    const profileOptions = state.profiles.map(profile => `<option value="${profile.id}">${escapeHtml(profile.name)} · ${escapeHtml(profile.species)}</option>`).join('');
    const observations = [...state.observations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return `<section class="page">
      <h1>Beobachtungen</h1>
      <p class="sub">Foto, GPS und Angaben werden offline auf diesem iPhone gespeichert.</p>

      <form id="observationForm" class="form">
        <label class="photo-picker" for="observationPhoto">
          <div id="observationPhotoEmpty" class="photo-picker-content"><div class="big">▣</div><b>Foto aufnehmen oder auswählen</b><p>Tippen öffnet Kamera oder Fotomediathek.</p></div>
          <img id="observationPhotoPreview" hidden alt="Fotovorschau">
        </label>
        <input id="observationPhoto" type="file" accept="image/*" capture="environment" hidden>

        <div class="form-row">
          <button id="observationGpsButton" class="secondary" type="button">⌖ GPS erfassen</button>
          <button class="secondary" type="button" data-action="use-last-map-location">Kartenmitte verwenden</button>
        </div>
        <div id="observationLocation" class="notice">Standort noch nicht erfasst.</div>

        <div class="form-row">
          <div class="field"><label for="obsSpecies">Wildart</label><select id="obsSpecies" required><option>Rehwild</option><option>Rotwild</option><option>Gamswild</option></select></div>
          <div class="field"><label for="obsSex">Geschlecht</label><select id="obsSex"><option value="">unbestimmt</option><option>männlich</option><option>weiblich</option><option>Jungtier</option></select></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="obsCount">Anzahl</label><input id="obsCount" type="number" min="1" value="1"></div>
          <div class="field"><label for="obsDistance">Entfernung</label><input id="obsDistance" inputmode="decimal" placeholder="z. B. 150 m"></div>
        </div>
        <div class="field"><label for="obsBehavior">Verhalten</label><input id="obsBehavior" placeholder="Äsend, ziehend, treibend …"></div>
        <div class="field"><label for="obsNote">Notiz</label><textarea id="obsNote" placeholder="Beobachtung frei beschreiben. Die iPhone-Diktierfunktion kann direkt verwendet werden."></textarea></div>
        <div class="field"><label for="obsProfile">Tierprofil zuordnen</label><select id="obsProfile"><option value="">noch keinem Profil</option>${profileOptions}</select></div>
        <div class="field"><label for="obsVisibility">Sichtbarkeit</label><select id="obsVisibility"><option value="private">Privat</option><option value="shared">Mit Revier teilen (lokal markiert)</option></select></div>
        <button class="primary full" type="submit">Beobachtung speichern</button>
      </form>

      <div class="section">
        <div class="section-head"><h2>Gespeicherte Einträge</h2><span class="badge">${observations.length}</span></div>
        ${observations.length ? `<div class="list">${observations.map(observationRow).join('')}</div>` : emptyState('◉', 'Noch keine Einträge', 'Deine erste gespeicherte Beobachtung erscheint hier.')}
      </div>
    </section>`;
  }

  function mapView() {
    const options = Object.entries(CATEGORY_META).map(([value, meta]) => `<option value="${value}">${meta.label}</option>`).join('');
    return `<section class="page">
      <h1>Revierkarte</h1>
      <p class="sub">Punkte werden lokal gespeichert. Kartenkacheln benötigen derzeit Internet.</p>
      <div class="map-toolbar">
        <button type="button" data-action="locate-map">⌖ Mein Standort</button>
        <button type="button" data-action="toggle-map-layer">▧ ${state.mapLayer === 'topo' ? 'Straße' : 'Gelände'}</button>
        <button type="button" data-action="start-add-point">＋ Punkt setzen</button>
      </div>
      <div id="mapHint" class="notice" style="margin-bottom:9px">Tippe auf „Punkt setzen“ und danach auf die gewünschte Position in der Karte.</div>
      <div class="map-shell"><div id="leafletMap"></div></div>
      <div class="section">
        <div class="section-head"><h2>Gespeicherte Kartenpunkte</h2><span class="badge">${state.mapPoints.length}</span></div>
        ${state.mapPoints.length ? `<div class="list">${state.mapPoints.slice().reverse().map(mapPointRow).join('')}</div>` : emptyState('⌖', 'Noch keine Kartenpunkte', 'Speichere Hochsitze, Kameras, Wildwechsel oder Gefahrenstellen.')}
      </div>
      <template id="pointCategoryOptions">${options}</template>
    </section>`;
  }

  function mapPointRow(point) {
    const meta = CATEGORY_META[point.category] || CATEGORY_META.other;
    return `<button class="list-item clickable" type="button" data-action="open-map-point" data-id="${point.id}">
      <span class="thumb" style="color:${meta.color}">${meta.emoji}</span>
      <span class="meta"><b>${escapeHtml(point.name)}</b><small>${escapeHtml(meta.label)} · ${formatCoords(point.latitude, point.longitude)}</small></span>
      <span class="badge">Karte</span>
    </button>`;
  }

  function profilesView() {
    const profiles = [...state.profiles].sort((a, b) => a.name.localeCompare(b.name));
    return `<section class="page">
      <h1>Tierprofile</h1>
      <p class="sub">Bekannte Stücke anlegen und Beobachtungen über Jahre zuordnen.</p>
      <button class="primary full" type="button" data-action="new-profile">＋ Neues Tierprofil</button>
      <div class="section">
        ${profiles.length ? `<div class="list">${profiles.map(profileRow).join('')}</div>` : emptyState('♜', 'Noch kein Tierprofil', 'Lege beispielsweise „Bock 07“ an und ordne Beobachtungen zu.')}
      </div>
    </section>`;
  }

  function profileRow(profile) {
    const count = state.observations.filter(item => item.profileId === profile.id).length;
    const learningPhotos = Array.isArray(profile.aiEmbeddings) ? profile.aiEmbeddings.length : 0;
    return `<button class="list-item clickable" type="button" data-action="open-profile" data-id="${profile.id}">
      <span class="thumb">${profile.species === 'Gamswild' ? '♑' : '♜'}</span>
      <span class="meta"><b>${escapeHtml(profile.name)}</b><small>${escapeHtml(profile.species)} · ${escapeHtml(profile.age || 'Alter offen')} · ${count} Beobachtung(en) · ${learningPhotos} Lernfoto(s)</small></span>
      <span class="badge">${escapeHtml(profile.status || 'beobachten')}</span>
    </button>`;
  }

  function weatherView() {
    const cached = state.weatherCache;
    return `<section class="page">
      <h1>Wetter & Ansitz</h1>
      <p class="sub">Live-Daten werden für deinen GPS-Standort abgerufen und anschließend offline zwischengespeichert.</p>
      <div class="actions">
        <button class="primary" type="button" data-action="refresh-weather">⌖ Wetter am Standort laden</button>
        <button class="secondary" type="button" data-action="weather-map-center">Kartenmitte verwenden</button>
      </div>
      <div id="weatherContent" class="section">${cached ? renderWeather(cached) : emptyState('☁', 'Noch keine Wetterdaten', 'Lade die Prognose für deinen aktuellen Standort.')}</div>
    </section>`;
  }

  function renderWeather(cache) {
    const { data, fetchedAt, latitude, longitude } = cache;
    const current = data.current || {};
    const recommendation = calculateRecommendation(data);
    const times = data.hourly?.time || [];
    const startIndex = Math.max(0, times.findIndex(value => new Date(value) >= new Date()) - 1);
    const hours = times.slice(startIndex, startIndex + 10).map((time, offset) => {
      const index = startIndex + offset;
      return `<div class="hour"><b>${new Date(time).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})}</b><small>${Math.round(data.hourly.temperature_2m[index])} °C</small><small>Wind ${Math.round(data.hourly.wind_speed_10m[index])}</small><small>Regen ${data.hourly.precipitation_probability[index] ?? 0} %</small></div>`;
    }).join('');
    const sunrise = data.daily?.sunrise?.[0] ? new Date(data.daily.sunrise[0]).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}) : '–';
    const sunset = data.daily?.sunset?.[0] ? new Date(data.daily.sunset[0]).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}) : '–';
    return `<div class="hero">
      <div class="eyebrow">Experimentelle Ansitz-Einschätzung</div>
      <h2>${recommendation.score} % · ${escapeHtml(recommendation.label)}</h2>
      <p>${escapeHtml(recommendation.reason)}</p>
      <div class="progress"><span style="width:${recommendation.score}%"></span></div>
    </div>
    <div class="weather-main">
      <div class="weather-card"><small>Aktuell</small><div class="weather-temp">${Math.round(current.temperature_2m ?? 0)}°</div><b>${weatherCodeText(current.weather_code)}</b><div class="weather-details">
        <div><small>Wind</small><b>${Math.round(current.wind_speed_10m ?? 0)} km/h</b></div>
        <div><small>Richtung</small><b>${degreesToCompass(current.wind_direction_10m)}</b></div>
        <div><small>Böen</small><b>${Math.round(current.wind_gusts_10m ?? 0)} km/h</b></div>
        <div><small>Luftdruck</small><b>${Math.round(current.pressure_msl ?? 0)} hPa</b></div>
      </div></div>
      <div class="weather-card"><small>Sonne</small><h2 style="margin-top:8px">${sunrise}</h2><small>Sonnenaufgang</small><h2 style="margin:16px 0 2px">${sunset}</h2><small>Sonnenuntergang</small></div>
    </div>
    <div class="section"><div class="section-head"><h2>Nächste Stunden</h2><span class="badge">km/h</span></div><div class="hourly">${hours}</div></div>
    <div class="notice" style="margin-top:12px">Stand: ${formatDate(fetchedAt)} · ${formatCoords(latitude,longitude)}. Die Empfehlung ist ein experimenteller Vergleich von Wind, Niederschlag und Dämmerungsnähe – keine Garantie für Wildaktivität.</div>`;
  }

  function trackingView() {
    const cases = [...state.trackingCases].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    return `<section class="page">
      <h1>Schuss- & Nachsuche-Assistent</h1>
      <div class="warning-box">Anschuss sichern und nicht unnötig begehen. Diese Dokumentation ersetzt keinen erfahrenen Hundeführer.</div>
      <form id="trackingForm" class="form section">
        <div class="form-row">
          <div class="field"><label for="trackSpecies">Wildart</label><select id="trackSpecies"><option>Rehwild</option><option>Rotwild</option><option>Gamswild</option></select></div>
          <div class="field"><label for="trackShotTime">Schusszeit</label><input id="trackShotTime" type="datetime-local"></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="trackDistance">Schussentfernung</label><input id="trackDistance" placeholder="z. B. 140 m"></div>
          <div class="field"><label for="trackDirection">Fluchtrichtung</label><input id="trackDirection" placeholder="Richtung Graben"></div>
        </div>
        <div class="field"><label>Pirschzeichen</label><div class="check-grid">
          ${['Schweiß','Schnitthaar','Knochen','Gewebe','Keine Zeichen','Sonstiges'].map(item=>`<label class="check-option"><input type="checkbox" name="sign" value="${item}"><span>${item}</span></label>`).join('')}
        </div></div>
        <label class="photo-picker" for="trackingPhoto"><div id="trackingPhotoEmpty" class="photo-picker-content"><div class="big">▣</div><b>Foto der Pirschzeichen</b><p>Optional lokal speichern.</p></div><img id="trackingPhotoPreview" hidden alt="Vorschau"></label>
        <input id="trackingPhoto" type="file" accept="image/*" capture="environment" hidden>
        <div class="form-row"><button class="secondary" type="button" data-action="track-shooter-gps">⌖ Schützenstand</button><button class="secondary" type="button" data-action="track-impact-gps">⌖ Anschuss</button></div>
        <div id="trackingLocationStatus" class="notice">Noch keine Positionen gespeichert.</div>
        <div class="field"><label for="trackNotes">Notizen</label><textarea id="trackNotes" placeholder="Schussreaktion, Lage, Wartezeit, weitere Beobachtungen …"></textarea></div>
        <button class="primary full" type="submit">Nachsuchefall speichern</button>
      </form>
      <div class="section"><div class="section-head"><h2>Gespeicherte Fälle</h2><span class="badge">${cases.length}</span></div>${cases.length?`<div class="list">${cases.map(trackingRow).join('')}</div>`:emptyState('↝','Noch kein Nachsuchefall','Erfasste Fälle können als Protokoll geteilt werden.')}</div>
    </section>`;
  }

  function trackingRow(item) {
    return `<button class="list-item clickable" type="button" data-action="open-tracking" data-id="${item.id}"><span class="thumb" data-media-thumb="${item.photoId || ''}">↝</span><span class="meta"><b>${escapeHtml(item.species)} · ${escapeHtml(item.distance || 'Entfernung offen')}</b><small>${formatDate(item.createdAt)} · ${escapeHtml((item.signs || []).join(', ') || 'keine Pirschzeichen')}</small></span><span class="badge warning">Protokoll</span></button>`;
  }

  function analyzeView() {
    const analyses = [...state.manualAnalyses].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const profileOptions = state.profiles.map(profile=>`<option value="${profile.id}">${escapeHtml(profile.name)} · ${escapeHtml(profile.species)}</option>`).join('');
    const backendConfigured = Boolean((state.settings.aiBackendUrl || '').trim());
    return `<section class="page">
      <h1>KI-Wildanalyse</h1>
      <div class="${backendConfigured ? 'success-box' : 'warning-box'}">
        <b>${backendConfigured ? 'KI-Server verbunden' : 'KI-Server noch nicht eingetragen'}</b><br>
        Die Tierwiedererkennung läuft mit einem Bildmodell direkt auf dem Gerät. Die Altersschätzung wird über den geschützten RevierAI-KI-Server ausgeführt und bleibt eine jagdliche Schätzung, keine sichere Altersfeststellung.
      </div>

      <form id="analysisForm" class="form section">
        <label class="photo-picker" for="analysisPhoto">
          <div id="analysisPhotoEmpty" class="photo-picker-content"><div class="big">◎</div><b>Wildfoto auswählen</b><p>Eine möglichst scharfe Front- oder Seitenaufnahme verwenden.</p></div>
          <img id="analysisPhotoPreview" hidden alt="Vorschau">
        </label>
        <input id="analysisPhoto" type="file" accept="image/*" capture="environment" hidden>

        <div id="aiModelStatus" class="notice">Tierwiedererkennung wartet auf ein Foto.</div>

        <div class="form-row">
          <div class="field"><label for="analysisSpecies">Wildart</label><select id="analysisSpecies"><option>Rehwild</option><option>Rotwild</option><option>Gamswild</option></select></div>
          <div class="field"><label for="analysisSex">Geschlecht</label><select id="analysisSex"><option>unbestimmt</option><option>männlich</option><option>weiblich</option><option>Jungtier</option></select></div>
        </div>

        <div class="actions">
          <button id="runAgeAiButton" class="primary" type="button">KI-Alter schätzen</button>
          <button id="rerunReidButton" class="secondary" type="button">Tiervergleich wiederholen</button>
        </div>

        <div id="ageAiResult" class="ai-panel" hidden></div>

        <div class="section-head"><h3>Automatische Tierwiedererkennung</h3><span id="reidModelBadge" class="badge">lokal</span></div>
        <div id="reidMatches" class="ai-panel">
          <div class="empty">Noch kein Vergleich durchgeführt. Ein Profil benötigt mindestens ein bestätigtes Lernfoto.</div>
        </div>

        <div class="field"><label for="analysisAge">Übernommene Altersschätzung</label><input id="analysisAge" placeholder="z. B. 4–5 Jahre"></div>
        <div class="field"><label for="analysisTrophy">Trophäen-/Körpermerkmale</label><textarea id="analysisTrophy" placeholder="Träger, Haupt, Rosenstock, Lauscherreferenz, Windfang, Auslage …"></textarea></div>
        <div class="field"><label for="analysisHealth">Gesundheit/Auffälligkeiten</label><textarea id="analysisHealth" placeholder="Keine Auffälligkeit oder sichtbare Verletzung beschreiben"></textarea></div>
        <div class="field"><label for="analysisProfile">Tierprofil bestätigen</label><select id="analysisProfile"><option value="">kein Profil</option>${profileOptions}</select></div>
        <button id="createProfileFromAnalysis" class="secondary full" type="button">＋ Neues Profil aus diesem Foto</button>
        <button class="primary full" type="submit">Analyse und Lernfoto speichern</button>
      </form>

      <div class="section"><div class="section-head"><h2>Gespeicherte KI-Analysen</h2><span class="badge">${analyses.length}</span></div>${analyses.length?`<div class="list">${analyses.map(analysisRow).join('')}</div>`:emptyState('◎','Noch keine Analyse','Wähle ein Foto, führe die KI aus und bestätige das Ergebnis.')}</div>
    </section>`;
  }

  function analysisRow(item) {
    const aiBadge = item.aiResult ? `${Math.round(item.aiResult.confidence || 0)} % KI` : 'manuell';
    const matchText = item.reidMatch?.profileName ? ` · Treffer: ${item.reidMatch.profileName}` : '';
    return `<button class="list-item clickable" type="button" data-action="open-analysis" data-id="${item.id}"><span class="thumb" data-media-thumb="${item.photoId || ''}">◎</span><span class="meta"><b>${escapeHtml(item.species)} · ${escapeHtml(item.age || 'Alter offen')}</b><small>${formatDate(item.createdAt)}${escapeHtml(matchText)} · ${escapeHtml(item.health || 'keine Gesundheitsnotiz')}</small></span><span class="badge">${escapeHtml(aiBadge)}</span></button>`;
  }

  function moreView() {
    return `<section class="page">
      <h1>Mehr</h1>
      <div class="grid">
        ${card('weather','☁','Wetter','Live-Daten und Ansitz-Einschätzung')}
        ${card('tracking','↝','Nachsuche','Protokolle und GPS-Punkte')}
        ${card('analyze','◎','KI-Wildanalyse','Altersschätzung und Wiedererkennung')}
        ${card('trophy','♛','Trophäenakte','Messwerte lokal speichern')}
        ${card('data','⇅','Daten & Backup','Export, Import und Löschen')}
        ${card('settings','⚙','Einstellungen','Reviername und Benutzer')}
      </div>
      <div class="notice section"><b>Funktionsstand Beta ${APP_VERSION}</b><br>Die Tierwiedererkennung nutzt lokale Bild-Embeddings. Die Altersschätzung arbeitet über den konfigurierten RevierAI-KI-Server. Beide Ergebnisse müssen jagdlich bestätigt werden.</div>
    </section>`;
  }

  function trophyView() {
    const records = [...state.trophyRecords].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    return `<section class="page"><h1>Trophäenakte</h1><div class="notice">Die Scanbox und automatische CIC-Vermessung sind noch nicht aktiv. Messwerte und Fotos können aber bereits als digitale Akte gespeichert werden.</div>
      <form id="trophyForm" class="form section"><div class="form-row"><div class="field"><label for="trophySpecies">Wildart</label><select id="trophySpecies"><option>Rehwild</option><option>Gamswild</option><option>Rotwild</option></select></div><div class="field"><label for="trophyAge">bestätigtes Alter</label><input id="trophyAge" placeholder="z. B. 8 Jahre"></div></div><div class="field"><label for="trophyCode">Trophäennummer</label><input id="trophyCode" placeholder="z. B. RA-AT-0001"></div><div class="field"><label for="trophyMeasurements">Messwerte</label><textarea id="trophyMeasurements" placeholder="Stangenlänge, Auslage, Gewicht, Punkte, Jahresringe …"></textarea></div><div class="field"><label for="trophyNotes">Notizen</label><textarea id="trophyNotes"></textarea></div><button class="primary full" type="submit">Trophäenakte speichern</button></form>
      <div class="section">${records.length?`<div class="list">${records.map(record=>`<button class="list-item clickable" data-action="open-trophy" data-id="${record.id}"><span class="thumb">♛</span><span class="meta"><b>${escapeHtml(record.code || record.species)}</b><small>${escapeHtml(record.species)} · ${escapeHtml(record.age || 'Alter offen')} · ${formatDate(record.createdAt)}</small></span><span class="badge">Akte</span></button>`).join('')}</div>`:emptyState('♛','Noch keine Trophäenakte','Speichere Messwerte und spätere offizielle Bewertungen.')}</div></section>`;
  }

  function dataView() {
    return `<section class="page"><h1>Daten & Backup</h1><p class="sub">Exportiere alle strukturierten Daten als JSON. Fotos bleiben separat im lokalen Medienspeicher.</p><div class="list"><button class="list-item clickable" data-action="export-data"><span class="thumb">⇩</span><span class="meta"><b>Daten exportieren</b><small>JSON-Backup teilen oder speichern</small></span></button><label class="list-item clickable" for="backupImport"><span class="thumb">⇧</span><span class="meta"><b>Backup importieren</b><small>Eine zuvor exportierte JSON-Datei einlesen</small></span></label><input id="backupImport" type="file" accept="application/json,.json" hidden><button class="list-item clickable" data-action="clear-all-data"><span class="thumb">!</span><span class="meta"><b>Alle lokalen Daten löschen</b><small>Beobachtungen, Profile, Punkte und Fotos entfernen</small></span><span class="badge danger">Achtung</span></button></div><div class="notice section">Für den Test mit 2–5 Jagdkollegen brauchen wir als nächsten Schritt Benutzerkonten und eine EU-Cloud-Datenbank. Bis dahin bleiben die Daten ausschließlich auf diesem Gerät.</div></section>`;
  }

  function settingsView() {
    return `<section class="page"><h1>Einstellungen</h1><form id="settingsForm" class="form"><div class="field"><label for="settingsName">Dein Name</label><input id="settingsName" value="${escapeHtml(state.settings.testerName)}"></div><div class="field"><label for="settingsRevier">Reviername</label><input id="settingsRevier" value="${escapeHtml(state.settings.revierName)}"></div><div class="field"><label for="settingsVisibility">Standard-Sichtbarkeit</label><select id="settingsVisibility"><option value="private" ${state.settings.defaultVisibility==='private'?'selected':''}>Privat</option><option value="shared" ${state.settings.defaultVisibility==='shared'?'selected':''}>Mit Revier teilen</option></select></div><div class="field"><label for="settingsAiBackend">RevierAI-KI-Server</label><input id="settingsAiBackend" type="url" inputmode="url" value="${escapeHtml(state.settings.aiBackendUrl || '')}" placeholder="https://revierai-ai.deinname.workers.dev"></div><div class="field"><label for="settingsAiToken">Beta-Zugangscode</label><input id="settingsAiToken" type="password" value="${escapeHtml(state.settings.aiClientToken || '')}" autocomplete="off" placeholder="Nur für eure Testgruppe"></div><div class="notice">Der OpenAI-Schlüssel gehört ausschließlich auf den Server – niemals in die App oder nach GitHub.</div><div class="actions"><button class="primary" type="submit">Einstellungen speichern</button><button class="secondary" type="button" data-action="test-ai-backend">KI-Verbindung testen</button></div></form><div class="notice section">App-Version ${APP_VERSION} · Bundle-ID at.revierai.app</div></section>`;
  }

  const routes = {
    home: homeView,
    observe: observeView,
    map: mapView,
    profiles: profilesView,
    weather: weatherView,
    tracking: trackingView,
    analyze: analyzeView,
    more: moreView,
    trophy: trophyView,
    data: dataView,
    settings: settingsView
  };

  const afterRender = {
    home: hydrateMediaThumbnails,
    observe: setupObservationForm,
    map: setupMap,
    profiles: () => {},
    weather: () => {},
    tracking: setupTrackingForm,
    analyze: setupAnalysisForm,
    trophy: setupTrophyForm,
    data: setupDataImport,
    settings: setupSettingsForm
  };

  function setupObservationForm() {
    const fileInput = document.getElementById('observationPhoto');
    fileInput.addEventListener('change', () => {
      selectedObservationPhoto = fileInput.files?.[0] || null;
      previewFile(selectedObservationPhoto, 'observationPhotoPreview', 'observationPhotoEmpty');
    });
    document.getElementById('observationGpsButton').addEventListener('click', () => captureGps('observation'));
    document.getElementById('obsVisibility').value = state.settings.defaultVisibility;
    document.getElementById('observationForm').addEventListener('submit', saveObservation);
    hydrateMediaThumbnails();
  }

  async function saveObservation(event) {
    event.preventDefault();
    const locationElement = document.getElementById('observationLocation');
    const coords = locationElement.dataset.coords ? JSON.parse(locationElement.dataset.coords) : null;
    const observation = {
      id: id('obs'),
      createdAt: new Date().toISOString(),
      species: document.getElementById('obsSpecies').value,
      sex: document.getElementById('obsSex').value,
      count: Number(document.getElementById('obsCount').value || 1),
      distance: document.getElementById('obsDistance').value.trim(),
      behavior: document.getElementById('obsBehavior').value.trim(),
      note: document.getElementById('obsNote').value.trim(),
      profileId: document.getElementById('obsProfile').value || null,
      visibility: document.getElementById('obsVisibility').value,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      accuracy: coords?.accuracy ?? null,
      photoId: null
    };
    if (selectedObservationPhoto) {
      observation.photoId = id('media');
      await putMedia(observation.photoId, selectedObservationPhoto, 'observation');
    }
    state.observations.push(observation);
    saveState();
    selectedObservationPhoto = null;
    toast('Beobachtung gespeichert');
    render();
  }

  function setupTrackingForm() {
    const fileInput = document.getElementById('trackingPhoto');
    fileInput.addEventListener('change', () => {
      selectedTrackingPhoto = fileInput.files?.[0] || null;
      previewFile(selectedTrackingPhoto, 'trackingPhotoPreview', 'trackingPhotoEmpty');
    });
    const time = document.getElementById('trackShotTime');
    time.value = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
    document.getElementById('trackingForm').addEventListener('submit', saveTrackingCase);
  }

  async function saveTrackingCase(event) {
    event.preventDefault();
    const status = document.getElementById('trackingLocationStatus');
    const locations = status.dataset.locations ? JSON.parse(status.dataset.locations) : {};
    const selectedSigns = [...document.querySelectorAll('input[name="sign"]:checked')].map(input => input.value);
    const item = {
      id: id('track'), createdAt: new Date().toISOString(),
      species: document.getElementById('trackSpecies').value,
      shotTime: document.getElementById('trackShotTime').value,
      distance: document.getElementById('trackDistance').value.trim(),
      direction: document.getElementById('trackDirection').value.trim(),
      signs: selectedSigns,
      notes: document.getElementById('trackNotes').value.trim(),
      locations,
      photoId: null
    };
    if (selectedTrackingPhoto) {
      item.photoId = id('media');
      await putMedia(item.photoId, selectedTrackingPhoto, 'tracking');
    }
    state.trackingCases.push(item);
    saveState();
    selectedTrackingPhoto = null;
    toast('Nachsuchefall gespeichert');
    render();
  }

  function setupAnalysisForm() {
    const input = document.getElementById('analysisPhoto');
    const species = document.getElementById('analysisSpecies');

    input.addEventListener('change', async () => {
      selectedAnalysisPhoto = input.files?.[0] || null;
      currentAnalysisAiResult = null;
      currentAnalysisEmbedding = null;
      currentReidMatches = [];
      previewFile(selectedAnalysisPhoto, 'analysisPhotoPreview', 'analysisPhotoEmpty');
      resetAgeAiResult();
      if (selectedAnalysisPhoto) await runLocalReidentification();
    });

    species.addEventListener('change', async () => {
      if (selectedAnalysisPhoto) await runLocalReidentification();
    });

    document.getElementById('runAgeAiButton').addEventListener('click', runAgeEstimation);
    document.getElementById('rerunReidButton').addEventListener('click', runLocalReidentification);
    document.getElementById('createProfileFromAnalysis').addEventListener('click', createProfileFromAnalysis);
    document.getElementById('analysisForm').addEventListener('submit', saveAnalysis);
    hydrateMediaThumbnails();
  }

  function resetAgeAiResult() {
    const host = document.getElementById('ageAiResult');
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
  }

  async function ensureAiModel() {
    if (!window.tf || !window.mobilenet) {
      throw new Error('Das lokale KI-Modul wurde nicht in die App eingebettet.');
    }
    if (!aiModelPromise) {
      aiModelPromise = (async () => {
        await tf.ready();
        try {
          if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl');
        } catch (error) {
          console.warn('WebGL nicht verfügbar, TensorFlow nutzt Fallback:', error);
        }
        return mobilenet.load({ version: 2, alpha: 0.5 });
      })();
    }
    return aiModelPromise;
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')); };
      image.src = url;
    });
  }

  function l2Normalize(values) {
    const vector = Array.from(values, Number);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map(value => value / norm);
  }

  function quantizeEmbedding(vector) {
    return vector.map(value => Math.max(-127, Math.min(127, Math.round(value * 127))));
  }

  function dequantizeEmbedding(vector) {
    return (vector || []).map(value => Number(value) / 127);
  }

  function cosineSimilarity(a, b) {
    if (!a?.length || !b?.length || a.length !== b.length) return -1;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / ((Math.sqrt(normA) * Math.sqrt(normB)) || 1);
  }

  function matchConfidence(similarity) {
    return Math.max(0, Math.min(99, Math.round(((similarity - 0.58) / 0.36) * 100)));
  }

  function matchLabel(similarity) {
    if (similarity >= 0.90) return 'hohe visuelle Ähnlichkeit';
    if (similarity >= 0.82) return 'möglicherweise dasselbe Tier';
    if (similarity >= 0.74) return 'gewisse Ähnlichkeit';
    return 'geringe Ähnlichkeit';
  }

  function findProfileMatches(embedding, species) {
    return state.profiles
      .filter(profile => profile.species === species && Array.isArray(profile.aiEmbeddings) && profile.aiEmbeddings.length)
      .map(profile => {
        const similarities = profile.aiEmbeddings.map(reference => cosineSimilarity(embedding, dequantizeEmbedding(reference.vector)));
        const similarity = Math.max(...similarities);
        return { profileId: profile.id, profileName: profile.name, similarity, confidence: matchConfidence(similarity), label: matchLabel(similarity), referenceCount: profile.aiEmbeddings.length };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  async function runLocalReidentification() {
    const status = document.getElementById('aiModelStatus');
    const host = document.getElementById('reidMatches');
    const button = document.getElementById('rerunReidButton');
    if (!selectedAnalysisPhoto) { toast('Bitte zuerst ein Wildfoto auswählen'); return; }

    status.className = 'notice';
    status.textContent = 'Lokales Bildmodell wird geladen und das Foto ausgewertet …';
    button.disabled = true;

    try {
      const model = await ensureAiModel();
      const { image, url } = await fileToImage(selectedAnalysisPhoto);
      let tensor;
      try {
        tensor = model.infer(image, true);
        currentAnalysisEmbedding = l2Normalize(await tensor.data());
      } finally {
        tensor?.dispose?.();
        URL.revokeObjectURL(url);
      }

      currentReidMatches = findProfileMatches(currentAnalysisEmbedding, document.getElementById('analysisSpecies').value);
      renderReidMatches();
      status.className = 'success-box';
      status.innerHTML = `<b>Lokale KI bereit</b><br>Bild-Fingerabdruck mit ${currentAnalysisEmbedding.length} Merkmalen erstellt. Das Foto selbst wird für den Vergleich nicht an einen Server gesendet.`;
    } catch (error) {
      console.error(error);
      currentAnalysisEmbedding = null;
      currentReidMatches = [];
      status.className = 'danger-box';
      status.textContent = `Tiervergleich fehlgeschlagen: ${error.message}`;
      host.innerHTML = '<div class="empty">Das Modell benötigt beim ersten Laden eine Internetverbindung. Danach kann es je nach iPhone-Cache erneut verfügbar sein.</div>';
    } finally {
      button.disabled = false;
    }
  }

  function renderReidMatches() {
    const host = document.getElementById('reidMatches');
    if (!host) return;
    if (!state.profiles.some(profile => profile.species === document.getElementById('analysisSpecies').value && profile.aiEmbeddings?.length)) {
      host.innerHTML = '<div class="empty"><b>Noch keine Referenzbilder</b><br>Ordne dieses Foto einem Profil zu und speichere es. Danach kann RevierAI neue Bilder automatisch vergleichen.</div>';
      return;
    }
    if (!currentReidMatches.length) {
      host.innerHTML = '<div class="empty">Kein passendes Profil mit Referenzbild gefunden.</div>';
      return;
    }
    host.innerHTML = `<div class="match-list">${currentReidMatches.map((match, index) => `
      <button type="button" class="match-card ${index === 0 ? 'best' : ''}" data-profile-match="${match.profileId}">
        <span><b>${escapeHtml(match.profileName)}</b><small>${escapeHtml(match.label)} · ${match.referenceCount} Lernfoto(s)</small></span>
        <span class="match-score">${match.confidence} %</span>
      </button>`).join('')}</div><div class="notice" style="margin-top:9px">Die Wiedererkennung nutzt ein allgemeines Bildmodell. Perspektive, Hintergrund, Jahreszeit und Geweihwechsel können das Ergebnis stark beeinflussen. Der Jäger muss den Treffer bestätigen.</div>`;
    host.querySelectorAll('[data-profile-match]').forEach(button => button.addEventListener('click', () => {
      document.getElementById('analysisProfile').value = button.dataset.profileMatch;
      host.querySelectorAll('.match-card').forEach(card => card.classList.toggle('selected', card === button));
      toast('Tierprofil als Treffer ausgewählt');
    }));
  }

  async function compressImageDataUrl(file, maxDimension = 1600, quality = 0.82) {
    const { image, url } = await fileToImage(file);
    try {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function normalizedBackendUrl() {
    return String(state.settings.aiBackendUrl || window.REVIERAI_CONFIG?.AI_BACKEND_URL || '').trim().replace(/\/+$/, '');
  }

  async function runAgeEstimation() {
    if (!selectedAnalysisPhoto) { toast('Bitte zuerst ein Wildfoto auswählen'); return; }
    const backend = normalizedBackendUrl();
    if (!backend) {
      toast('KI-Server zuerst in Einstellungen eintragen');
      navigate('settings');
      return;
    }

    const button = document.getElementById('runAgeAiButton');
    const host = document.getElementById('ageAiResult');
    button.disabled = true;
    button.textContent = 'KI analysiert …';
    host.hidden = false;
    host.innerHTML = '<div class="ai-loading"><span></span> Foto wird komprimiert und sicher analysiert …</div>';

    try {
      const imageDataUrl = await compressImageDataUrl(selectedAnalysisPhoto);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 70000);
      const response = await fetch(`${backend}/analyze-age`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RevierAI-Token': state.settings.aiClientToken || '' },
        body: JSON.stringify({
          imageDataUrl,
          speciesHint: document.getElementById('analysisSpecies').value,
          sexHint: document.getElementById('analysisSex').value
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Serverfehler ${response.status}`);
      currentAnalysisAiResult = payload.analysis || payload;
      applyAgeAiResult(currentAnalysisAiResult);
    } catch (error) {
      console.error(error);
      currentAnalysisAiResult = null;
      host.className = 'danger-box';
      host.innerHTML = `<b>KI-Altersschätzung fehlgeschlagen</b><br>${escapeHtml(error.name === 'AbortError' ? 'Zeitüberschreitung beim KI-Server.' : error.message)}`;
    } finally {
      button.disabled = false;
      button.textContent = 'KI-Alter schätzen';
    }
  }

  function applyAgeAiResult(result) {
    const host = document.getElementById('ageAiResult');
    host.className = 'ai-panel';
    host.hidden = false;
    document.getElementById('analysisSpecies').value = ['Rehwild','Rotwild','Gamswild'].includes(result.species) ? result.species : document.getElementById('analysisSpecies').value;
    if (['männlich','weiblich','Jungtier','unbestimmt'].includes(result.sex)) document.getElementById('analysisSex').value = result.sex;
    document.getElementById('analysisAge').value = result.age_label || '';
    document.getElementById('analysisTrophy').value = [result.trophy_assessment, ...(result.visible_features || [])].filter(Boolean).join('\n');
    document.getElementById('analysisHealth').value = result.health_observations || '';

    host.innerHTML = `<div class="section-head"><h3>KI-Ergebnis</h3><span class="badge">${Math.round(result.confidence || 0)} %</span></div>
      <div class="ai-result-grid">
        <div><small>Wildart</small><b>${escapeHtml(result.species || 'unbekannt')}</b></div>
        <div><small>Geschlecht</small><b>${escapeHtml(result.sex || 'unbestimmt')}</b></div>
        <div><small>Alter</small><b>${escapeHtml(result.age_label || 'nicht bestimmbar')}</b></div>
        <div><small>Bildqualität</small><b>${escapeHtml(result.image_quality || 'unbekannt')}</b></div>
      </div>
      <p><b>Begründung:</b><br>${escapeHtml((result.visible_features || []).join(' · ') || 'Keine belastbaren Merkmale erkannt.')}</p>
      <p><b>Grenzen:</b><br>${escapeHtml((result.limitations || []).join(' · ') || 'Ergebnis muss jagdlich geprüft werden.')}</p>
      <div class="warning-box">${result.requires_human_review === false ? 'Trotz guter Bildqualität bleibt die Einschätzung unverbindlich.' : 'Menschliche Kontrolle ausdrücklich erforderlich.'}</div>`;
  }

  function addEmbeddingToProfile(profile, embedding, sourceAnalysisId = null) {
    if (!profile || !embedding?.length) return false;
    if (!Array.isArray(profile.aiEmbeddings)) profile.aiEmbeddings = [];
    const duplicate = profile.aiEmbeddings.some(reference => cosineSimilarity(embedding, dequantizeEmbedding(reference.vector)) > 0.995);
    if (duplicate) return false;
    profile.aiEmbeddings.push({ vector: quantizeEmbedding(embedding), createdAt: new Date().toISOString(), sourceAnalysisId });
    if (profile.aiEmbeddings.length > 10) profile.aiEmbeddings = profile.aiEmbeddings.slice(-10);
    return true;
  }

  function createProfileFromAnalysis() {
    if (!selectedAnalysisPhoto || !currentAnalysisEmbedding) {
      toast('Bitte zuerst Foto auswählen und Tiervergleich ausführen');
      return;
    }
    const species = document.getElementById('analysisSpecies').value;
    const suggested = `${species} ${String(state.profiles.filter(profile => profile.species === species).length + 1).padStart(2, '0')}`;
    const name = prompt('Name oder Kennnummer des Tierprofils:', suggested)?.trim();
    if (!name) return;
    const profile = {
      id: id('profile'), createdAt: new Date().toISOString(), name,
      species,
      sex: document.getElementById('analysisSex').value,
      age: document.getElementById('analysisAge').value.trim(),
      status: 'beobachten',
      notes: 'Profil aus KI-Wildanalyse angelegt.',
      aiEmbeddings: []
    };
    addEmbeddingToProfile(profile, currentAnalysisEmbedding, null);
    state.profiles.push(profile);
    saveState();
    const select = document.getElementById('analysisProfile');
    select.add(new Option(`${profile.name} · ${profile.species}`, profile.id));
    select.value = profile.id;
    currentReidMatches = findProfileMatches(currentAnalysisEmbedding, species);
    renderReidMatches();
    toast('Tierprofil mit Lernfoto erstellt');
  }

  async function saveAnalysis(event) {
    event.preventDefault();
    const selectedProfileId = document.getElementById('analysisProfile').value || null;
    const selectedMatch = currentReidMatches.find(match => match.profileId === selectedProfileId) || null;
    const item = {
      id: id('analysis'), createdAt: new Date().toISOString(),
      species: document.getElementById('analysisSpecies').value,
      sex: document.getElementById('analysisSex').value,
      age: document.getElementById('analysisAge').value.trim(),
      trophy: document.getElementById('analysisTrophy').value.trim(),
      health: document.getElementById('analysisHealth').value.trim(),
      profileId: selectedProfileId,
      aiResult: currentAnalysisAiResult,
      reidMatch: selectedMatch ? { profileId: selectedMatch.profileId, profileName: selectedMatch.profileName, confidence: selectedMatch.confidence, similarity: selectedMatch.similarity } : null,
      photoId: null
    };
    if (selectedAnalysisPhoto) {
      item.photoId = id('media');
      await putMedia(item.photoId, selectedAnalysisPhoto, 'analysis');
    }
    state.manualAnalyses.push(item);
    if (selectedProfileId && currentAnalysisEmbedding) {
      const profile = state.profiles.find(entry => entry.id === selectedProfileId);
      addEmbeddingToProfile(profile, currentAnalysisEmbedding, item.id);
      if (profile && !profile.age && item.age) profile.age = item.age;
    }
    saveState();
    selectedAnalysisPhoto = null;
    currentAnalysisEmbedding = null;
    currentAnalysisAiResult = null;
    currentReidMatches = [];
    toast('KI-Analyse und Lernfoto gespeichert');
    render();
  }

  function setupTrophyForm() {
    document.getElementById('trophyForm').addEventListener('submit', event => {
      event.preventDefault();
      state.trophyRecords.push({
        id: id('trophy'), createdAt: new Date().toISOString(),
        species: document.getElementById('trophySpecies').value,
        age: document.getElementById('trophyAge').value.trim(),
        code: document.getElementById('trophyCode').value.trim(),
        measurements: document.getElementById('trophyMeasurements').value.trim(),
        notes: document.getElementById('trophyNotes').value.trim()
      });
      saveState(); toast('Trophäenakte gespeichert'); render();
    });
  }

  function setupSettingsForm() {
    document.getElementById('settingsForm').addEventListener('submit', event => {
      event.preventDefault();
      state.settings.testerName = document.getElementById('settingsName').value.trim() || 'Markus';
      state.settings.revierName = document.getElementById('settingsRevier').value.trim() || 'Mein Revier';
      state.settings.defaultVisibility = document.getElementById('settingsVisibility').value;
      state.settings.aiBackendUrl = document.getElementById('settingsAiBackend').value.trim().replace(/\/+$/, '');
      state.settings.aiClientToken = document.getElementById('settingsAiToken').value.trim();
      saveState(); toast('Einstellungen gespeichert'); navigate('home');
    });
  }

  function setupDataImport() {
    const input = document.getElementById('backupImport');
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const incoming = JSON.parse(await file.text());
        if (!incoming || typeof incoming !== 'object') throw new Error('Ungültige Datei');
        const merged = mergeState(defaultState(), incoming.state || incoming);
        Object.assign(state, merged);
        saveState(); toast('Backup importiert'); render();
      } catch (error) {
        console.error(error); toast('Backup konnte nicht importiert werden');
      }
    });
  }

  function previewFile(file, previewId, emptyId) {
    const preview = document.getElementById(previewId);
    const empty = document.getElementById(emptyId);
    if (!file) { preview.hidden = true; empty.hidden = false; return; }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false; empty.hidden = true;
  }

  async function captureGps(target) {
    if (!navigator.geolocation) { toast('GPS wird nicht unterstützt'); return null; }
    const status = target === 'observation' ? document.getElementById('observationLocation') : document.getElementById('trackingLocationStatus');
    if (status) status.textContent = 'Standort wird ermittelt …';
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(position => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
        if (target === 'observation') {
          status.dataset.coords = JSON.stringify(coords);
          status.innerHTML = `<b>Standort erfasst</b><br>${formatCoords(coords.latitude,coords.longitude)} · Genauigkeit ca. ${Math.round(coords.accuracy)} m`;
        }
        resolve(coords);
      }, error => {
        console.error(error); if (status) status.textContent = 'GPS konnte nicht erfasst werden. Berechtigung prüfen.'; toast('GPS-Erfassung fehlgeschlagen'); resolve(null);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    });
  }

  async function captureTrackingLocation(kind) {
    const coords = await captureGps('tracking-temp');
    if (!coords) return;
    const status = document.getElementById('trackingLocationStatus');
    const locations = status.dataset.locations ? JSON.parse(status.dataset.locations) : {};
    locations[kind] = coords;
    status.dataset.locations = JSON.stringify(locations);
    status.innerHTML = `${locations.shooter ? `<b>Schützenstand:</b> ${formatCoords(locations.shooter.latitude,locations.shooter.longitude)}<br>` : ''}${locations.impact ? `<b>Anschuss:</b> ${formatCoords(locations.impact.latitude,locations.impact.longitude)}` : ''}`;
    toast(kind === 'shooter' ? 'Schützenstand gespeichert' : 'Anschuss gespeichert');
  }

  function setupMap() {
    if (!window.L) {
      document.getElementById('leafletMap').innerHTML = '<div class="empty" style="margin:20px">Kartenbibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.</div>';
      return;
    }
    activeMap = L.map('leafletMap', { zoomControl: true }).setView([state.mapCenter.lat, state.mapCenter.lng], state.mapZoom);
    addBaseLayer();
    renderMapLayers();
    let addMode = false;
    const startButton = view.querySelector('[data-action="start-add-point"]');
    startButton?.addEventListener('click', () => {
      addMode = !addMode;
      startButton.classList.toggle('active', addMode);
      document.getElementById('mapHint').textContent = addMode ? 'Punktmodus aktiv: Tippe jetzt auf die Karte.' : 'Punktmodus beendet.';
    });
    activeMap.on('click', event => {
      state.mapCenter = { lat: event.latlng.lat, lng: event.latlng.lng };
      state.mapZoom = activeMap.getZoom(); saveState();
      if (!addMode) return;
      pendingMapPoint = { latitude: event.latlng.lat, longitude: event.latlng.lng };
      openNewMapPointModal();
      addMode = false; startButton?.classList.remove('active');
    });
    activeMap.on('moveend', () => {
      const center = activeMap.getCenter(); state.mapCenter = { lat: center.lat, lng: center.lng }; state.mapZoom = activeMap.getZoom(); saveState();
    });
  }

  function addBaseLayer() {
    const street = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const topo = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
    const url = state.mapLayer === 'topo' ? topo : street;
    const attribution = state.mapLayer === 'topo'
      ? '&copy; OpenStreetMap-Mitwirkende, SRTM | OpenTopoMap'
      : '&copy; OpenStreetMap-Mitwirkende';
    const layer = L.tileLayer(url, { maxZoom: state.mapLayer === 'topo' ? 17 : 19, attribution });
    layer.addTo(activeMap); activeMapLayers.push(layer);
  }

  function renderMapLayers() {
    for (const point of state.mapPoints) {
      const meta = CATEGORY_META[point.category] || CATEGORY_META.other;
      const marker = L.marker([point.latitude, point.longitude], { icon: markerIcon(meta) }).addTo(activeMap);
      marker.bindPopup(`<b>${escapeHtml(point.name)}</b><br>${escapeHtml(meta.label)}${point.note ? `<br>${escapeHtml(point.note)}` : ''}`);
      activeMapLayers.push(marker);
    }
    for (const item of state.observations.filter(o => Number.isFinite(Number(o.latitude)))) {
      const meta = CATEGORY_META.sighting;
      const marker = L.marker([item.latitude,item.longitude], { icon: markerIcon(meta) }).addTo(activeMap);
      marker.bindPopup(`<b>${escapeHtml(item.species)}</b><br>${formatDate(item.createdAt)}${item.note ? `<br>${escapeHtml(item.note)}` : ''}`);
      activeMapLayers.push(marker);
    }
    for (const item of state.trackingCases) {
      if (item.locations?.impact) {
        const meta = CATEGORY_META.shot;
        const marker = L.marker([item.locations.impact.latitude,item.locations.impact.longitude], { icon: markerIcon(meta) }).addTo(activeMap);
        marker.bindPopup(`<b>Anschuss · ${escapeHtml(item.species)}</b><br>${formatDate(item.createdAt)}`);
        activeMapLayers.push(marker);
      }
    }
  }

  function markerIcon(meta) {
    return L.divIcon({ className: '', html: `<div class="map-marker" style="background:${meta.color}"><span>${meta.emoji}</span></div>`, iconSize: [36,36], iconAnchor: [18,32], popupAnchor: [0,-30] });
  }

  function openNewMapPointModal() {
    const options = Object.entries(CATEGORY_META).map(([key, meta]) => `<option value="${key}">${escapeHtml(meta.label)}</option>`).join('');
    openModal(`<h2 id="modalTitle">Neuen Kartenpunkt speichern</h2><p class="sub">${formatCoords(pendingMapPoint.latitude,pendingMapPoint.longitude)}</p><form id="mapPointForm" class="form"><div class="field"><label for="pointName">Name</label><input id="pointName" required placeholder="z. B. Hochsitz Waldkante"></div><div class="field"><label for="pointCategory">Kategorie</label><select id="pointCategory">${options}</select></div><div class="field"><label for="pointNote">Notiz</label><textarea id="pointNote"></textarea></div><div class="actions"><button class="primary" type="submit">Speichern</button><button class="secondary" type="button" data-modal-close>Abbrechen</button></div></form>`);
    document.getElementById('mapPointForm').addEventListener('submit', event => {
      event.preventDefault();
      state.mapPoints.push({ id: id('point'), createdAt: new Date().toISOString(), name: document.getElementById('pointName').value.trim(), category: document.getElementById('pointCategory').value, note: document.getElementById('pointNote').value.trim(), ...pendingMapPoint });
      saveState(); pendingMapPoint = null; closeModal(); toast('Kartenpunkt gespeichert'); render();
    });
  }

  async function locateMap() {
    const coords = await captureGps('map');
    if (!coords || !activeMap) return;
    activeMap.setView([coords.latitude,coords.longitude], 16);
    L.circleMarker([coords.latitude,coords.longitude], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#5aa8ff', fillOpacity: 1 }).addTo(activeMap).bindPopup('Mein Standort').openPopup();
  }

  async function refreshWeather(useMapCenter = false) {
    let coords;
    if (useMapCenter) coords = { latitude: state.mapCenter.lat, longitude: state.mapCenter.lng };
    else coords = await captureGps('weather');
    if (!coords) { toast('Kein Standort verfügbar'); return; }
    const content = document.getElementById('weatherContent');
    content.innerHTML = '<div class="notice">Wetterdaten werden geladen …</div>';
    try {
      const params = new URLSearchParams({
        latitude: coords.latitude,
        longitude: coords.longitude,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover',
        daily: 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
        timezone: 'auto', forecast_days: '3', wind_speed_unit: 'kmh'
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.weatherCache = { data, fetchedAt: new Date().toISOString(), latitude: Number(coords.latitude), longitude: Number(coords.longitude) };
      saveState(); content.innerHTML = renderWeather(state.weatherCache); toast('Wetter aktualisiert');
    } catch (error) {
      console.error(error);
      content.innerHTML = state.weatherCache ? `${renderWeather(state.weatherCache)}<div class="warning-box" style="margin-top:10px">Aktualisierung fehlgeschlagen. Es werden die letzten gespeicherten Daten angezeigt.</div>` : '<div class="danger-box">Wetter konnte nicht geladen werden. Internetverbindung prüfen.</div>';
    }
  }

  function calculateRecommendation(data) {
    const times = data.hourly?.time || [];
    const sunrise = data.daily?.sunrise?.[0] ? new Date(data.daily.sunrise[0]) : null;
    const sunset = data.daily?.sunset?.[0] ? new Date(data.daily.sunset[0]) : null;
    const now = new Date();
    let best = { score: 0, index: 0 };
    times.forEach((value, index) => {
      const time = new Date(value);
      if (time < now || time > new Date(now.getTime()+18*3600000)) return;
      const wind = Number(data.hourly.wind_speed_10m[index] || 0);
      const rain = Number(data.hourly.precipitation_probability[index] || 0);
      const cloud = Number(data.hourly.cloud_cover[index] || 0);
      let score = 48;
      score += wind >= 2 && wind <= 14 ? 20 : wind <= 22 ? 8 : -15;
      score += rain <= 20 ? 15 : rain <= 50 ? 4 : -18;
      score += cloud >= 25 && cloud <= 85 ? 8 : 2;
      if (sunrise) score += Math.max(0, 14 - Math.abs(time-sunrise)/3600000*6);
      if (sunset) score += Math.max(0, 18 - Math.abs(time-sunset)/3600000*8);
      score = Math.max(15,Math.min(95,Math.round(score)));
      if (score > best.score) best = { score, index };
    });
    const bestTime = times[best.index] ? new Date(times[best.index]).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'}) : 'heute';
    const wind = Math.round(data.hourly?.wind_speed_10m?.[best.index] || 0);
    const rain = Math.round(data.hourly?.precipitation_probability?.[best.index] || 0);
    return { score: best.score || 50, label: `beste Phase etwa ${bestTime}`, reason: `Wind ungefähr ${wind} km/h und Niederschlagsrisiko ${rain} %. Dämmerungsnähe und Bewölkung wurden mitbewertet.` };
  }

  function getCachedRecommendation() {
    if (!state.weatherCache?.data) return null;
    return calculateRecommendation(state.weatherCache.data);
  }

  function weatherCodeText(code) {
    const map = { 0:'klar',1:'überwiegend klar',2:'teilweise bewölkt',3:'bedeckt',45:'Nebel',48:'Reifnebel',51:'leichter Nieselregen',53:'Nieselregen',55:'starker Nieselregen',61:'leichter Regen',63:'Regen',65:'starker Regen',71:'leichter Schneefall',73:'Schneefall',75:'starker Schneefall',80:'Regenschauer',81:'Regenschauer',82:'starke Schauer',95:'Gewitter',96:'Gewitter mit Hagel',99:'starkes Gewitter' };
    return map[code] || 'Wetterlage';
  }

  function degreesToCompass(degrees) {
    if (!Number.isFinite(Number(degrees))) return '–';
    const names = ['N','NO','O','SO','S','SW','W','NW'];
    return `${names[Math.round(Number(degrees)/45)%8]} ${Math.round(Number(degrees))}°`;
  }

  function handleAction(action, button) {
    const entityId = button.dataset.id;
    const handlers = {
      'open-observation': () => openObservation(entityId),
      'delete-observation': () => deleteObservation(entityId),
      'use-last-map-location': () => useMapCenterForObservation(),
      'locate-map': locateMap,
      'toggle-map-layer': () => { state.mapLayer = state.mapLayer === 'topo' ? 'street' : 'topo'; saveState(); render(); },
      'start-add-point': () => {},
      'open-map-point': () => openMapPoint(entityId),
      'delete-map-point': () => deleteMapPoint(entityId),
      'new-profile': openNewProfile,
      'open-profile': () => openProfile(entityId),
      'delete-profile': () => deleteProfile(entityId),
      'refresh-weather': () => refreshWeather(false),
      'weather-map-center': () => refreshWeather(true),
      'track-shooter-gps': () => captureTrackingLocation('shooter'),
      'track-impact-gps': () => captureTrackingLocation('impact'),
      'open-tracking': () => openTracking(entityId),
      'delete-tracking': () => deleteTracking(entityId),
      'share-tracking': () => shareTracking(entityId),
      'open-analysis': () => openAnalysis(entityId),
      'delete-analysis': () => deleteAnalysis(entityId),
      'open-trophy': () => openTrophy(entityId),
      'delete-trophy': () => deleteTrophy(entityId),
      'export-data': exportData,
      'test-ai-backend': testAiBackend,
      'clear-all-data': clearAllData
    };
    handlers[action]?.();
  }

  async function testAiBackend() {
    const input = document.getElementById('settingsAiBackend');
    const backend = String(input?.value || normalizedBackendUrl()).trim().replace(/\/+$/, '');
    if (!backend) { toast('Bitte zuerst die KI-Server-URL eintragen'); return; }
    toast('KI-Verbindung wird geprüft …');
    try {
      const response = await fetch(`${backend}/health`, { method: 'GET' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Serverfehler ${response.status}`);
      toast(data.openaiConfigured ? 'KI-Server ist bereit' : 'Server erreichbar, OpenAI-Schlüssel fehlt');
    } catch (error) {
      console.error(error);
      toast(`KI-Server nicht erreichbar: ${error.message}`);
    }
  }

  function useMapCenterForObservation() {
    const element = document.getElementById('observationLocation');
    const coords = { latitude: state.mapCenter.lat, longitude: state.mapCenter.lng, accuracy: null };
    element.dataset.coords = JSON.stringify(coords);
    element.innerHTML = `<b>Kartenmitte verwendet</b><br>${formatCoords(coords.latitude,coords.longitude)}`;
    toast('Kartenposition übernommen');
  }

  async function openObservation(observationId) {
    const item = state.observations.find(o => o.id === observationId); if (!item) return;
    const profile = state.profiles.find(p => p.id === item.profileId);
    openModal(`<h2 id="modalTitle">${escapeHtml(item.species)} · Beobachtung</h2><div id="modalMedia"></div><div class="notice">${formatDate(item.createdAt)}<br>${formatCoords(item.latitude,item.longitude)}</div><p><b>Geschlecht:</b> ${escapeHtml(item.sex || 'unbestimmt')}<br><b>Anzahl:</b> ${item.count}<br><b>Entfernung:</b> ${escapeHtml(item.distance || '–')}<br><b>Verhalten:</b> ${escapeHtml(item.behavior || '–')}<br><b>Tierprofil:</b> ${escapeHtml(profile?.name || 'nicht zugeordnet')}</p><p>${escapeHtml(item.note || 'Keine Notiz')}</p><div class="actions"><button class="danger-button" data-action="delete-observation" data-id="${item.id}">Löschen</button><button class="secondary" data-modal-close>Schließen</button></div>`);
    await insertModalMedia(item.photoId);
  }

  function deleteObservation(observationId) {
    const item = state.observations.find(o=>o.id===observationId); if(!item) return;
    if (!confirm('Diese Beobachtung wirklich löschen?')) return;
    state.observations = state.observations.filter(o=>o.id!==observationId); saveState(); if(item.photoId) deleteMedia(item.photoId); closeModal(); toast('Beobachtung gelöscht'); render();
  }

  function openMapPoint(pointId) {
    const point = state.mapPoints.find(p=>p.id===pointId); if(!point) return; const meta=CATEGORY_META[point.category]||CATEGORY_META.other;
    openModal(`<h2 id="modalTitle">${escapeHtml(point.name)}</h2><div class="notice">${escapeHtml(meta.label)}<br>${formatCoords(point.latitude,point.longitude)}</div><p>${escapeHtml(point.note||'Keine Notiz')}</p><div class="actions"><button class="danger-button" data-action="delete-map-point" data-id="${point.id}">Löschen</button><button class="secondary" data-modal-close>Schließen</button></div>`);
  }

  function deleteMapPoint(pointId) { if(!confirm('Kartenpunkt löschen?')) return; state.mapPoints=state.mapPoints.filter(p=>p.id!==pointId); saveState(); closeModal(); toast('Kartenpunkt gelöscht'); render(); }

  function openNewProfile() {
    openModal(`<h2 id="modalTitle">Neues Tierprofil</h2><form id="profileForm" class="form"><div class="field"><label for="profileName">Name/Kennnummer</label><input id="profileName" required placeholder="Bock 07"></div><div class="form-row"><div class="field"><label for="profileSpecies">Wildart</label><select id="profileSpecies"><option>Rehwild</option><option>Rotwild</option><option>Gamswild</option></select></div><div class="field"><label for="profileSex">Geschlecht</label><select id="profileSex"><option>männlich</option><option>weiblich</option><option>unbestimmt</option></select></div></div><div class="field"><label for="profileAge">Altersschätzung</label><input id="profileAge" placeholder="z. B. 4–5 Jahre"></div><div class="field"><label for="profileStatus">Status</label><select id="profileStatus"><option>beobachten</option><option>schonen</option><option>freigegeben</option><option>erlegt</option></select></div><div class="field"><label for="profileNotes">Merkmale/Notizen</label><textarea id="profileNotes"></textarea></div><div class="actions"><button class="primary" type="submit">Speichern</button><button class="secondary" type="button" data-modal-close>Abbrechen</button></div></form>`);
    document.getElementById('profileForm').addEventListener('submit', event=>{event.preventDefault(); state.profiles.push({id:id('profile'),createdAt:new Date().toISOString(),name:document.getElementById('profileName').value.trim(),species:document.getElementById('profileSpecies').value,sex:document.getElementById('profileSex').value,age:document.getElementById('profileAge').value.trim(),status:document.getElementById('profileStatus').value,notes:document.getElementById('profileNotes').value.trim(),aiEmbeddings:[]}); saveState(); closeModal(); toast('Tierprofil gespeichert'); render();});
  }

  function openProfile(profileId) {
    const p=state.profiles.find(x=>x.id===profileId); if(!p)return; const obs=state.observations.filter(o=>o.profileId===p.id);
    const refs = Array.isArray(p.aiEmbeddings) ? p.aiEmbeddings.length : 0;
    openModal(`<h2 id="modalTitle">${escapeHtml(p.name)}</h2><div class="notice">${escapeHtml(p.species)} · ${escapeHtml(p.sex)} · ${escapeHtml(p.age||'Alter offen')}</div><div class="stats" style="margin:12px 0"><div class="stat"><strong>${obs.length}</strong><small>Beobachtungen</small></div><div class="stat"><strong>${refs}</strong><small>KI-Lernbilder</small></div><div class="stat"><strong>${escapeHtml(p.status||'–')}</strong><small>Status</small></div></div><p>${escapeHtml(p.notes||'Keine Merkmale notiert')}</p><div class="notice">Für eine stabilere Wiedererkennung sollten pro Tier mehrere scharfe Referenzfotos aus ähnlichen Blickwinkeln bestätigt werden.</div><h3 style="margin-top:14px">Beobachtungen (${obs.length})</h3>${obs.length?`<div class="list">${obs.map(observationRow).join('')}</div>`:'<div class="empty">Noch keine Beobachtung zugeordnet.</div>'}<div class="actions" style="margin-top:14px"><button class="danger-button" data-action="delete-profile" data-id="${p.id}">Profil löschen</button><button class="secondary" data-modal-close>Schließen</button></div>`);
    hydrateMediaThumbnails(modalContent);
  }

  function deleteProfile(profileId) { if(!confirm('Tierprofil löschen? Beobachtungen bleiben erhalten.'))return; state.profiles=state.profiles.filter(p=>p.id!==profileId); state.observations.forEach(o=>{if(o.profileId===profileId)o.profileId=null;}); saveState(); closeModal(); toast('Tierprofil gelöscht'); render(); }

  function trackingProtocol(item) {
    return `REVIERAI NACHSUCHEPROTOKOLL\n\nWildart: ${item.species}\nErfasst: ${formatDate(item.createdAt)}\nSchusszeit: ${item.shotTime || '–'}\nSchussentfernung: ${item.distance || '–'}\nFluchtrichtung: ${item.direction || '–'}\nPirschzeichen: ${(item.signs||[]).join(', ') || 'keine angegeben'}\nSchützenstand: ${item.locations?.shooter ? formatCoords(item.locations.shooter.latitude,item.locations.shooter.longitude) : '–'}\nAnschuss: ${item.locations?.impact ? formatCoords(item.locations.impact.latitude,item.locations.impact.longitude) : '–'}\nNotizen: ${item.notes || '–'}\n\nHinweis: Dokumentation ersetzt keinen erfahrenen Hundeführer.`;
  }

  async function openTracking(caseId) { const item=state.trackingCases.find(x=>x.id===caseId); if(!item)return; openModal(`<h2 id="modalTitle">Nachsuche · ${escapeHtml(item.species)}</h2><div id="modalMedia"></div><pre class="protocol">${escapeHtml(trackingProtocol(item))}</pre><div class="actions"><button class="primary" data-action="share-tracking" data-id="${item.id}">Teilen</button><button class="danger-button" data-action="delete-tracking" data-id="${item.id}">Löschen</button><button class="secondary" data-modal-close>Schließen</button></div>`); await insertModalMedia(item.photoId); }
  function deleteTracking(caseId){const item=state.trackingCases.find(x=>x.id===caseId);if(!item)return;if(!confirm('Nachsuchefall löschen?'))return;state.trackingCases=state.trackingCases.filter(x=>x.id!==caseId);saveState();if(item.photoId)deleteMedia(item.photoId);closeModal();toast('Nachsuchefall gelöscht');render();}
  async function shareTracking(caseId){const item=state.trackingCases.find(x=>x.id===caseId);if(!item)return;const text=trackingProtocol(item);try{if(navigator.share)await navigator.share({title:`Nachsuche ${item.species}`,text});else{await navigator.clipboard.writeText(text);toast('Protokoll kopiert');}}catch(error){if(error.name!=='AbortError')toast('Teilen nicht möglich');}}

  async function openAnalysis(itemId){
    const item=state.manualAnalyses.find(x=>x.id===itemId);if(!item)return;
    const ai=item.aiResult;
    const aiHtml=ai?`<div class="ai-panel"><div class="section-head"><h3>KI-Ergebnis</h3><span class="badge">${Math.round(ai.confidence||0)} %</span></div><p><b>Alter:</b> ${escapeHtml(ai.age_label||item.age||'–')}<br><b>Bildqualität:</b> ${escapeHtml(ai.image_quality||'–')}</p><p><b>Begründung:</b><br>${escapeHtml((ai.visible_features||[]).join(' · ')||'–')}</p><p><b>Grenzen:</b><br>${escapeHtml((ai.limitations||[]).join(' · ')||'–')}</p></div>`:'<div class="notice">Diese Bewertung wurde ohne Server-KI gespeichert.</div>';
    const match=item.reidMatch?`<div class="notice" style="margin-top:10px"><b>Tiervergleich:</b> ${escapeHtml(item.reidMatch.profileName)} · ${Math.round(item.reidMatch.confidence||0)} %</div>`:'';
    openModal(`<h2 id="modalTitle">KI-Wildanalyse</h2><div id="modalMedia"></div><div class="notice">${escapeHtml(item.species)} · ${escapeHtml(item.sex)} · ${escapeHtml(item.age||'Alter offen')}</div>${aiHtml}${match}<p><b>Merkmale:</b><br>${escapeHtml(item.trophy||'–')}</p><p><b>Gesundheit:</b><br>${escapeHtml(item.health||'–')}</p><div class="actions"><button class="danger-button" data-action="delete-analysis" data-id="${item.id}">Löschen</button><button class="secondary" data-modal-close>Schließen</button></div>`);
    await insertModalMedia(item.photoId);
  }
  function deleteAnalysis(itemId){const item=state.manualAnalyses.find(x=>x.id===itemId);if(!item)return;if(!confirm('Bewertung löschen?'))return;state.manualAnalyses=state.manualAnalyses.filter(x=>x.id!==itemId);saveState();if(item.photoId)deleteMedia(item.photoId);closeModal();toast('Bewertung gelöscht');render();}

  function openTrophy(recordId){const r=state.trophyRecords.find(x=>x.id===recordId);if(!r)return;openModal(`<h2 id="modalTitle">${escapeHtml(r.code||r.species)}</h2><div class="notice">${escapeHtml(r.species)} · ${escapeHtml(r.age||'Alter offen')}</div><p><b>Messwerte:</b><br>${escapeHtml(r.measurements||'–')}</p><p><b>Notizen:</b><br>${escapeHtml(r.notes||'–')}</p><div class="actions"><button class="danger-button" data-action="delete-trophy" data-id="${r.id}">Löschen</button><button class="secondary" data-modal-close>Schließen</button></div>`);}
  function deleteTrophy(recordId){if(!confirm('Trophäenakte löschen?'))return;state.trophyRecords=state.trophyRecords.filter(x=>x.id!==recordId);saveState();closeModal();toast('Trophäenakte gelöscht');render();}

  async function exportData() {
    const backup = { exportedAt: new Date().toISOString(), appVersion: APP_VERSION, state };
    const filename = `RevierAI_Backup_${new Date().toISOString().slice(0,10)}.json`;
    const file = new File([JSON.stringify(backup, null, 2)], filename, { type: 'application/json' });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'RevierAI Backup', files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast('Backup erstellt');
    } catch (error) {
      if (error.name !== 'AbortError') toast('Backup konnte nicht geteilt werden');
    }
  }

  function clearAllData(){if(!confirm('Wirklich alle lokalen Daten und Fotos löschen?'))return;Object.assign(state,defaultState());saveState();indexedDB.deleteDatabase(MEDIA_DB);toast('Alle lokalen Daten gelöscht');navigate('home');}

  function openMediaDb() {
    return new Promise((resolve,reject)=>{const request=indexedDB.open(MEDIA_DB,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  }
  async function putMedia(mediaId,file,kind){const db=await openMediaDb();return new Promise((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put({id:mediaId,kind,name:file.name,type:file.type,blob:file,createdAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function getMedia(mediaId){if(!mediaId)return null;const db=await openMediaDb();return new Promise((resolve,reject)=>{const tx=db.transaction('media','readonly');const request=tx.objectStore('media').get(mediaId);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
  async function deleteMedia(mediaId){const db=await openMediaDb();return new Promise((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').delete(mediaId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

  async function hydrateMediaThumbnails(root=document) {
    const elements=[...root.querySelectorAll('[data-media-thumb]')].filter(el=>el.dataset.mediaThumb);
    for(const element of elements){try{const media=await getMedia(element.dataset.mediaThumb);if(!media?.blob)continue;const img=document.createElement('img');img.src=URL.createObjectURL(media.blob);img.alt='Foto';element.innerHTML='';element.appendChild(img);}catch(error){console.error(error);}}
  }

  async function insertModalMedia(mediaId){const host=document.getElementById('modalMedia');if(!host||!mediaId)return;const media=await getMedia(mediaId);if(!media?.blob)return;const url=URL.createObjectURL(media.blob);host.innerHTML=`<img src="${url}" alt="Gespeichertes Foto" style="width:100%;max-height:330px;object-fit:cover;border-radius:17px;margin-bottom:12px">`;}

  document.addEventListener('click', event => {
    const routeTarget=event.target.closest('[data-route]');
    if(routeTarget && !view.contains(routeTarget)){navigate(routeTarget.dataset.route);}
    const closeTarget=event.target.closest('[data-modal-close]');if(closeTarget)closeModal();
    const actionTarget=event.target.closest('[data-action]');if(actionTarget && modal.contains(actionTarget))handleAction(actionTarget.dataset.action,actionTarget);
  });
  document.querySelectorAll('.bottom-nav [data-route], .topbar [data-route]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.route)));
  document.getElementById('quickAddButton').addEventListener('click',()=>navigate('observe'));
  window.addEventListener('online',()=>{setNetworkStatus();toast('Verbindung wiederhergestellt');});
  window.addEventListener('offline',()=>{setNetworkStatus();toast('Offline-Modus: lokale Funktionen bleiben verfügbar');});
  setNetworkStatus();
  render();
})();
