// 用途：node:test 的真实 React DOM 挂载环境，不依赖 testing-library。
import { JSDOM } from "jsdom";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
});
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

export async function mountHook<P extends object, T>(hook: (props: P) => T, props: P) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let latest: T;
  function Probe(current: P) { latest = hook(current); return null; }
  const render = async (current: P) => {
    await act(async () => { root.render(createElement(StrictMode, null, createElement(Probe, current))); });
  };
  await render(props);
  return {
    value: () => latest,
    update: render,
    unmount: async () => { await act(async () => root.unmount()); container.remove(); },
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function flush(run: () => void | Promise<unknown> = () => undefined): Promise<void> {
  await act(async () => { await run(); });
}
