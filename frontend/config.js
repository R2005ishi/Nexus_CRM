/**
 * Nexus CRM — Centralized Configuration
 *
 * ──────────────────────────────────────────────────────────────────
 *  CHANGE THIS FILE BEFORE DEPLOYING
 * ──────────────────────────────────────────────────────────────────
 *
 *  LOCAL DEV  →  BACKEND_URL = "http://localhost:3001/api/v1"
 *  PRODUCTION →  BACKEND_URL = "https://your-backend.onrender.com/api/v1"
 *
 * ──────────────────────────────────────────────────────────────────
 */
window.NEXUS_CONFIG = {
  // Backend REST API base URL — resolved dynamically depending on environment
  BACKEND_URL: (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:3001/api/v1"
    : (localStorage.getItem("NEXUS_BACKEND_URL") || "https://nexus-crm-backend.onrender.com/api/v1"),
};

// Responsive mobile sidebar toggle utility
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && backdrop) {
    if (sidebar.classList.contains('-translate-x-full')) {
      sidebar.classList.remove('-translate-x-full');
      backdrop.classList.remove('hidden');
    } else {
      sidebar.classList.add('-translate-x-full');
      backdrop.classList.add('hidden');
    }
  }
};
