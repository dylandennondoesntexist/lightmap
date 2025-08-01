// Import Firebase modular functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, query, orderByChild, limitToLast, serverTimestamp, onValue, get, startAt } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Import config as a module
import { firebaseConfig } from "./config.js";

// --- Wrap all logic in a DOMContentLoaded listener ---
document.addEventListener('DOMContentLoaded', () => {

  // --- Configuration Constants ---
  const CONFIG = {
    DOT_LIFESPAN: 10000,
    FADE_IN_DURATION: 2000,
    FADE_OUT_DURATION: 5000,
    MESSAGE_COOLDOWN_DEFAULT: 5000,
    MESSAGE_COOLDOWN_INITIAL: 100,
    INITIAL_PRESS_LIMIT: 20,
    GEOLOCATION_TIMEOUT: 10000,
    RESIZE_DEBOUNCE: 150,
    UNLOCK_COUNT: 1, // How many clicks per button to unlock
    PERMANENT_DOT_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 hours
  };

  // --- Local Storage Keys ---
  const KEYS = {
    BUTTON_COUNTS: 'ephemeralButtonCounts',
    HERE_FOR_YOU_PRESSED: 'ephemeralhereForYouPressed',
    TOTAL_PRESSES: 'ephemeralTotalPresses'
  };

  // --- Utility Functions ---
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // --- App Initialization ---
  if (!firebaseConfig) {
    showModal('Error', 'Firebase configuration is missing or invalid in config.js.');
    throw new Error("Firebase config not found.");
  }

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  let serverTimeOffset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    serverTimeOffset = snap.val() || 0;
  });

  // --- D3 Map Setup ---
  const svg = d3.select("#map");
  const mapLayer = svg.append("g").attr("id", "map-layer");
  const permanentDotLayer = svg.append("g").attr("id", "permanent-dot-layer");
  const dotLayer = svg.append("g").attr("id", "dot-layer");
  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath().projection(projection);
  let worldData;
  let activeDots = [];

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
        if (isEven) {
          const mid = (lngRange[0] + lngRange[1]) / 2;
          if (ch & (1 << bit)) { lngRange[0] = mid; } else { lngRange[1] = mid; }
        } else {
          const mid = (latRange[0] + latRange[1]) / 2;
          if (ch & (1 << bit)) { latRange[0] = mid; } else { latRange[1] = mid; } 
        }
        isEven = !isEven;
      }
    }
    return { lat: (latRange[0] + latRange[1]) / 2, lng: (lngRange[0] + lngRange[1]) / 2 };
  }

  // --- Map Rendering ---
  function setupAndRenderMap() {
    if (!worldData) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr("width", width).attr("height", height);
    projection.fitSize([width, height], worldData);
    path.projection(projection);

    mapLayer.style("background-color", getComputedStyle(document.documentElement).getPropertyValue('--sea'));
    mapLayer.selectAll("path").data(worldData.features)
      .join("path")
      .attr("fill", getComputedStyle(document.documentElement).getPropertyValue('--land'))
      .attr("stroke", getComputedStyle(document.documentElement).getPropertyValue('--border'))
      .attr("d", path);
    
    activeDots.forEach(dot => {
      const [x, y] = projection([dot.lng, dot.lat]);
      d3.select(`#dot-${dot.id}`).attr("cx", x).attr("cy", y);
    });
    permanentDotLayer.selectAll("circle").each(function(d) {
        const [x, y] = projection([d.lng, d.lat]);
        d3.select(this).attr("cx", x).attr("cy", y);
    });
  }

  // --- Core Application Logic ---
  const colors = ["#AA4499", "#EEAA77", "#44AA99", "#332288"];
  let lastMessageTime = 0;

  function sendMessage(colorIndex, button) {
    const now = Date.now();
    const totalPresses = parseInt(localStorage.getItem(KEYS.TOTAL_PRESSES) || '0', 10);
    const currentCooldown = totalPresses < CONFIG.INITIAL_PRESS_LIMIT ? CONFIG.MESSAGE_COOLDOWN_INITIAL : CONFIG.MESSAGE_COOLDOWN_DEFAULT;

    if (now - lastMessageTime < currentCooldown) {
      const timeLeft = Math.ceil((currentCooldown - (now - lastMessageTime)) / 1000);
      const unit = timeLeft === 1 ? "second" : "seconds";
      showModal('Cooldown', `Please wait ${timeLeft} ${unit}.`);
      return;
    }
    if (!navigator.geolocation) {
      showModal('Error', "Geolocation is not supported by your browser.");
      return;
    }
    const buttons = document.querySelectorAll('.buttons button');
    buttons.forEach(btn => btn.disabled = true);
    
    const buttonText = button.querySelector('.button-text');
    const originalButtonText = buttonText.textContent;
    button.classList.add('loading');

    navigator.geolocation.getCurrentPosition(position => {
      lastMessageTime = now;
      const { latitude, longitude } = position.coords;
      const hash = geohash(latitude, longitude, 6);
      push(ref(db, 'messages'), {
        geohash: hash,
        color: colors[colorIndex],
        timestamp: serverTimestamp()
      }).then(() => {
        button.classList.remove('loading');
        buttonText.textContent = "Displayed!";
        incrementButtonClick(colorIndex);
        localStorage.setItem(KEYS.TOTAL_PRESSES, totalPresses + 1);
        setTimeout(() => {
          buttonText.textContent = originalButtonText;
          buttons.forEach(btn => btn.disabled = false);
          button.blur();
        }, 2000);
      }).catch(error => {
        showFirebaseError(error, "writing ephemeral message");
        button.classList.remove('loading');
        buttonText.textContent = originalButtonText;
        buttons.forEach(btn => btn.disabled = false);
      });
    }, error => {
      handleGeolocationError(error);
      button.classList.remove('loading');
      buttonText.textContent = originalButtonText;
      buttons.forEach(btn => btn.disabled = false);
    }, { enableHighAccuracy: false, timeout: CONFIG.GEOLOCATION_TIMEOUT, maximumAge: 20000 });
  }

  // --- Animation Render Loop for temporary dots ---
  function renderLoop() {
    const now = Date.now() + serverTimeOffset;
    const dotsToRemove = [];

    activeDots.forEach(dot => {
      const age = now - dot.timestamp; 
      const localAnimationAge = now - dot.localAnimationStartTime;

      const dotElement = d3.select(`#dot-${dot.id}`);
      if (age > CONFIG.DOT_LIFESPAN) {
        dotsToRemove.push(dot.id);
        dotElement.remove();
        return;
      }

      let opacity = 0.95;
      let radius = 4;

      if (localAnimationAge < CONFIG.FADE_IN_DURATION) {
        opacity = d3.easeCubicOut(localAnimationAge / CONFIG.FADE_IN_DURATION) * 0.95;
        radius = d3.easeCubicOut(localAnimationAge / CONFIG.FADE_IN_DURATION) * 4;
      }

      const fadeOutStartTime = CONFIG.DOT_LIFESPAN - CONFIG.FADE_OUT_DURATION;
      if (age > fadeOutStartTime) {
        const fadeOutProgress = (age - fadeOutStartTime) / CONFIG.FADE_OUT_DURATION;
        opacity = (1 - d3.easeCubicIn(fadeOutProgress)) * 0.95;
        radius = (1 - d3.easeCubicIn(fadeOutProgress)) * 4;
      }

      dotElement.attr("r", radius).attr("fill-opacity", opacity);
    });

    if (dotsToRemove.length > 0) {
      activeDots = activeDots.filter(d => !dotsToRemove.includes(d.id));
    }

    requestAnimationFrame(renderLoop);
  }

  function addNewDot(snapshot) {
    const { geohash: hash, color, timestamp, type } = snapshot.val();
    if (type === 'permanent') return;

    const id = snapshot.key;
    if (!hash || !color || !timestamp || !id || typeof timestamp !== 'number') {
      return;
    }
    if (Date.now() + serverTimeOffset - timestamp > CONFIG.DOT_LIFESPAN + 1000) {
      return;
    }
    if (activeDots.some(d => d.id === id)) {
      return;
    }
    const coords = decodeGeohash(hash);
    const [x, y] = projection([coords.lng, coords.lat]);
    if (isNaN(x) || isNaN(y)) {
      return;
    }
    const newDot = {
      id,
      lat: coords.lat,
      lng: coords.lng,
      timestamp,
      localAnimationStartTime: Date.now() + serverTimeOffset
    };
    activeDots.push(newDot);
    dotLayer.append("circle")
      .attr("id", `dot-${id}`)
      .attr("cx", x)
      .attr("cy", y)
      .attr("fill", color)
      .attr("r", 0)
      .attr("fill-opacity", 0);
  }

  // --- "Here For You" Feature Logic ---
  const hereForYouContainer = document.getElementById('hereForYouContainer');
  const hereForYouButton = document.getElementById('hereForYouButton');

  function getStartOfTodayLocal() {
    const now = new Date(); // Uses the user's local time
    now.setHours(0, 0, 0, 0); // Set to midnight this morning, local time
    return now.getTime();
  }

  function checkAndResetDailyData() {
    const todayLocalStart = getStartOfTodayLocal();
    const lastPressedData = JSON.parse(localStorage.getItem(KEYS.HERE_FOR_YOU_PRESSED));

    if (lastPressedData && lastPressedData.timestamp < todayLocalStart) {
      localStorage.removeItem(KEYS.BUTTON_COUNTS);
      localStorage.removeItem(KEYS.HERE_FOR_YOU_PRESSED);
      localStorage.removeItem(KEYS.TOTAL_PRESSES);
    }
  }
  
  function incrementButtonClick(index) {
    let counts = JSON.parse(localStorage.getItem(KEYS.BUTTON_COUNTS)) || [0, 0, 0, 0];
    counts[index]++;
    localStorage.setItem(KEYS.BUTTON_COUNTS, JSON.stringify(counts));
    checkIfUnlocked(counts);
  }

  function checkIfUnlocked(currentCounts) {
    const counts = currentCounts || JSON.parse(localStorage.getItem(KEYS.BUTTON_COUNTS)) || [0, 0, 0, 0];
    const lastPressedData = JSON.parse(localStorage.getItem(KEYS.HERE_FOR_YOU_PRESSED));
    const todayLocalStart = getStartOfTodayLocal();

    if(lastPressedData && lastPressedData.timestamp >= todayLocalStart) {
        return;
    }

    const unlocked = counts.every(count => count >= CONFIG.UNLOCK_COUNT);
    if (unlocked) {
      hereForYouContainer.classList.remove('hidden');
    }
  }

  hereForYouButton.addEventListener('click', () => {
    hereForYouButton.disabled = true;
    const buttonText = hereForYouButton.querySelector('.button-text');
    const originalButtonText = buttonText.textContent;
    hereForYouButton.classList.add('loading');

    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      const hash = geohash(latitude, longitude, 6);
      push(ref(db, 'permanent_messages'), {
        geohash: hash,
        timestamp: serverTimestamp(),
        type: 'permanent'
      }).then(() => {
        // Use local time for the daily reset check
        const pressData = { timestamp: new Date().getTime() };
        localStorage.setItem(KEYS.HERE_FOR_YOU_PRESSED, JSON.stringify(pressData));
        
        hereForYouButton.classList.remove('loading');
        buttonText.textContent = "Displayed!";

        setTimeout(() => {
          hereForYouContainer.classList.add('hidden');
          buttonText.textContent = originalButtonText;
          hereForYouButton.disabled = false;
        }, 2000);
      }).catch(error => {
        showFirebaseError(error, "writing permanent message");
        hereForYouButton.classList.remove('loading');
        buttonText.textContent = originalButtonText;
        hereForYouButton.disabled = false;
      });
    }, error => {
      handleGeolocationError(error);
      hereForYouButton.classList.remove('loading');
      buttonText.textContent = originalButtonText;
      hereForYouButton.disabled = false;
    }, { enableHighAccuracy: false, timeout: CONFIG.GEOLOCATION_TIMEOUT });
  });

  function listenForPermanentDots() {
    permanentDotLayer.selectAll("*").remove();
    const permanentMessagesRef = ref(db, 'permanent_messages');
    const cutoff = (Date.now() + serverTimeOffset) - CONFIG.PERMANENT_DOT_WINDOW_MS;
    
    const queryConstraints = [orderByChild('timestamp'), startAt(cutoff)];
    onChildAdded(query(permanentMessagesRef, ...queryConstraints), (snapshot) => {
        if (!snapshot.exists()) return;
        
        const data = snapshot.val();
        if (!data || !data.geohash) return;

        const dotId = `permanent-${snapshot.key}`;
        if (d3.select(`#${dotId}`).empty()) {
            const coords = decodeGeohash(data.geohash);
            const [x, y] = projection([coords.lng, coords.lat]);
            if (!isNaN(x) && !isNaN(y)) {
                permanentDotLayer.append("circle")
                    .attr("id", dotId)
                    .datum({lng: coords.lng, lat: coords.lat})
                    .attr("class", "dot-permanent")
                    .attr("cx", x)
                    .attr("cy", y)
                    .attr("r", 1.5);
            }
        }
    });
  }


  // --- Event Listeners and Initializers ---
  document.getElementById('msg-0').addEventListener('click', (event) => sendMessage(0, event.currentTarget));
  document.getElementById('msg-1').addEventListener('click', (event) => sendMessage(1, event.currentTarget));
  document.getElementById('msg-2').addEventListener('click', (event) => sendMessage(2, event.currentTarget));
  document.getElementById('msg-3').addEventListener('click', (event) => sendMessage(3, event.currentTarget));

  const messagesRef = ref(db, 'messages');
  const recentMessagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(300));
  onChildAdded(recentMessagesQuery, addNewDot);

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then(geoData => {
    worldData = topojson.feature(geoData, geoData.objects.countries);
    setupAndRenderMap();
    checkAndResetDailyData();
    checkIfUnlocked();
    listenForPermanentDots();
    renderLoop();
  }).catch(err => {
    console.error("Could not load map data:", err);
    showModal('Error', "Could not load map data. Please refresh the page.");
  });

  window.addEventListener("resize", debounce(setupAndRenderMap, CONFIG.RESIZE_DEBOUNCE));

  // --- UI Elements (Modal, Theme, Menu) ---
  const modal = document.getElementById('modal');
  const modalClose = document.getElementById('modalClose');
  const toggleThemeButton = document.getElementById('toggleTheme');
  const hamburger = document.getElementById('hamburgerMenu');
  const menuDropdown = document.getElementById('menuDropdown');
  const aboutMenu = document.getElementById('aboutMenu');

  function hideModal() {
    modal.classList.remove('visible');
  }
  modalClose.addEventListener('click', hideModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    setTimeout(setupAndRenderMap, 50); 
  }
  toggleThemeButton.addEventListener('click', () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  function closeMenuDropdown() {
    menuDropdown.style.display = 'none';
    hamburger.setAttribute('aria-expanded', 'false');
  }
  hamburger.addEventListener('click', () => {
    const isExpanded = hamburger.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      closeMenuDropdown();
    } else {
      menuDropdown.style.display = 'block';
      hamburger.setAttribute('aria-expanded', 'true');
      (menuDropdown.querySelector('.menu-item')).focus();
    }
  });

  function handleMenuKeydown(e) {
    if (e.key === 'Escape') return closeMenuDropdown();
    if (e.key === 'Tab' && document.activeElement === aboutMenu) {
        hamburger.focus();
        e.preventDefault();
    }
  }
  menuDropdown.addEventListener('keydown', handleMenuKeydown);
  document.addEventListener('click', e => {
    if (!menuDropdown.contains(e.target) && e.target !== hamburger) closeMenuDropdown();
  });
  
  aboutMenu.addEventListener('click', () => {
    closeMenuDropdown();
    showModal('About', "Inspired by Ho'oponopono & The Pitt. <br><br> Press a button to display a dot on the map.               Location is converted to an approximate 6-character geohash. No personal identifiers are stored or shared.");
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) hideModal();
  });

  function showModal(title, message) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    if (modal && modalTitle && modalMessage) {
      modalTitle.textContent = title;
      modalMessage.innerHTML = message;
      modal.classList.add('visible');
    }
  }

  function handleGeolocationError(error) {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        showModal('Location Blocked', "Your browser has blocked location access.<br><br>To display your dot on the map, please enable location in your browser or system settings.");
        break;
      case error.POSITION_UNAVAILABLE:
        showModal('Location Unavailable', "Your location could not be determined. Please ensure location services are enabled and you have a clear signal.");
        break;
      case error.TIMEOUT:
        showModal('Location Timeout', "Could not get your location in time. Please check your connection and try again.");
        break;
      default:
        showModal('Location Error', "An unknown error occurred while trying to get your location.");
        break;
    }
  }

  function showFirebaseError(error, context) {
    const userMessage = "An unexpected error occurred. Our team will work on a fix. Please try again later.";
    showModal('Error', userMessage);
    console.error(`Firebase Error (${context}):`, error);
  }

});