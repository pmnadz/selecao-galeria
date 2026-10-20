(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const KEY = (window.SELECAO_CONFIG || {}).driveApiKey;
  const driveUrl = (id) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${KEY}`;

  let manifest = null;
  let mine = null; // { name, unvoted, votes: {n: {d, t}}, comments: [{n, text, at}], sentAt }
  let filter = "todas";
  let lbIndex = -1;
  const figures = new Map();

  // ---------- storage (this device only) ----------

  const storageKey = () => `selecao:${manifest.id}`;
  function load() {
    try { mine = JSON.parse(localStorage.getItem(storageKey()) || "null"); } catch { mine = null; }
    if (!mine) mine = { name: "", unvoted: null, votes: {}, comments: [], sentAt: null };
    if (!mine.name) { try { mine.name = localStorage.getItem("selecao:nome") || ""; } catch {} }
  }
  function save() {
    try { localStorage.setItem(storageKey(), JSON.stringify(mine)); } catch {}
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 4500);
  }

  // ---------- name ----------

  function askName() {
    const d = $("name-dialog");
    d.querySelector("input").value = mine.name;
    d.showModal();
  }
  $("name-form").addEventListener("submit", (e) => {
    const v = e.target.name.value.trim();
    if (!v) return e.preventDefault();
    mine.name = v;
    try { localStorage.setItem("selecao:nome", v); } catch {}
    save();
    renderMe();
  });
  $("name-dialog").addEventListener("cancel", (e) => { if (!mine.name) e.preventDefault(); });
  $("me").addEventListener("click", askName);
  function renderMe() { $("me").textContent = mine.name ? `Você: ${mine.name} · trocar` : "Informe seu nome"; }

  // ---------- render ----------

  const fmtTime = (ms) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const srcOf = (p) => p.src || driveUrl(p.drive);
  const decision = (n) => mine.votes[n]?.d;
  const commentsFor = (n) => mine.comments.filter((c) => c.n === n);

  function buildGrid() {
    const grid = $("grid");
    grid.innerHTML = "";
    for (const p of manifest.photos) {
      const fig = document.createElement("figure");
      fig.innerHTML = `
        <span class="num">#${p.n}</span>
        <span class="badge"></span>
        <div class="imgwrap">
          <img src="${esc(srcOf(p))}" loading="lazy" alt="${esc(p.name)}">
          <div class="zones">
            <div class="zone zone-deny" title="Recusar"></div>
            <div class="zone zone-zoom" title="Ampliar"></div>
            <div class="zone zone-approve" title="Aprovar"></div>
          </div>
        </div>
        <figcaption><span class="fname">${esc(p.name)}</span><button type="button" class="ccount"></button></figcaption>`;
      fig.querySelector(".zone-deny").addEventListener("click", () => vote(p.n, "recusada"));
      fig.querySelector(".zone-approve").addEventListener("click", () => vote(p.n, "aprovada"));
      fig.querySelector(".zone-zoom").addEventListener("click", () => openLightbox(p.n));
      fig.querySelector(".ccount").addEventListener("click", () => openLightbox(p.n));
      grid.appendChild(fig);
      figures.set(p.n, fig);
    }
  }

  function matches(p) {
    if (filter === "todas") return true;
    if (filter === "sem") return !decision(p.n);
    return decision(p.n) === filter;
  }

  function render() {
    let a = 0, r = 0;
    for (const p of manifest.photos) {
      const d = decision(p.n);
      if (d === "aprovada") a++;
      if (d === "recusada") r++;
      const fig = figures.get(p.n);
      fig.classList.toggle("is-aprovada", d === "aprovada");
      fig.classList.toggle("is-recusada", d === "recusada");
      fig.querySelector(".badge").textContent = d === "aprovada" ? "APROVADA" : d === "recusada" ? "RECUSADA" : "";
      const nc = commentsFor(p.n).length;
      fig.querySelector(".ccount").textContent = nc ? `💬 ${nc}` : "";
      fig.hidden = !matches(p);
    }
    $("n-todas").textContent = manifest.photos.length;
    $("n-aprovada").textContent = a;
    $("n-recusada").textContent = r;
    $("n-sem").textContent = manifest.photos.length - a - r;
    $("comment-count").textContent = mine.comments.length ? `(${mine.comments.length})` : "";

    for (const b of document.querySelectorAll("[data-unvoted]")) b.classList.toggle("on", b.dataset.unvoted === mine.unvoted);
    $("unvoted-hint").textContent = mine.unvoted ? "" : "escolha antes de enviar";

    const banner = $("banner");
    banner.hidden = !mine.sentAt;
    if (mine.sentAt) banner.textContent = `Você enviou sua resposta em ${fmtTime(mine.sentAt)}. Se mudar algum voto, é só enviar de novo.`;
    $("submit").textContent = mine.sentAt ? "Enviar de novo" : "Enviar seleção";

    renderComments($("all-comments"), [...mine.comments].reverse(), true, "Nenhum comentário ainda.");
    if (lbIndex >= 0) renderLightbox();
  }

  function renderComments(el, list, withThumb, emptyText) {
    el.innerHTML = "";
    if (!list.length) { el.innerHTML = `<li class="empty">${emptyText}</li>`; return; }
    for (const c of list) {
      const li = document.createElement("li");
      const p = c.n ? manifest.photos.find((x) => x.n === c.n) : null;
      li.innerHTML = `
        ${withThumb && p ? `<img class="cthumb" src="${esc(srcOf(p))}" alt="">` : ""}
        <div class="cmain"><div class="cmeta">${withThumb ? (c.n ? `foto #${c.n}` : "geral") + " · " : ""}${fmtTime(c.at)}</div><div class="cbody">${esc(c.text)}</div></div>
        <button type="button" class="cdel" title="Apagar comentário">✕</button>`;
      li.querySelector(".cthumb")?.addEventListener("click", () => openLightbox(c.n));
      li.querySelector(".cdel").addEventListener("click", () => {
        mine.comments = mine.comments.filter((x) => x !== c);
        save();
        render();
      });
      el.appendChild(li);
    }
  }

  // ---------- actions ----------

  function vote(n, d) {
    if (!mine.name) return askName();
    if (decision(n) === d) delete mine.votes[n];
    else mine.votes[n] = { d, t: Date.now() };
    save();
    render();
  }

  for (const b of document.querySelectorAll("[data-unvoted]")) {
    b.addEventListener("click", () => { mine.unvoted = b.dataset.unvoted; save(); render(); });
  }
  for (const b of document.querySelectorAll("[data-filter]")) b.addEventListener("click", () => setFilter(b.dataset.filter));
  function setFilter(f) {
    filter = f;
    for (const o of document.querySelectorAll("[data-filter]")) o.classList.toggle("on", o.dataset.filter === f);
    render();
  }
  for (const b of document.querySelectorAll("[data-tab]")) {
    b.addEventListener("click", () => {
      for (const o of document.querySelectorAll("[data-tab]")) o.setAttribute("aria-selected", String(o === b));
      $("tab-fotos").hidden = b.dataset.tab !== "fotos";
      $("tab-comentarios").hidden = b.dataset.tab !== "comentarios";
      $("filters").style.visibility = b.dataset.tab === "fotos" ? "visible" : "hidden";
    });
  }

  function bindCommentForm(form, nFn) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!mine.name) return askName();
      const text = form.body.value.trim();
      if (!text) return;
      mine.comments.push({ n: nFn(), text: text.slice(0, 2000), at: Date.now() });
      form.body.value = "";
      save();
      render();
    });
  }
  bindCommentForm($("general-form"), () => null);
  bindCommentForm($("photo-form"), () => visible()[lbIndex].n);

  // ---------- sending ----------

  async function encode(payload) {
    const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return "SEL1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  $("submit").addEventListener("click", async () => {
    if (!mine.name) return askName();
    if (!mine.unvoted) {
      $("bar").classList.add("needs-choice");
      setTimeout(() => $("bar").classList.remove("needs-choice"), 1600);
      return toast("Antes de enviar, escolha embaixo se as fotos que você não votou são descartadas ou mantidas.");
    }
    const approved = Object.entries(mine.votes).filter(([, v]) => v.d === "aprovada").map(([n, v]) => [Number(n), v.t]).sort((x, y) => x[1] - y[1]);
    const rejected = Object.entries(mine.votes).filter(([, v]) => v.d === "recusada").map(([n]) => Number(n));
    const unvotedCount = manifest.photos.length - approved.length - rejected.length;
    const code = await encode({
      v: 1, g: manifest.id, name: mine.name, unvoted: mine.unvoted,
      approved, rejected, comments: mine.comments.map((c) => [c.n, c.text]), at: Date.now(),
    });
    const list = approved.map(([n]) => `#${n}`).join(", ");
    const text = [
      `Seleção da galeria ${manifest.title}`,
      `${mine.name} aprovou ${approved.length} foto${approved.length === 1 ? "" : "s"}${approved.length ? `: ${list}` : ""}.`,
      `${unvotedCount} sem voto, pra ${mine.unvoted === "manter" ? "manter" : "descartar"}.`,
      mine.comments.length ? `${mine.comments.length} comentário${mine.comments.length === 1 ? "" : "s"}.` : "",
      "",
      "Código pro fotógrafo (não apague):",
      code,
    ].filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");

    $("send-summary").textContent = mine.unvoted === "manter"
      ? `${approved.length + unvotedCount} fotos na sua seleção: ${approved.length} aprovadas e ${unvotedCount} sem voto, mantidas.`
      : `${approved.length} fotos aprovadas na sua seleção. As ${unvotedCount} sem voto ficam de fora.`;
    $("send-text").value = text;
    const c = manifest.contact || {};
    $("send-wa").href = `https://wa.me/${c.whatsapp || ""}?text=${encodeURIComponent(text)}`;
    $("send-mail").href = `mailto:${encodeURIComponent(c.email || "")}?subject=${encodeURIComponent(`Seleção ${manifest.title}`)}&body=${encodeURIComponent(text)}`;
    $("send-dialog").showModal();
  });
  const markSent = () => { mine.sentAt = Date.now(); save(); render(); };
  $("send-wa").addEventListener("click", markSent);
  $("send-mail").addEventListener("click", markSent);
  $("send-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("send-text").value); } catch { $("send-text").select(); document.execCommand("copy"); }
    $("send-copy").textContent = "Copiado";
    setTimeout(() => ($("send-copy").textContent = "Copiar"), 1500);
    markSent();
  });
  $("send-close").addEventListener("click", () => $("send-dialog").close());

  // ---------- lightbox ----------

  const visible = () => manifest.photos.filter(matches);

  function openLightbox(n) {
    if (!visible().some((p) => p.n === n)) setFilter("todas");
    lbIndex = visible().findIndex((p) => p.n === n);
    $("lightbox").hidden = false;
    document.body.style.overflow = "hidden";
    renderLightbox();
  }
  function closeLightbox() {
    $("lightbox").hidden = true;
    document.body.style.overflow = "";
    lbIndex = -1;
  }
  function step(d) {
    const list = visible();
    if (!list.length) return;
    lbIndex = (lbIndex + d + list.length) % list.length;
    renderLightbox();
  }

  function renderLightbox() {
    const list = visible();
    if (!list.length) return closeLightbox();
    lbIndex = Math.min(lbIndex, list.length - 1);
    const p = list[lbIndex];
    const img = $("lb-img");
    // Voting inside a filtered view drops the photo from the list, which
    // advances to the next one.
    if (img.dataset.n !== String(p.n)) {
      $("lb-stage").classList.remove("zoomed");
      img.src = srcOf(p);
      img.dataset.n = p.n;
      $("photo-form").body.value = "";
    }
    $("lb-num").textContent = `#${p.n}`;
    $("lb-name").textContent = p.name;
    const d = decision(p.n);
    $("lb-deny").classList.toggle("on", d === "recusada");
    $("lb-approve").classList.toggle("on", d === "aprovada");
    $("lb-who").textContent = d ? `Você ${d === "aprovada" ? "aprovou" : "recusou"} esta foto.` : "Você ainda não votou nesta foto.";
    renderComments($("lb-comments"), commentsFor(p.n), false, "Nenhum comentário nesta foto.");
  }

  $("lb-img").addEventListener("click", () => $("lb-stage").classList.toggle("zoomed"));
  $("lb-prev").addEventListener("click", () => step(-1));
  $("lb-next").addEventListener("click", () => step(1));
  $("lb-close").addEventListener("click", closeLightbox);
  $("lb-deny").addEventListener("click", () => vote(visible()[lbIndex].n, "recusada"));
  $("lb-approve").addEventListener("click", () => vote(visible()[lbIndex].n, "aprovada"));
  document.addEventListener("keydown", (e) => {
    if ($("lightbox").hidden || e.target.closest("textarea, input")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key.toLowerCase() === "a") vote(visible()[lbIndex].n, "aprovada");
    else if (e.key.toLowerCase() === "r") vote(visible()[lbIndex].n, "recusada");
  });

  // ---------- start ----------

  async function start() {
    const params = new URLSearchParams(location.hash.slice(1));
    const url = params.get("d") ? driveUrl(params.get("d")) : params.get("u");
    if (!url) throw new Error("Link incompleto. Peça o link de novo pro fotógrafo.");
    if (params.get("d") && !KEY) throw new Error("Esta página ainda não foi configurada (falta a chave do Drive).");
    const res = await fetch(url);
    if (!res.ok) throw new Error("Não consegui abrir esta galeria. Ela pode ter sido apagada. Peça o link de novo pro fotógrafo.");
    manifest = await res.json();
    load();
    document.title = `${manifest.title} · Seleção`;
    $("title").textContent = manifest.title;
    $("lede").textContent = manifest.mode === "edicao" ? "Escolha as fotos que você quer que sejam editadas." : "Escolha as suas fotos favoritas.";
    buildGrid();
    renderMe();
    render();
    if (!mine.name) askName();
  }

  start().catch((e) => {
    $("title").textContent = "Galeria indisponível";
    $("lede").textContent = e.message;
    for (const id of ["bar", "tab-fotos", "filters", "me"]) $(id).hidden = true;
    document.querySelector(".tabs").hidden = true;
  });
})();
