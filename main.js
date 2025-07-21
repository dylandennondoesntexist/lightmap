document.addEventListener('DOMContentLoaded', function() {
  // --- Firebase Setup ---
  if (typeof window.firebaseConfig === 'undefined') {
    showModal('Error', 'Firebase configuration is missing. Please check config.js.');
    return;
  }
  firebase.initializeApp(window.firebaseConfig);
  const db = firebase.database();

  // --- D3 Map Setup ---
  const svg = d3.select("#map");
  const mapLayer = svg.append("g").attr("id", "map-layer");
  const dotLayer = svg.append("g").attr("id", "dot-layer");
  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath().projection(projection);
  let worldData;

  // --- Geohashing ---
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  function geohash(lat, lng, precision = 6) {
    let latRange = [-90, 90], lngRange = [-180, 180], hash = "", bit = 0, ch = 0, isEven = true;
    while (hash.length < precision) {
      const mid = isEven ? (lngRange[0] + lngRange[1]) / 2 : (latRange[0] + latRange[1]) / 2;
      if (isEven) {
        if (lng >= mid) { ch |= (1 << (4 - bit)); lngRange[0] = mid; } else { lngRange[1] = mid; }
      } else {
        if (lat >= mid) { ch |= (1 << (4 - bit)); latRange[0] = mid; } else { latRange[1] = mid; }
      }
      isEven = !isEven;
      if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
    }
    return hash;
  }
  function decodeGeohash(hash) {
    let latRange = [-90, 90], lngRange = [-180, 180], isEven = true;
    for (let i = 0; i < hash.length; i++) {
      const ch = BASE32.indexOf(hash[i]);
      for (let bit = 4; bit >= 0; bit--) {
        const mid = isEven ? (lngRange[0] + lngRange[1]) / 2 : (latRange[0] + latRange[1]) / 2;
        if (isEven) {
          if (ch & (1 << bit)) { lngRange[0] = mid; } else { lngRange[1] = mid; }
        } else {
          if (ch & (1 << bit)) { latRange[0] = mid; } else { latRange[1] = mid; }
        }
        isEven = !isEven;
      }
    }
    return { lat: (latRange[0] + latRange[1]) / 2, lng: (lngRange[0] + lngRange[1]) / 2 };
  }

  // --- Modal Logic ---
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalMessage = document.getElementById('modalMessage');
  const modalClose = document.getElementById('modalClose');
  function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    modal.classList.add('visible');
    modalClose.focus();
  }
  function hideModal() { modal.classList.remove('visible'); }
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target === modalClose) hideModal();
  });

  // --- Core Application Logic ---
  const colors = ["#e6194b", "#3cb44b", "#4363d8", "#911eb4"];
  let lastMessageTime = 0;
  const MESSAGE_COOLDOWN = 5000;
  const buttons = Array.from(document.querySelectorAll('.buttons button'));
  function setButtonsDisabled(disabled) {
    buttons.forEach(btn => btn.disabled = disabled);
  }
  function sendMessage(colorIndex) {
    const now = Date.now();
    if (now - lastMessageTime < MESSAGE_COOLDOWN) {
      showModal('Cooldown', `Please wait ${Math.ceil((MESSAGE_COOLDOWN - (now - lastMessageTime)) / 1000)} seconds.`);
      return;
    }
    if (!navigator.geolocation) {
      showModal('Error', "Geolocation is not supported by your browser.");
      return;
    }
    setButtonsDisabled(true);
    navigator.geolocation.getCurrentPosition(position => {
      lastMessageTime = now;
      const { latitude, longitude } = position.coords;
      const timestamp = Date.now();
      const hash = geohash(latitude, longitude, 6);
      db.ref("messages").push({ geohash: hash, color: colors[colorIndex], timestamp })
        .then(() => setButtonsDisabled(false))
        .catch(error => { showFirebaseError(error); setButtonsDisabled(false); });
    }, geoError => {
      let msg = "Location access denied. Please enable location services.";
      if (geoError && geoError.code === 1) msg = "Location access denied by user. Please enable location permissions in your browser settings.";
      else if (geoError && geoError.code === 2) msg = "Location unavailable. Please check your device's location settings.";
      else if (geoError && geoError.code === 3) msg = "Location request timed out. Please try again.";
      showModal('Error', msg);
      setButtonsDisabled(false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }

  // --- Efficient Map Rendering ---
  let cachedColors = {};
  function cacheMapColors() {
    const style = getComputedStyle(document.documentElement);
    cachedColors = {
      land: style.getPropertyValue('--land'),
      border: style.getPropertyValue('--border'),
      sea: style.getPropertyValue('--sea')
    };
  }
  function setupAndRenderMap() {
    if (!worldData) return;
    cacheMapColors();
    const width = window.innerWidth, height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
    projection.fitSize([width - 20, height - 20], worldData)
      .translate([width / 2, height / 2 + 8]);
    path.projection(projection);
    mapLayer.selectAll("path")
      .data(worldData.features)
      .join(
        enter => enter.append("path")
          .attr("fill", cachedColors.land)
          .attr("stroke", cachedColors.border)
          .attr("d", path),
        update => update
          .attr("fill", cachedColors.land)
          .attr("stroke", cachedColors.border)
          .attr("d", path),
        exit => exit.remove()
      );
    mapLayer.style("background-color", cachedColors.sea);
  }

  // --- Dot Rendering (optimized) ---
  function drawDot(data) {
    const { geohash: hash, color, timestamp } = data;
    if (!hash || !color || !timestamp) return;
    if (Date.now() - timestamp > 10000) return;
    const coords = decodeGeohash(hash);
    const projected = projection([coords.lng, coords.lat]);
    if (!projected || isNaN(projected[0]) || isNaN(projected[1])) return;
    dotLayer.append("circle")
      .attr("cx", projected[0])
      .attr("cy", projected[1])
      .attr("r", 0)
      .attr("fill", color)
      .attr("fill-opacity", 0)
      .transition()
      .duration(3000)
      .attr("r", 4)
      .attr("fill-opacity", 0.8)
      .transition()
      .duration(7000)
      .attr("r", 0)
      .attr("fill-opacity", 0)
      .remove();
  }

  // --- Event Listeners and Initializers ---
  document.querySelector('.buttons').addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
      const idx = buttons.indexOf(e.target);
      if (idx >= 0 && idx < colors.length) sendMessage(idx);
    }
  });

  // --- Theme Logic (optimized) ---
  const toggleThemeButton = document.getElementById('toggleTheme');
  const sunSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><g><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></g></svg>`;
  const moonSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>`;
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    toggleThemeButton.innerHTML = theme === "dark" ? sunSVG : moonSVG;
    localStorage.setItem("theme", theme);
    setupAndRenderMap();
  }
  toggleThemeButton.addEventListener('click', () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
  applyTheme(localStorage.getItem("theme") || (window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light"));

  // --- Firebase message listener ---
  try {
    db.ref("messages").orderByChild("timestamp").limitToLast(200).on("child_added", snapshot => {
      drawDot(snapshot.val());
    }, showFirebaseError);
  } catch (err) { showFirebaseError(err); }

  // --- Map load ---
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then(geoData => {
    worldData = topojson.feature(geoData, geoData.objects.countries);
    setupAndRenderMap();
  }).catch(err => {
    let msg = "Could not load map data from the server.<br><br>";
    if (err && err.message) msg += `<b>Error:</b> ${err.message}<br>`;
    msg += "Please check your internet connection and refresh the page.";
    showModal('Network Error', msg);
  });

  // --- Debounced window resize ---
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(setupAndRenderMap, 150);
  });

  // --- Hamburger menu logic (optimized) ---
  const hamburger = document.getElementById('hamburgerMenu');
  const menuDropdown = document.getElementById('menuDropdown');
  const aboutMenu = document.getElementById('aboutMenu');
  const privacyMenu = document.getElementById('privacyMenu');
  const menuItems = [aboutMenu, privacyMenu];
  function closeMenuDropdown() {
    menuDropdown.classList.remove('visible');
    menuItems.forEach(item => item.setAttribute('tabindex', '-1'));
    hamburger.focus();
  }
  function openMenuDropdown() {
    menuDropdown.classList.add('visible');
    menuItems.forEach(item => item.setAttribute('tabindex', '0'));
    menuItems[0].focus();
  }
  function handleMenuKeydown(e) {
    const idx = menuItems.indexOf(document.activeElement);
    if (["Enter", " ", "ArrowDown"].includes(e.key) && e.target === hamburger) {
      e.preventDefault(); openMenuDropdown();
    } else if (e.target.parentNode === menuDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault(); menuItems[(idx + 1) % menuItems.length].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); menuItems[(idx - 1 + menuItems.length) % menuItems.length].focus();
      } else if (e.key === "Escape") {
        closeMenuDropdown();
      }
    }
  }
  hamburger.addEventListener('click', e => {
    e.stopPropagation();
    menuDropdown.classList.contains('visible') ? closeMenuDropdown() : openMenuDropdown();
  });
  hamburger.addEventListener('keydown', handleMenuKeydown);
  menuDropdown.addEventListener('keydown', handleMenuKeydown);
  document.addEventListener('click', e => {
    if (!menuDropdown.contains(e.target) && e.target !== hamburger) closeMenuDropdown();
  });
  aboutMenu.addEventListener('click', () => {
    closeMenuDropdown();
    showModal('About', "Inspired by Ho'oponopono.");
  });
  privacyMenu.addEventListener('click', () => {
    closeMenuDropdown();
    showModal('Privacy', `
      Your location is converted to an approximate 6-character geohash and sent anonymously.<br><br>
      <b>What we store:</b> Only your chosen message color and approximate geohashed location.<br>
      <b>What we do <u>not</u> store:</b> No precise coordinates, personal information, device IDs, or IP addresses.<br><br>
      <b>No analytics or tracking services are used.</b>
    `);
  });

  // --- Modal: close with Esc key ---
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) hideModal();
  });

  // --- Error handling ---
  function showFirebaseError(error) {
    let msg = "A network or server error occurred. ";
    if (error && error.code) {
      msg += `<br><br><b>Firebase error:</b> ${error.code}`;
      if (error.message) msg += `<br>${error.message}`;
    } else if (typeof error === "string") {
      msg += `<br>${error}`;
    }
    msg += "<br><br>Please check your internet connection and try again.";
    showModal("Connection Error", msg);
  }
});