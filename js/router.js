// Tiny hash router. Routes register a handler that returns a DOM node or string.

const routes = [];
let mounted = null;

export function register(path, handler, opts = {}) {
  // path can include :params, e.g. /deals/:id
  const re = new RegExp("^" + path.replace(/:[a-zA-Z]+/g, "([^/]+)") + "/?$");
  const params = (path.match(/:[a-zA-Z]+/g) || []).map((s) => s.slice(1));
  routes.push({ path, re, params, handler, opts });
}

export function start({ outlet, onChange }) {
  async function render() {
    const hash = location.hash.replace(/^#/, "") || "/";
    for (const r of routes) {
      const m = r.re.exec(hash);
      if (m) {
        const p = {};
        r.params.forEach((k, i) => (p[k] = decodeURIComponent(m[i + 1])));
        outlet.innerHTML = "";
        if (mounted && typeof mounted.unmount === "function") {
          try { mounted.unmount(); } catch {}
        }
        const result = await r.handler(p, { outlet });
        mounted = result?.unmount ? result : { node: result };
        if (mounted.node && mounted.node.nodeType) outlet.append(mounted.node);
        else if (typeof mounted.node === "string") outlet.innerHTML = mounted.node;
        if (onChange) onChange({ path: hash, route: r });
        window.scrollTo(0, 0);
        return;
      }
    }
    outlet.innerHTML = '<div class="empty"><div class="ico">∅</div>Not found</div>';
  }
  window.addEventListener("hashchange", render);
  render();
}

export function go(path) {
  if (!path.startsWith("#")) path = "#" + path;
  if (location.hash === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = path;
  }
}
