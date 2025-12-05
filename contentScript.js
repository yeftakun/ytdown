// YTDown Content Script - Simplified (no page buttons)
console.log('YTDown content script loaded - Extension-only mode');

// Optional: Add visual indicator that extension is active
function addExtensionIndicator() {
  // Only add indicator if not already exists
  if (document.getElementById('ytdown-indicator')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'ytdown-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(25, 118, 210, 0.9);
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-family: system-ui;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  `;
  indicator.textContent = '🎬 YTDown Active';
  
  document.body.appendChild(indicator);
  
  // Show briefly when page loads
  setTimeout(() => {
    indicator.style.opacity = '1';
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 2000);
  }, 1000);
}

// Add indicator when video page loads
if (window.location.href.includes('watch?v=')) {
  addExtensionIndicator();
}

// Listen for navigation changes (YouTube SPA)
let currentUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    if (currentUrl.includes('watch?v=')) {
      addExtensionIndicator();
    }
  }
}, 1000);