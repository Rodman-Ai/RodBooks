// Tiny hash router. Routes register a handler that returns a DOM node or string.
// Supports `#/path?key=value` query strings — handlers receive { params, query }.

const routes = [];
let mounted = null;

export function register(path, handler, opts = {}) {
  // path can include :params, e.g. /deals/:id
  const re = new RegExp("^" + path.replace(/:[a-zA-Z]+/g, "([^/]+)") + "/?$");
  const params = (path.match(/:[a-zA-Z]+/g) || []).map((s) => s.slice(1));
  routes.push({ path, re, params, handler, opts });
}

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, queryStr] = raw.split("?");
  const query = {};
  if (queryStr) {
    new URLSearchParams(queryStr).forEach((v, k) => { query[k] = v; });
  }
  return { path: path || "/", query };
}

let suppressNext = false;
export function setQuery(patch, { replace = false } = {}) {
  // Update query params on the current hash without re-rendering the route.
  const { path, query } = parseHash();
  const next = { ...query };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") delete next[k];
    else next[k] = v;
  }
  const qs = new URLSearchParams(next).toString();
  const target = "#" + path + (qs ? "?" + qs : "");
  if (location.hash === target) return;
  suppressNext = true;
  if (replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  // Manually trigger one synthetic re-broadcast so subscribers can read new query
  window.dispatchEvent(new CustomEvent("rb:query"));
}

export function getQuery() {
  return parseHash().query;
}

export function start({ outlet, onChange }) {
  async function render() {
    if (suppressNext) { suppressNext = false; return; }
    const { path, query } = parseHash();
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) {
        const p = {};
        r.params.forEach((k, i) => (p[k] = decodeURIComponent(m[i + 1])));
        outlet.innerHTML = "";
        if (mounted && typeof mounted.unmount === "function") {
          try { mounted.unmount(); } catch {}
        }
        const result = await r.handler(p, { outlet, query });
        mounted = result?.unmount ? result : { node: result };
        if (mounted.node && mounted.node.nodeType) outlet.append(mounted.node);
        else if (typeof mounted.node === "string") outlet.innerHTML = mounted.node;
        if (onChange) onChange({ path, query, route: r });
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
