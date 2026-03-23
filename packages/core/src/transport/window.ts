import type { CommandDefinition, SurfManifest } from '../types.js';
import type { CommandRegistry } from '../commands.js';
import type { EventBus } from '../events.js';

/**
 * Generates a browser-injectable script that exposes window.__surf__.
 * This creates a fully functional in-page Surf runtime — no network needed.
 */
export function generateBrowserScript(
  manifest: SurfManifest,
  registry: CommandRegistry,
  events: EventBus,
): string {
  // We serialize the manifest and create a lightweight runtime.
  // The actual command execution happens via postMessage to the host page.
  // Escape sequences that could break out of a <script> tag (XSS mitigation).
  const safeJson = JSON.stringify(manifest)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--');

  return `
(function() {
  'use strict';

  var manifest = ${safeJson};
  var listeners = {};
  var authToken = null;

  window.__surf__ = {
    /** Returns the Surf manifest for this page. */
    discover: function() {
      return manifest;
    },

    /**
     * Execute a Surf command.
     * @param {string} command - Command name
     * @param {object} params - Command parameters
     * @returns {Promise<object>} Command result
     */
    execute: function(command, params) {
      return new Promise(function(resolve, reject) {
        var event = new CustomEvent('__surf_execute__', {
          detail: {
            command: command,
            params: params || {},
            auth: authToken,
            resolve: resolve,
            reject: reject
          }
        });
        window.dispatchEvent(event);
      });
    },

    /**
     * Subscribe to a Surf event.
     * @param {string} event - Event name
     * @param {function} callback - Event handler
     * @returns {function} Unsubscribe function
     */
    subscribe: function(event, callback) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return function() {
        var idx = listeners[event].indexOf(callback);
        if (idx !== -1) listeners[event].splice(idx, 1);
      };
    },

    /**
     * Set authentication token.
     * @param {string} token - Auth token
     */
    authenticate: function(token) {
      authToken = token;
    },

    /** @internal Emit an event to subscribers. */
    __emit__: function(event, data) {
      var cbs = listeners[event] || [];
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](data); } catch(e) { console.error('[Surf] Event listener error:', e); }
      }
    }
  };

  // Signal that Surf is ready
  window.dispatchEvent(new Event('surf:ready'));
})();
`.trim();
}

/**
 * Sets up the server-side listener for window.__surf__.execute() calls.
 * This should be called in your app's client-side code to wire
 * the CustomEvent bridge to actual command execution.
 */
export function createWindowBridge(
  registry: CommandRegistry,
  events: EventBus,
): string {
  return `
(function() {
  window.addEventListener('__surf_execute__', function(e) {
    var detail = e.detail;
    // Forward to server via fetch
    fetch('/surf/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(detail.auth ? { 'Authorization': 'Bearer ' + detail.auth } : {})
      },
      body: JSON.stringify({
        command: detail.command,
        params: detail.params
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) detail.resolve(data.result);
      else detail.reject(data.error);
    })
    .catch(detail.reject);
  });
})();
`.trim();
}
