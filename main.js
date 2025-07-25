// Import Firebase modular functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Import config as a module
import { firebaseConfig } from "./config.js";

// --- Wrap all logic in a DOMContentLoaded listener ---
document.addEventListener('DOMContentLoaded', () => {

  // --- App Initialization ---
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

  if (!firebaseConfig) {
    showModal('Error', 'Firebase configuration is missing or invalid in config.js.');
    throw new Error("Firebase config not found.");
  }

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  // --- D3 Map Setup ---
  const svg = d3.select("#map");
  const mapLayer = svg.append("g").attr("id", "map-layer");
  const dotLayer = svg.append("g").attr("id", "dot-layer");
  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath().projection(projection);
  let worldData;
  // REMOVED: The activeDots array is no longer needed. D3 will manage state.

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

    // Redraw the map land and borders
    mapLayer.style("background-color", getComputedStyle(document.documentElement).getPropertyValue('--sea'));
    mapLayer.selectAll("path").data(worldData.features)
      .join("path") // Use .join for a standard enter/update/exit pattern
      .attr("fill", getComputedStyle(document.documentElement).getPropertyValue('--land'))
      .attr("stroke", getComputedStyle(document.documentElement).getPropertyValue('--border'))
      .attr("d", path);
    
    // --- OPTIMIZATION ---
    // Instead of removing and redrawing dots, simply update their positions.
    // We select all existing circles and recalculate their cx/cy attributes
    // based on the data we attached to them with .datum().
    dotLayer.selectAll("circle")
      .attr("cx", d => projection([d.lng, d.lat])[0])
      .attr("cy", d => projection([d.lng, d.lat])[1]);
  }

  // --- Core Application Logic ---
  const colors = ["#AA4499", "#EEAA77", "#44AA99", "#332288"];
  let lastMessageTime = 0;
  const MESSAGE_COOLDOWN = 5000; // 5 seconds

  function sendMessage(colorIndex, button) {
    const now = Date.now();
    if (now - lastMessageTime < MESSAGE_COOLDOWN) {
      const timeLeft = Math.ceil((MESSAGE_COOLDOWN - (now - lastMessageTime)) / 1000);
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
    navigator.geolocation.getCurrentPosition(position => {
      lastMessageTime = now;
      const { latitude, longitude } = position.coords;
      const timestamp = Date.now();
      const hash = geohash(latitude, longitude, 6);
      
      push(ref(db, 'messages'), {
        geohash: hash,
        color: colors[colorIndex],
        timestamp
      }).then(() => {
        const originalButtonText = button.textContent;
        button.textContent = "Displayed!";
        setTimeout(() => {
          button.textContent = originalButtonText;
          buttons.forEach(btn => btn.disabled = false);
        }, 2000);
      }).catch(error => {
        showFirebaseError(error);
        buttons.forEach(btn => btn.disabled = false);
      });
    }, error => {
      showModal('Error', "It's (likely) not you, it's us. Sometimes we have a hard time getting location, especially on mobile browsers. Please try again while we work on a fix and ensure you have location enabled.");
      buttons.forEach(btn => btn.disabled = false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 20000 });
  }

  function drawDot(data) {
    const { geohash: hash, color, timestamp } = data;
    if (!hash || !color || !timestamp) return;
    
    const DOT_LIFESPAN = 10000; // 10 seconds
    const now = Date.now();
    const age = now - timestamp;

    // Only draw dots that are still within their lifespan
    if (age > DOT_LIFESPAN) return; 

    const coords = decodeGeohash(hash);
    const [x, y] = projection([coords.lng, coords.lat]);
    if (isNaN(x) || isNaN(y)) return;

    // --- DATA BINDING ---
    // We bind the geographic coordinates directly to the new circle element.
    // This allows us to access it later during a resize event.
    const dot = dotLayer.append("circle")
      .datum({ lat: coords.lat, lng: coords.lng }) // Attach data to the element
      .attr("cx", x)
      .attr("cy", y)
      .attr("fill", color);

    // The entire animation lifecycle is defined here. It is self-contained
    // and will not be interrupted by resizes.
    dot.attr("r", 0)
      .attr("fill-opacity", 0)
      .transition().duration(3000).attr("r", 4).attr("fill-opacity", 0.8)
      .transition().delay(3000).duration(7000).attr("r", 0).attr("fill-opacity", 0)
      .remove(); // The .remove() call ensures ephemerality.
      
    // REMOVED: No need to manage the activeDots array anymore.
  }

  // --- Event Listeners and Initializers ---
  document.getElementById('msg-0').addEventListener('click', (event) => sendMessage(0, event.target));
  document.getElementById('msg-1').addEventListener('click', (event) => sendMessage(1, event.target));
  document.getElementById('msg-2').addEventListener('click', (event) => sendMessage(2, event.target));
  document.getElementById('msg-3').addEventListener('click', (event) => sendMessage(3, event.target));

  const messagesRef = ref(db, 'messages');
  const recentMessagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(300));
  onChildAdded(recentMessagesQuery, snapshot => {
    drawDot(snapshot.val());
  });

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then(geoData => {
    worldData = topojson.feature(geoData, geoData.objects.countries);
    setupAndRenderMap();
  }).catch(err => {
    console.error("Could not load map data:", err);
    showModal('Error', "Could not load map data. Please refresh the page.");
  });

  window.addEventListener("resize", setupAndRenderMap);

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
    showModal('About', "Inspired by Ho'oponopono & The Pitt. <br><br> Press a button to display a dot on the map. Location is converted to an approximate 6-character geohash. Timestamp, button color and geohash are sent anonymously. No personal identifiers are stored or shared.");
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) hideModal();
  });

  function showFirebaseError(error) {
    const userMessage = "An unexpected error occurred. Our team will work on a fix. Please try again later.";
    showModal('Error', userMessage);
    console.error("Firebase Error Details:", error);
  }

});