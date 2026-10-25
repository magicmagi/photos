(() => {
  const SITE = window.SITE;
  const PHOTOS = (window.PHOTOS || []).map((p) => ({ ...p, t: Date.parse(p.date) || 0 }));
  const CATS = SITE.categories;
  const catByKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
  const $ = (id) => document.getElementById(id);

  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const state = {
    cat: "all",
    sort: store.get("sort", "new"), // new | old
    view: store.get("view", "timeline"), // timeline | grid
    list: [],
    open: -1,
  };

  // ---------- header ----------
  $("site-name").textContent = SITE.name;
  $("site-title").textContent = SITE.title;
  $("site-tagline").textContent = SITE.tagline;
  $("site-about").textContent = SITE.about;
  $("foot-name").textContent = `© ${new Date().getFullYear()} ${SITE.name}`;
  $("foot-count").textContent = `${PHOTOS.length} 张照片`;
  $("site-links").innerHTML = SITE.links
    .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)
    .join("");

  const fmtDate = (t, withDay = true) => {
    if (!t) return "";
    const d = new Date(t);
    return withDay
      ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
      : `${d.getFullYear()}年${d.getMonth() + 1}月`;
  };
  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- chips ----------
  function renderChips() {
    const counts = {};
    PHOTOS.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    const items = [{ key: "all", zh: "全部", n: PHOTOS.length }, ...CATS.map((c) => ({ ...c, n: counts[c.key] || 0 }))];
    $("chips").innerHTML = items
      .map(
        (c) =>
          `<button class="chip" role="tab" data-cat="${c.key}" aria-selected="${state.cat === c.key}">${c.zh}<span class="n">${c.n}</span></button>`
      )
      .join("");
  }
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    location.hash = b.dataset.cat === "all" ? "#/" : `#/${b.dataset.cat}`;
  });

  // ---------- controls ----------
  function renderControls() {
    $("sort-btn").innerHTML = state.sort === "new" ? "↓ <span class='lbl'>最新优先</span>" : "↑ <span class='lbl'>最早优先</span>";
    $("view-btn").innerHTML = state.view === "timeline" ? "▤ <span class='lbl'>按年份</span>" : "▦ <span class='lbl'>平铺</span>";
  }
  $("sort-btn").onclick = () => {
    state.sort = state.sort === "new" ? "old" : "new";
    store.set("sort", state.sort);
    render();
  };
  $("view-btn").onclick = () => {
    state.view = state.view === "timeline" ? "grid" : "timeline";
    store.set("view", state.view);
    render();
  };

  // ---------- gallery ----------
  function tile(p, i) {
    const r = (p.w / p.h).toFixed(4);
    const cap = [p.location, fmtDate(p.t)].filter(Boolean).join(" · ");
    return `<figure class="tile" tabindex="0" data-i="${i}" style="flex-grow:${r};width:calc(var(--row) * ${r});aspect-ratio:${p.w}/${p.h}">
      <img src="${p.thumb || p.src}" alt="${esc(p.title)}" loading="lazy" onload="this.classList.add('loaded')">
      <figcaption>${esc(p.title)}<small>${esc(cap)}</small></figcaption>
    </figure>`;
  }

  function render() {
    renderChips();
    renderControls();
    const dir = state.sort === "new" ? -1 : 1;
    state.list = PHOTOS.filter((p) => state.cat === "all" || p.category === state.cat).sort((a, b) => dir * (a.t - b.t));

    const g = $("gallery");
    if (!state.list.length) {
      g.innerHTML = `<p class="empty">这个分类还没有照片</p>`;
      return;
    }
    if (state.view === "grid") {
      g.innerHTML = `<div class="rows">${state.list.map(tile).join("")}</div>`;
    } else {
      const groups = [];
      state.list.forEach((p, i) => {
        const y = p.t ? new Date(p.t).getFullYear() : "未知年份";
        if (!groups.length || groups.at(-1).y !== y) groups.push({ y, items: [] });
        groups.at(-1).items.push(tile(p, i));
      });
      g.innerHTML = groups
        .map((gr) => `<div class="group-head"><h2>${gr.y}</h2><span>${gr.items.length} 张</span></div><div class="rows">${gr.items.join("")}</div>`)
        .join("");
    }
    const c = catByKey[state.cat];
    document.title = c ? `${c.zh} · ${SITE.title}` : SITE.title;
  }

  $("gallery").addEventListener("click", (e) => {
    const t = e.target.closest(".tile");
    if (t) openAt(+t.dataset.i);
  });
  $("gallery").addEventListener("keydown", (e) => {
    const t = e.target.closest(".tile");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openAt(+t.dataset.i); }
  });

  // ---------- lightbox ----------
  const lb = $("lightbox");
  const photoUrl = (p) => `${location.origin}${location.pathname}#/photo/${p.id}`;

  function openAt(i) {
    location.hash = `#/photo/${state.list[i].id}`;
  }

  function showLightbox(i) {
    state.open = i;
    const p = state.list[i];
    const c = catByKey[p.category];
    const img = $("lb-img");
    releaseOriginal();
    img.src = p.src;
    img.alt = p.title || "";
    renderInfo();
    document.title = `${p.title || "照片"} · ${SITE.title}`;
    if (lb.hidden) {
      lb.hidden = false;
      document.body.style.overflow = "hidden";
    }
    // 预加载相邻图片
    [i - 1, i + 1].forEach((j) => { const q = state.list[j]; if (q) new Image().src = q.src; });
  }

  function renderInfo(error = "") {
    const p = state.list[state.open];
    const c = catByKey[p.category];
    const ex = vault.meta && vault.meta[p.id];
    const rows = ex
      ? [
          ["相机", ex.camera], ["镜头", ex.lens], ["焦距", ex.focal],
          ["光圈", ex.aperture], ["快门", ex.shutter], ["ISO", ex.iso],
          ["原图尺寸", ex.w && `${ex.w} × ${ex.h}`],
        ].filter((r) => r[1])
      : [];
    const locked = !vault.key
      ? `<form class="lb-lock" id="lb-lock">
          <label for="lb-pw">🔒 原图与拍摄参数需要密码</label>
          <div><input id="lb-pw" type="password" autocomplete="current-password" placeholder="输入密码"><button>解锁</button></div>
          <p class="err">${esc(error)}</p>
        </form>`
      : `${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<p class="desc">这张照片没有拍摄参数</p>`}`;
    $("lb-info").innerHTML = `
      <div class="cat">${c ? `${c.zh} · ${c.en}` : ""}</div>
      <h3>${esc(p.title || p.location || (c ? c.zh : "未命名"))}</h3>
      <p class="meta">${esc([p.location, fmtDate(p.t)].filter(Boolean).join(" · "))}</p>
      ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ""}
      ${locked}
      <div class="lb-actions">
        <button id="lb-copy">复制链接</button>
        ${navigator.share ? `<button id="lb-share">分享</button>` : ""}
        ${vault.key ? `<button id="lb-orig">${vault.url ? "下载原图" : "查看原图"}</button>` : ""}
      </div>
      <div class="lb-pos">${state.open + 1} / ${state.list.length}</div>`;
    $("lb-copy").onclick = () => copy(photoUrl(p));
    const sh = $("lb-share");
    if (sh) sh.onclick = () => navigator.share({ title: p.title, url: photoUrl(p) }).catch(() => {});
    const form = $("lb-lock");
    if (form) form.onsubmit = (e) => { e.preventDefault(); unlock($("lb-pw").value); };
    const ob = $("lb-orig");
    if (ob) ob.onclick = () => (vault.url ? downloadOriginal(p) : showOriginal(p));
  }

  // ---------- 加密的原图与拍摄参数 ----------
  // build.py 用密码加密 secure/ 里的文件；浏览器里用同一密码派生密钥并解密，密码不会发送到任何地方
  const vault = { key: null, meta: null, url: null };
  const b64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  const fetchBuf = async (path) => {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`无法读取 ${path}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const decrypt = (key, buf) => crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));

  async function unlock(pw) {
    if (!pw) return;
    const btn = document.querySelector("#lb-lock button");
    if (btn) { btn.disabled = true; btn.textContent = "解锁中…"; }
    try {
      if (!crypto.subtle) throw new Error("需要通过 https 打开网页才能解锁");
      const info = await fetch("secure/key.json").then((r) => r.json());
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: b64(info.salt), iterations: info.iterations, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
      );
      try {
        await decrypt(key, b64(info.check));
      } catch {
        return renderInfo("密码不对，请重试");
      }
      vault.meta = JSON.parse(new TextDecoder().decode(await decrypt(key, await fetchBuf("secure/meta.bin"))));
      vault.key = key;
      renderInfo();
      toast("已解锁，本页关闭前都有效");
    } catch (err) {
      renderInfo(err.message || "解锁失败");
    }
  }

  async function showOriginal(p) {
    const ob = $("lb-orig");
    ob.disabled = true;
    ob.textContent = "加载原图…";
    try {
      const data = await decrypt(vault.key, await fetchBuf(`secure/${p.id}.bin`));
      if (state.list[state.open] !== p) return; // 加载期间翻到了别的照片
      releaseOriginal();
      vault.url = URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
      $("lb-img").src = vault.url;
      renderInfo();
    } catch {
      ob.disabled = false;
      ob.textContent = "查看原图";
      toast("原图加载失败");
    }
  }

  function downloadOriginal(p) {
    const a = document.createElement("a");
    a.href = vault.url;
    a.download = `${p.title || p.id}.jpg`;
    a.click();
  }

  function releaseOriginal() {
    if (vault.url) URL.revokeObjectURL(vault.url);
    vault.url = null;
  }

  // 公开图片：禁用右键另存和拖拽（只能挡住普通访客）
  document.addEventListener("contextmenu", (e) => {
    if (e.target.tagName === "IMG" && !(vault.url && e.target.src === vault.url)) e.preventDefault();
  });
  document.addEventListener("dragstart", (e) => { if (e.target.tagName === "IMG") e.preventDefault(); });

  function closeLightbox() {
    releaseOriginal();
    lb.hidden = true;
    document.body.style.overflow = "";
    state.open = -1;
  }

  const step = (d) => {
    if (state.open < 0) return;
    const n = state.list.length;
    location.replace(`#/photo/${state.list[(state.open + d + n) % n].id}`);
  };
  const leave = () => (location.hash = state.cat === "all" ? "#/" : `#/${state.cat}`);

  $("lb-prev").onclick = () => step(-1);
  $("lb-next").onclick = () => step(1);
  $("lb-close").onclick = leave;
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("lb-stage")) leave(); });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") leave();
    if (e.target.tagName === "INPUT") return; // 输密码时左右键用于移动光标
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  let x0 = null;
  lb.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    x0 = null;
  });

  function copy(text) {
    const done = () => toast("链接已复制");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt("复制这个链接", text));
    else prompt("复制这个链接", text);
  }
  let tt;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("show"), 1600);
  }

  // ---------- routing ----------
  // #/            全部
  // #/nature      某个分类
  // #/photo/<id>  单张照片（可直接分享）
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "photo") {
      const id = decodeURIComponent(parts[1] || "");
      let i = state.list.findIndex((p) => p.id === id);
      if (i < 0) {
        // 直接打开分享链接时，若当前筛选里没有这张，回到“全部”
        state.cat = "all";
        render();
        i = state.list.findIndex((p) => p.id === id);
      }
      if (i >= 0) return showLightbox(i);
      return leave();
    }
    const cat = catByKey[parts[0]] ? parts[0] : "all";
    if (cat !== state.cat || !state.list.length) {
      state.cat = cat;
      render();
    }
    if (!lb.hidden) closeLightbox();
    renderChips();
    const c = catByKey[state.cat];
    document.title = c ? `${c.zh} · ${SITE.title}` : SITE.title;
  }

  window.addEventListener("hashchange", route);
  render();
  route();
})();
