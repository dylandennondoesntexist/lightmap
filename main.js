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
  // Store active dots with their expiration time
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
    mapLayer.selectAll("path").remove();
    mapLayer.style("background-color", getComputedStyle(document.documentElement).getPropertyValue('--sea'));
    mapLayer.selectAll("path").data(worldData.features).enter().append("path")
      .attr("fill", getComputedStyle(document.documentElement).getPropertyValue('--land'))
      .attr("stroke", getComputedStyle(document.documentElement).getPropertyValue('--border'))
      .attr("d", path);
    
    // Clear existing dots from the SVG layer before redrawing
    dotLayer.selectAll("circle").remove();

    // Filter out expired dots and redraw the remaining active dots
    const now = Date.now();
    activeDots = activeDots.filter(dot => dot.expirationTime > now); // Keep only non-expired dots

    activeDots.forEach(dotInfo => {
      const { data, expirationTime } = dotInfo;
      const coords = decodeGeohash(data.geohash);
      const [x, y] = projection([coords.lng, coords.lat]);
      if (isNaN(x) || isNaN(y)) return;

      const dot = dotLayer.append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 4) // Set radius directly for redrawn dots
        .attr("fill", data.color)
        .attr("fill-opacity", 0.8); // Set opacity directly for redrawn dots

      // Calculate remaining time for this dot to disappear
      const remainingTime = expirationTime - now;
      if (remainingTime > 0) {
        dot.transition().duration(remainingTime).attr("r", 0).attr("fill-opacity", 0)
           .remove(); // Remove the SVG element after its lifespan
      } else {
        // If somehow a dot with remainingTime <= 0 makes it here, remove it immediately
        dot.remove();
      }
    });
  }

  // --- Core Application Logic ---
  const colors = ["#AA4499", "#DDCC77", "#44AA99", "#332288"];
  let lastMessageTime = 0;
  const MESSAGE_COOLDOWN = 5000; // 5 seconds

  function sendMessage(colorIndex, button) { // Added button parameter
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
        // Change button text to "Displayed!" on success
        const originalButtonText = button.textContent;
        button.textContent = "Displayed!";
        setTimeout(() => {
          button.textContent = originalButtonText; // Revert text after 2 seconds
          buttons.forEach(btn => btn.disabled = false);
        }, 2000); // 2 seconds delay for text revert
      }).catch(error => {
        showFirebaseError(error);
        buttons.forEach(btn => btn.disabled = false);
      });
    }, error => {
      showModal('Error', "It's (likely) not you, it's us. Sometimes we have a hard time getting location, especially on mobile browsers. Please try again while we work on a fix and ensure you have location enabled.");
      buttons.forEach(btn => btn.disabled = false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 20000 }); // UPDATED: maximumAge to 15 seconds
  }

  function drawDot(data) {
    const { geohash: hash, color, timestamp } = data;
    if (!hash || !color || !timestamp) return;
    const now = Date.now();
    const DOT_LIFESPAN = 10000; // 10 seconds
    const expirationTime = timestamp + DOT_LIFESPAN;

    // Only draw dots that are still active
    if (now > expirationTime) return; 

    const coords = decodeGeohash(hash);
    const [x, y] = projection([coords.lng, coords.lat]);
    if (isNaN(x) || isNaN(y)) return;

    const dot = dotLayer.append("circle")
      .attr("cx", x)
      .attr("cy", y)
      .attr("fill", color);

    // Initial animation for newly added dots
    dot.attr("r", 0)
      .attr("fill-opacity", 0)
      .transition().duration(3000).attr("r", 4).attr("fill-opacity", 0.8)
      .transition().delay(3000).duration(7000).attr("r", 0).attr("fill-opacity", 0) // Fade out after 3s in, 7s out
      .remove(); // Remove the SVG element after the animation completes

    // Add dot to activeDots with its expiration time
    activeDots.push({ data, expirationTime });

    // Remove dot data from activeDots array after its full lifespan
    setTimeout(() => {
      activeDots = activeDots.filter(d => d.data.timestamp !== data.timestamp);
    }, DOT_LIFESPAN);
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
    // A small delay to ensure CSS variables are applied before map redraw
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
  
  // About text
  aboutMenu.addEventListener('click', () => {
    closeMenuDropdown();
    showModal('About', "Inspired by Ho'oponopono & The Pitt. <br><br> Press a button to display a dot on the map. Location is converted to an approximate 6-character geohash. Timestamp, button color and geohash are sent anonymously. No personal identifiers are stored or shared.");
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) hideModal();
  });

  function showFirebaseError(error) {
    // User-friendly message
    const userMessage = "An unexpected error occurred. Our team will work on a fix. Please try again later.";
    showModal('Error', userMessage);

    // --- Error Reporting (placeholder for More robust reporting logic if necessary) ---

    // Simple debugging for now
    console.error("Firebase Error Details:", error);
  }

});