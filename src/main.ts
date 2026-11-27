/**
 * KRUNKEDBONK — Browser Entry Point
 *
 * Mounts `GameApp` onto `#app`, attaches the `F9` Playtest `DebugDrawer`,
 * and exposes `window.__KRUNKED_DEBUG__` conforming strictly to `DebugBridge`.
 */

import { DEBUG_BRIDGE_GLOBAL_KEY, type DebugBridge } from './contracts/index';
import { createGameApp } from './app/GameApp';
import { DebugDrawer } from './ui/DebugDrawer';

declare global {
  interface Window {
    [DEBUG_BRIDGE_GLOBAL_KEY]?: DebugBridge;
  }
}

function resolveMountContainer(): HTMLElement {
  const existing = document.getElementById('app');
  if (existing) {
    return existing;
  }
  const el = document.createElement('div');
  el.id = 'app';
  document.body.appendChild(el);
  return el;
}

function bootstrap(): void {
  const container = resolveMountContainer();
  const app = createGameApp();
  app.mount(container);

  const debugBridge = app.getDebugBridge();
  window[DEBUG_BRIDGE_GLOBAL_KEY] = debugBridge;

  const debugDrawer = new DebugDrawer(debugBridge);
  debugDrawer.mount(container);

  const cleanup = (): void => {
    debugDrawer.dispose();
    app.unmount();
    if (window[DEBUG_BRIDGE_GLOBAL_KEY] === debugBridge) {
      delete window[DEBUG_BRIDGE_GLOBAL_KEY];
    }
  };

  window.addEventListener('beforeunload', cleanup, { once: true });

  const hot = (import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }).hot;
  if (hot) {
    hot.dispose(cleanup);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}
