/**
 * Guard for Tauri's generated `unlisten` script.
 *
 * Tauri injects this into the webview (`unlisten_js_script`,
 * `crates/tauri/src/event/mod.rs`) and dereferences the listener entry without
 * checking that it exists:
 *
 * ```js
 * const listeners = (window['…listeners object…'] || {})[event]
 * if (listeners) {
 *   window.__TAURI_INTERNALS__.unregisterCallback(listeners[eventId].handlerId)
 * }
 * ```
 *
 * `listen()` resolves as soon as Rust answers the `plugin:event|listen`
 * invoke, but that entry is written by a *separate*, later eval. An unlisten
 * inside that window throws
 * `TypeError: undefined is not an object (evaluating 'listeners[eventId].handlerId')`.
 *
 * The throw is worse than the noise it makes: it happens on the **first** line
 * of `_unlisten` in `@tauri-apps/api/event`, so the
 * `invoke("plugin:event|unlisten", …)` on the second line never runs. The
 * backend listener survives and keeps delivering events to a handler the UI
 * believes it removed — after a remount the event is handled twice, and a
 * remount loop multiplies handlers without bound.
 *
 * React StrictMode replays every effect in development (mount → unmount →
 * mount), so any `useEffect` that subscribes on mount and unsubscribes in its
 * cleanup hits this window on essentially every fast unsubscribe.
 *
 * This shim retries the entry lookup instead of letting it throw: the entry
 * arrives a few milliseconds later, and unregistering the callback then frees
 * the handler closure. Either way `_unlisten` proceeds to its backend invoke,
 * which is what actually stops delivery.
 *
 * Upstream: tauri-apps/tauri#15799 — still unguarded in 2.11.5 and on `dev`.
 * Delete this module once the guard ships upstream.
 */

/** Retry schedule (ms) for a listener entry whose registration eval is still in flight. */
const RETRY_DELAYS_MS = [0, 16, 64, 256] as const;

const GUARD_MARKER = "__pimiaUnlistenGuarded";

type UnregisterListener = (event: string, eventId: number) => void;

type EventPluginInternals = {
  unregisterListener: UnregisterListener;
  [GUARD_MARKER]?: boolean;
};

type EventPluginHost = {
  __TAURI_EVENT_PLUGIN_INTERNALS__?: EventPluginInternals;
};

export type UnlistenGuardOptions = {
  /** Host object carrying Tauri's event-plugin internals. Defaults to `window`. */
  host?: EventPluginHost;
  /** Delays between retries. Defaults to {@link RETRY_DELAYS_MS}. */
  retryDelaysMs?: readonly number[];
  /** Timer used to retry. Defaults to `globalThis.setTimeout`. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
};

/**
 * Wrap `__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` so an unlisten
 * that lands before its registration eval retries instead of throwing.
 *
 * Idempotent, and a no-op outside a Tauri webview (browser dev server, E2E
 * mock bridge), where the internals object does not exist.
 */
export function installTauriUnlistenGuard(
  options: UnlistenGuardOptions = {},
): void {
  const host = options.host ?? (globalThis as unknown as EventPluginHost);
  const internals = host.__TAURI_EVENT_PLUGIN_INTERNALS__;
  if (!internals || typeof internals.unregisterListener !== "function") {
    return;
  }
  // The marker lives on the internals object, not in module scope, so an HMR
  // re-evaluation of this module cannot wrap the wrapper.
  if (internals[GUARD_MARKER]) {
    return;
  }

  const retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  const schedule =
    options.setTimeoutFn ??
    ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const unregisterListener = internals.unregisterListener.bind(internals);

  /** Returns true when the entry was found and its callback unregistered. */
  const tryUnregister = (event: string, eventId: number): boolean => {
    try {
      unregisterListener(event, eventId);
      return true;
    } catch {
      // The registration eval has not reached the webview yet.
      return false;
    }
  };

  internals.unregisterListener = (event, eventId) => {
    if (tryUnregister(event, eventId)) {
      return;
    }
    // Retry off the call stack so `_unlisten` proceeds to its backend invoke
    // now — that is what stops delivery. The retries only reclaim the handler
    // closure once the entry lands; giving up merely leaks that closure.
    let attempt = 0;
    const retry = () => {
      if (tryUnregister(event, eventId)) {
        return;
      }
      attempt += 1;
      if (attempt < retryDelaysMs.length) {
        schedule(retry, retryDelaysMs[attempt]);
      }
    };
    schedule(retry, retryDelaysMs[0]);
  };
  internals[GUARD_MARKER] = true;
}
