(function (global) {
  var STORAGE_KEY = "zudaka-content";
  var SESSION_KEY = "zudaka-admin";

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getPath(obj, path) {
    return path.split(".").reduce(function (acc, key) {
      return acc == null ? acc : acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    var parts = path.split(".");
    var node = obj;
    for (var i = 0; i < parts.length - 1; i += 1) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== "object") {
        node[parts[i]] = {};
      }
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }

  function loadFileContent() {
    return fetch("content.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("content.json no disponible");
      return res.json();
    });
  }

  function loadLocalContent() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (err) {
      return null;
    }
  }

  function hydrate(fileContent, extra) {
    var data = extra || fileContent;
    if (!Array.isArray(data.blocks)) data.blocks = fileContent.blocks || [];
    if (!Array.isArray(data.library)) data.library = fileContent.library || [];
    if (!Array.isArray(data.marquee)) data.marquee = fileContent.marquee || [];
    if (!data.social) data.social = fileContent.social || { tiktok: "#", instagram: "#", youtube: "#" };
    if (!data.rotterdam) data.rotterdam = fileContent.rotterdam || {};
    if (!data.rotterdam.endpoint && fileContent.rotterdam && fileContent.rotterdam.endpoint) {
      data.rotterdam.endpoint = fileContent.rotterdam.endpoint;
    }
    return data;
  }

  function loadContent() {
    return loadFileContent().then(function (fileContent) {
      var local = loadLocalContent();
      if (local && local._gen === fileContent._gen) return hydrate(fileContent, local);
      return fileContent;
    }).catch(function () {
      var local = loadLocalContent();
      if (local) return local;
      throw new Error("No se pudo cargar el contenido");
    });
  }

  function saveContent(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      return false;
    }
  }

  function resetLocalContent() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function exportContent(data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "content.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function fillBindings(content) {
    document.querySelectorAll("[data-bind]").forEach(function (el) {
      var value = getPath(content, el.dataset.bind);
      if (value != null) el.textContent = value;
    });
    document.querySelectorAll("[data-bind-href]").forEach(function (el) {
      var value = getPath(content, el.dataset.bindHref);
      if (value != null) el.setAttribute("href", value);
      if (el.classList.contains("social") && value && value !== "#") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    });
    document.querySelectorAll("[data-bind-src]").forEach(function (el) {
      var value = getPath(content, el.dataset.bindSrc);
      if (value != null) el.setAttribute("src", value);
    });
    document.querySelectorAll("[data-bind-list]").forEach(function (el) {
      var value = getPath(content, el.dataset.bindList);
      if (!Array.isArray(value)) return;
      el.innerHTML = "";
      value.forEach(function (item) {
        var p = document.createElement("p");
        p.textContent = item;
        el.appendChild(p);
      });
    });
  }

  function renderMarquee(content) {
    var track = document.querySelector(".marquee-track");
    if (!track) return;
    var parts = (content.marquee || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    if (!parts.length) return;
    function line() {
      var span = document.createElement("span");
      parts.forEach(function (word, i) {
        if (i) {
          var dot = document.createElement("b");
          dot.textContent = "•";
          span.appendChild(document.createTextNode(" "));
          span.appendChild(dot);
          span.appendChild(document.createTextNode(" "));
        }
        span.appendChild(document.createTextNode(word));
      });
      span.appendChild(document.createTextNode(" "));
      var end = document.createElement("b");
      end.textContent = "•";
      span.appendChild(end);
      span.appendChild(document.createTextNode(" "));
      return span;
    }
    track.innerHTML = "";
    track.appendChild(line());
    track.appendChild(line());
  }

  function padNum(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function renderGallery(content) {
    var grid = document.getElementById("gallery-grid");
    if (!grid) return;
    grid.innerHTML = "";
    var items = content.gallery || [];
    var total = items.length;
    items.forEach(function (item, index) {
      var shot = document.createElement("article");
      shot.className = "shot" + (index === 0 ? " is-on" : "");
      shot.style.setProperty("--i", String(index));

      var frame = document.createElement("div");
      frame.className = "shot-frame";

      var img = document.createElement("img");
      img.src = item.src;
      img.alt = item.alt || content.brand.name;
      img.loading = index < 2 ? "eager" : "lazy";
      img.draggable = false;
      img.width = 1600;
      img.height = 2000;

      var caption = document.createElement("div");
      caption.className = "shot-caption" + (item.text ? " has-text" : "");
      var num = document.createElement("p");
      num.className = "shot-num";
      num.textContent = padNum(index + 1) + " / " + padNum(total);
      caption.appendChild(num);
      if (item.text) {
        var text = document.createElement("p");
        text.className = "shot-text";
        text.textContent = item.text;
        caption.appendChild(text);
      }

      frame.appendChild(img);
      shot.appendChild(frame);
      shot.appendChild(caption);
      grid.appendChild(shot);
    });
  }

  function bootGalleryScroll() {
    var frame = document.getElementById("gallery-frame");
    var shots = document.querySelectorAll(".shot");
    var dots = document.getElementById("gallery-dots");
    if (!frame || !shots.length) return;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var index = 0;
    var busy = false;
    var tapStart = null;
    var swiped = false;
    var lastStepAt = 0;
    var prevBtn = document.getElementById("gallery-prev");
    var nextBtn = document.getElementById("gallery-next");

    function paintDots() {
      if (!dots) return;
      var list = dots.querySelectorAll(".gallery-dot");
      for (var d = 0; d < list.length; d += 1) {
        list[d].classList.toggle("is-on", d === index);
      }
    }

    function show(next, dir) {
      if (next < 0 || next >= shots.length || next === index) return;
      var prev = shots[index];
      var incoming = shots[next];
      prev.classList.remove("is-on");
      prev.classList.add("is-prev");
      incoming.dataset.dir = dir;
      incoming.classList.add("is-on");
      incoming.classList.remove("is-prev");
      if (!reduce) {
        frame.classList.remove("is-slapping");
        void frame.offsetWidth;
        frame.classList.add("is-slapping");
      }
      index = next;
      paintDots();
      window.setTimeout(function () {
        prev.classList.remove("is-prev");
        frame.classList.remove("is-slapping");
      }, 520);
    }

    function step(dir) {
      if (busy) return false;
      var next = index + dir;
      if (next < 0) next = shots.length - 1;
      if (next >= shots.length) next = 0;
      if (next === index) return false;
      busy = true;
      lastStepAt = Date.now();
      frame.classList.add("is-used");
      show(next, dir > 0 ? "next" : "prev");
      window.setTimeout(function () { busy = false; }, reduce ? 80 : 540);
      return true;
    }

    function fromControls(event) {
      return !!(event.target && event.target.closest && event.target.closest(".gallery-dot, .gallery-nav"));
    }

    if (dots) {
      dots.innerHTML = "";
      shots.forEach(function (_, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "gallery-dot" + (i === 0 ? " is-on" : "");
        b.setAttribute("aria-label", "Foto " + (i + 1));
        b.addEventListener("click", function (event) {
          event.stopPropagation();
          if (i === index) return;
          frame.classList.add("is-used");
          show(i, i > index ? "next" : "prev");
        });
        dots.appendChild(b);
      });
    }

    frame.addEventListener("pointerenter", function () { frame.classList.add("is-hot"); });
    frame.addEventListener("pointerleave", function () { frame.classList.remove("is-hot"); });

    if (prevBtn) prevBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      step(-1);
    });
    if (nextBtn) nextBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      step(1);
    });

    frame.addEventListener("pointerdown", function (event) {
      if (fromControls(event)) return;
      tapStart = { x: event.clientX, y: event.clientY };
      swiped = false;
    });
    frame.addEventListener("pointermove", function (event) {
      if (!tapStart || swiped) return;
      var dx = event.clientX - tapStart.x;
      var dy = event.clientY - tapStart.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        swiped = true;
        tapStart = null;
        step(dx < 0 ? 1 : -1);
      }
    });
    frame.addEventListener("pointerup", function (event) {
      if (!tapStart) return;
      var dx = event.clientX - tapStart.x;
      var dy = event.clientY - tapStart.y;
      var x = event.clientX;
      tapStart = null;
      if (swiped || fromControls(event)) return;
      if (Math.abs(dx) < 56 && Math.abs(dy) < 56) {
        var rect = frame.getBoundingClientRect();
        step(x - rect.left < rect.width * 0.28 ? -1 : 1);
      }
    });
    frame.addEventListener("pointercancel", function () {
      tapStart = null;
      swiped = false;
    });
    frame.addEventListener("click", function (event) {
      if (fromControls(event) || swiped) return;
      if (Date.now() - lastStepAt < 450) return;
      var rect = frame.getBoundingClientRect();
      step(event.clientX - rect.left < rect.width * 0.28 ? -1 : 1);
    });

    frame.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        if (step(1)) event.preventDefault();
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        if (step(-1)) event.preventDefault();
      }
    });
  }

  function splitCopy(text) {
    return String(text || "").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function renderBlocks(content) {
    var main = document.getElementById("main");
    if (!main) return;
    main.querySelectorAll("[data-block]").forEach(function (node) { node.remove(); });
    (content.blocks || []).forEach(function (block) {
      var section = document.createElement("section");
      section.className = "custom-block";
      section.id = block.id;
      section.dataset.section = block.id;
      section.dataset.block = "1";
      var wrap = document.createElement("div");
      wrap.className = "wrap custom-grid" + (block.image ? " has-photo" : "");
      var copy = document.createElement("div");
      if (block.kicker) {
        var kicker = document.createElement("p");
        kicker.className = "kicker";
        kicker.textContent = block.kicker;
        copy.appendChild(kicker);
      }
      var title = document.createElement("h2");
      title.className = "section-title";
      title.textContent = block.title || "";
      copy.appendChild(title);
      splitCopy(block.copy).forEach(function (line) {
        var p = document.createElement("p");
        p.className = "hero-copy";
        p.textContent = line;
        copy.appendChild(p);
      });
      wrap.appendChild(copy);
      if (block.image) {
        var fig = document.createElement("figure");
        fig.className = "custom-photo";
        var img = document.createElement("img");
        img.src = block.image;
        img.alt = block.title || content.brand.name;
        img.loading = "lazy";
        fig.appendChild(img);
        wrap.appendChild(fig);
      }
      section.appendChild(wrap);
      main.appendChild(section);
    });
  }

  function orderSections(content) {
    var main = document.getElementById("main");
    if (!main || !content.sectionOrder) return;
    var follow = {
      hero: document.getElementById("marquee"),
      mystic: document.getElementById("hazard-revolt"),
      bio: document.getElementById("hazard-rotterdam")
    };
    content.sectionOrder.forEach(function (id) {
      var node = main.querySelector('[data-section="' + id + '"]');
      if (node) main.appendChild(node);
      if (follow[id]) main.appendChild(follow[id]);
    });
  }

  function parseYouTubeId(value) {
    var raw = String(value || "").trim();
    if (!raw || raw === "VIDEO_ID") return "";
    var m = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    m = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    m = raw.match(/youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    m = raw.match(/^([a-zA-Z0-9_-]{11})$/);
    if (m) return m[1];
    return raw;
  }

  function bootVideo(content) {
    var player = document.getElementById("yt-player");
    if (!player) return;
    var id = parseYouTubeId(content.videoId);
    if (!id) return;
    player.src = "https://www.youtube.com/embed/" + encodeURIComponent(id) + "?playsinline=1&rel=0";
  }

  function bootNav(content) {
    var nav = document.querySelector(".site-nav");
    var toggle = document.querySelector(".nav-toggle");
    if (nav && content && content.blocks) {
      nav.querySelectorAll("[data-extra-nav]").forEach(function (link) { link.remove(); });
      var order = content.sectionOrder || [];
      content.blocks.forEach(function (block) {
        if (order.indexOf(block.id) === -1) return;
        var a = document.createElement("a");
        a.href = "#" + block.id;
        a.dataset.extraNav = "1";
        a.textContent = block.title || "Sección";
        nav.appendChild(a);
      });
    }
    if (!toggle) return;
    toggle.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        toggle.removeAttribute("open");
      });
    });
  }

  function bootForm(content) {
    var form = document.getElementById("rotterdam-form");
    var statusEl = document.getElementById("form-status");
    if (!form || !statusEl) return;
    var endpoint = "";
    if (content && content.rotterdam && content.rotterdam.endpoint) {
      endpoint = String(content.rotterdam.endpoint).trim();
    }
    form.setAttribute("action", endpoint);
    var next = form.querySelector("[name='_next']");
    if (next) next.value = window.location.origin + "/?lista=1#rotterdam";

    if (/(?:^|[?&])lista=1(?:&|$)/.test(window.location.search)) {
      statusEl.dataset.state = "ready";
      statusEl.textContent = "Contacto guardado. Gracias.";
      form.reset();
      if (window.history && history.replaceState) {
        history.replaceState({}, "", window.location.pathname + "#rotterdam");
      }
    }

    form.addEventListener("submit", function (event) {
      var email = form.email.value.trim();
      var honeypot = form.website ? String(form.website.value || "").trim() : "";
      event.preventDefault();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        statusEl.dataset.state = "error";
        statusEl.textContent = "Introduce un correo electrónico válido.";
        return;
      }
      if (honeypot) {
        statusEl.dataset.state = "ready";
        statusEl.textContent = "Contacto guardado. Gracias.";
        form.reset();
        return;
      }
      if (!endpoint) {
        statusEl.dataset.state = "error";
        statusEl.textContent = "La lista aún no está conectada. El correo no se ha guardado.";
        return;
      }
      form.setAttribute("action", endpoint);
      form.setAttribute("target", "lista-frame");
      statusEl.dataset.state = "ready";
      statusEl.textContent = "Guardando…";
      form.submit();
      window.setTimeout(function () {
        form.reset();
        statusEl.textContent = "Contacto guardado. Gracias.";
      }, 700);
    });
  }

  function bootLightbox() {
    var dialog = document.getElementById("lightbox");
    var img = document.getElementById("lightbox-img");
    var closeBtn = document.getElementById("lightbox-close");
    if (!dialog || !img) return;

    document.addEventListener("click", function (event) {
      var hit = event.target.closest(".photo-hit");
      if (!hit) return;
      img.src = hit.getAttribute("data-src");
      img.alt = hit.getAttribute("data-alt") || "";
      if (typeof dialog.showModal === "function") dialog.showModal();
    });

    if (closeBtn) closeBtn.addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  function bootSparks() {
    var canvas = document.getElementById("sparks");
    if (!canvas) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    var ctx = canvas.getContext("2d");
    var sparks = [];
    var running = true;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function spawn() {
      sparks.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 8,
        r: Math.random() * 1.8 + 0.4,
        v: Math.random() * 1.4 + 0.5,
        drift: (Math.random() - 0.5) * 0.6,
        life: 1,
        fade: Math.random() * 0.006 + 0.003,
        color: Math.random() > 0.35 ? "255, 74, 18" : "201, 162, 39"
      });
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (sparks.length < 42) spawn();
      for (var i = sparks.length - 1; i >= 0; i -= 1) {
        var s = sparks[i];
        s.y -= s.v;
        s.x += s.drift;
        s.life -= s.fade;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + s.color + "," + s.life + ")";
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) tick();
    });
    tick();
  }

  function bootHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function bootGlitch() {
    var title = document.querySelector(".hero-logo");
    if (!title || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setInterval(function () {
      title.classList.add("is-glitch");
      setTimeout(function () { title.classList.remove("is-glitch"); }, 220);
    }, 7000);
  }

  function bootReveal() {
    if (CSS.supports && CSS.supports("animation-timeline", "view()")) return;
    var nodes = document.querySelectorAll(".reveal");
    if (!nodes.length || !("IntersectionObserver" in window)) {
      nodes.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add("is-in");
      });
    }, { threshold: 0.12 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  function bootPublic() {
    loadContent().then(function (content) {
      document.title = content.site.title;
      document.documentElement.lang = content.site.lang || "es";
      fillBindings(content);
      renderMarquee(content);
      renderGallery(content);
      renderBlocks(content);
      orderSections(content);
      bootVideo(content);
      bootNav(content);
      bootForm(content);
      bootLightbox();
      bootGalleryScroll();
      bootSparks();
      bootHeader();
      bootGlitch();
      bootReveal();
    }).catch(function (err) {
      console.error(err);
      bootNav();
      bootForm();
      bootLightbox();
      bootSparks();
      bootHeader();
    });
  }

  function compressImage(file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxW / img.width);
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function isAuthed() {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  }

  function setAuthed(on) {
    if (on) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  }

  global.ZudAka = {
    STORAGE_KEY: STORAGE_KEY,
    sha256: sha256,
    loadContent: loadContent,
    loadFileContent: loadFileContent,
    saveContent: saveContent,
    resetLocalContent: resetLocalContent,
    exportContent: exportContent,
    getPath: getPath,
    setPath: setPath,
    deepClone: deepClone,
    compressImage: compressImage,
    isAuthed: isAuthed,
    setAuthed: setAuthed,
    parseYouTubeId: parseYouTubeId,
    bootPublic: bootPublic
  };
})(window);
