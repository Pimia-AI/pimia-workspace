import assert from "node:assert/strict";
import test from "node:test";

import { installTauriUnlistenGuard } from "./tauriUnlistenGuard.ts";

/**
 * Stand-in for Tauri's injected event internals. `unregisterListener` mirrors
 * `unlisten_js_script` verbatim, including the unguarded entry dereference
 * that throws when the registration eval has not landed yet.
 */
function createHost() {
  const listeners = Object.create(null);
  const unregisteredHandlerIds = [];

  return {
    host: {
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener(event, eventId) {
          const entries = listeners[event];
          if (entries) {
            unregisteredHandlerIds.push(entries[eventId].handlerId);
          }
        },
      },
    },
    unregisteredHandlerIds,
    register(event, eventId, handlerId) {
      listeners[event] ??= Object.create(null);
      listeners[event][eventId] = { handlerId };
    },
  };
}

/** Collects scheduled retries so the test decides when they run. */
function createScheduler() {
  const pending = [];
  return {
    setTimeoutFn: (fn) => {
      pending.push(fn);
      return pending.length;
    },
    runPending() {
      const due = pending.splice(0, pending.length);
      for (const fn of due) fn();
      return due.length;
    },
    get pendingCount() {
      return pending.length;
    },
  };
}

test("unlisten before the registration eval lands does not throw", () => {
  const { host, register, unregisteredHandlerIds } = createHost();
  const scheduler = createScheduler();
  // Another listener for the same event name exists, so the per-event object
  // is present while this listener's own entry is not — the throwing shape.
  register("relay-event", 1, 100);
  installTauriUnlistenGuard({
    host,
    retryDelaysMs: [0, 1],
    setTimeoutFn: scheduler.setTimeoutFn,
  });

  assert.doesNotThrow(() =>
    host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener("relay-event", 2),
  );
  assert.deepEqual(unregisteredHandlerIds, []);

  // The registration eval reaches the webview, then the retry fires.
  register("relay-event", 2, 200);
  scheduler.runPending();
  assert.deepEqual(unregisteredHandlerIds, [200]);
});

test("an entry that never lands exhausts its retries without throwing", () => {
  const { host, register } = createHost();
  const scheduler = createScheduler();
  register("relay-event", 1, 100);
  installTauriUnlistenGuard({
    host,
    retryDelaysMs: [0, 1, 2],
    setTimeoutFn: scheduler.setTimeoutFn,
  });

  assert.doesNotThrow(() =>
    host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener("relay-event", 7),
  );

  let rounds = 0;
  while (scheduler.pendingCount > 0 && rounds < 10) {
    assert.doesNotThrow(() => scheduler.runPending());
    rounds += 1;
  }
  assert.equal(scheduler.pendingCount, 0);
  assert.equal(rounds, 3, "retries are bounded by the schedule");
});

test("an event with no listeners at all is left to the stock script", () => {
  const { host } = createHost();
  const scheduler = createScheduler();
  installTauriUnlistenGuard({ host, setTimeoutFn: scheduler.setTimeoutFn });

  // The stock script already tolerates a missing per-event object.
  host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener("never", 7);
  assert.equal(scheduler.pendingCount, 0);
});

test("a registered listener is unregistered on the first call", () => {
  const { host, register, unregisteredHandlerIds } = createHost();
  const scheduler = createScheduler();
  register("ready", 3, 300);
  installTauriUnlistenGuard({ host, setTimeoutFn: scheduler.setTimeoutFn });

  host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener("ready", 3);

  assert.deepEqual(unregisteredHandlerIds, [300]);
  assert.equal(scheduler.pendingCount, 0);
});

test("installing twice does not wrap the wrapper", () => {
  const { host, register, unregisteredHandlerIds } = createHost();
  const scheduler = createScheduler();
  register("ready", 4, 400);
  installTauriUnlistenGuard({ host, setTimeoutFn: scheduler.setTimeoutFn });
  const wrapped = host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener;
  installTauriUnlistenGuard({ host, setTimeoutFn: scheduler.setTimeoutFn });

  assert.equal(
    host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener,
    wrapped,
  );
  host.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener("ready", 4);
  assert.deepEqual(unregisteredHandlerIds, [400]);
});

test("outside a Tauri webview the guard is a no-op", () => {
  assert.doesNotThrow(() => installTauriUnlistenGuard({ host: {} }));
});
