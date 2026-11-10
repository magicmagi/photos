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

  // ---------- 语言 ----------
  // 默认跟随访客的系统/浏览器语言：中文显示中文，其他语言显示英文；右上角按钮可手动切换
  const TEXT = {
    zh: {
      all: "全部", newest: "最新优先", oldest: "最早优先", byYear: "按年份", flat: "平铺",
      sortTip: "切换排序", viewTip: "切换视图", langTip: "Switch to English", langBtn: "EN",
      about: "关于", photos: (n) => `${n} 张照片`, count: (n) => `${n} 张`,
      empty: "这个分类还没有照片", unknownYear: "未知年份", photo: "照片", untitled: "未命名",
      camera: "相机", lens: "镜头", focal: "焦距", aperture: "光圈", shutter: "快门", size: "原图尺寸",
      locked: "🔒 原图与拍摄参数需要密码", pwPlaceholder: "输入密码", unlock: "解锁", unlocking: "解锁中…",
      noExif: "这张照片没有拍摄参数", copyLink: "复制链接", share: "分享",
      viewOrig: "查看原图", downloadOrig: "下载原图", loadingOrig: "加载原图…", origFailed: "原图加载失败",
      cantRead: (p) => `无法读取 ${p}`, needHttps: "需要通过 https 打开网页才能解锁",
      wrongPw: "密码不对，请重试", unlocked: "已解锁，本页关闭前都有效", unlockFailed: "解锁失败",
      copied: "链接已复制", copyPrompt: "复制这个链接", close: "关闭", prev: "上一张", next: "下一张",
    },
    en: {
      all: "All", newest: "Newest first", oldest: "Oldest first", byYear: "By year", flat: "Grid",
      sortTip: "Change sort order", viewTip: "Change view", langTip: "切换到中文", langBtn: "中文",
      about: "About", photos: (n) => `${n} photos`, count: (n) => `${n}`,
      empty: "No photos in this category yet", unknownYear: "Undated", photo: "Photo", untitled: "Untitled",
      camera: "Camera", lens: "Lens", focal: "Focal length", aperture: "Aperture", shutter: "Shutter", size: "Original size",
      locked: "🔒 Password required for the original and shooting details", pwPlaceholder: "Password", unlock: "Unlock", unlocking: "Unlocking…",
      noExif: "No shooting details for this photo", copyLink: "Copy link", share: "Share",
      viewOrig: "View original", downloadOrig: "Download original", loadingOrig: "Loading original…", origFailed: "Couldn't load the original",
      cantRead: (p) => `Couldn't read ${p}`, needHttps: "Open this page over https to unlock",
      wrongPw: "Wrong password, try again", unlocked: "Unlocked until you close this page", unlockFailed: "Couldn't unlock",
      copied: "Link copied", copyPrompt: "Copy this link", close: "Close", prev: "Previous", next: "Next",
    },
  };
  const detectLang = () => {
    const first = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    return first.toLowerCase().startsWith("zh") ? "zh" : "en";
  };
  let lang = store.get("lang", "") in TEXT ? store.get("lang", "") : detectLang();
  const T = (k, ...a) => (typeof TEXT[lang][k] === "function" ? TEXT[lang][k](...a) : TEXT[lang][k]);
  // config.js 里的文字可以写成 "文字" 或 { zh: "中文", en: "English" }
  const L = (v) => (v && typeof v === "object" ? v[lang] || v.zh || v.en || "" : v || "");
  // 照片的标题/地点/描述：英文界面优先用 captions.json 里的 title_en / location_en / desc_en
  const F = (p, k) => (lang === "en" && p[`${k}_en`]) || p[k] || "";
  const catName = (c) => c[lang] || c.zh || c.en || c.key;

  // ---------- header ----------
  function renderStatic() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    $("site-name").textContent = L(SITE.name);
    $("site-title").textContent = L(SITE.title);
    $("site-tagline").textContent = L(SITE.tagline);
    $("site-about").textContent = L(SITE.about);
    $("about-title").textContent = T("about");
    $("foot-name").textContent = `© ${new Date().getFullYear()} ${L(SITE.name)}`;
    $("foot-count").textContent = T("photos", PHOTOS.length);
    $("site-links").innerHTML = SITE.links
      .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${esc(L(l.label))}</a>`)
      .join("");
    $("sort-btn").title = T("sortTip");
    $("view-btn").title = T("viewTip");
    $("lang-btn").title = T("langTip");
    $("lang-btn").textContent = T("langBtn");
    $("lb-close").setAttribute("aria-label", T("close"));
    $("lb-prev").setAttribute("aria-label", T("prev"));
    $("lb-next").setAttribute("aria-label", T("next"));
  }

  const fmtDate = (t) => {
    if (!t) return "";
    const d = new Date(t);
    return lang === "zh"
      ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
      : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };
  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- chips ----------
  function renderChips() {
    const counts = {};
    PHOTOS.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    const items = [{ key: "all", zh: TEXT.zh.all, en: TEXT.en.all, n: PHOTOS.length }, ...CATS.map((c) => ({ ...c, n: counts[c.key] || 0 }))];
    $("chips").innerHTML = items
      .map(
        (c) =>
          `<button class="chip" role="tab" data-cat="${c.key}" aria-selected="${state.cat === c.key}">${esc(catName(c))}<span class="n">${c.n}</span></button>`
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
    $("sort-btn").innerHTML = state.sort === "new" ? `↓ <span class='lbl'>${T("newest")}</span>` : `↑ <span class='lbl'>${T("oldest")}</span>`;
    $("view-btn").innerHTML = state.view === "timeline" ? `▤ <span class='lbl'>${T("byYear")}</span>` : `▦ <span class='lbl'>${T("flat")}</span>`;
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
  $("lang-btn").onclick = () => {
    lang = lang === "zh" ? "en" : "zh";
    store.set("lang", lang);
    renderStatic();
    render();
    if (state.open >= 0) renderInfo();
    setTitle();
  };

  // ---------- gallery ----------
  function tile(p, i) {
    const r = (p.w / p.h).toFixed(4);
    const cap = [F(p, "location"), fmtDate(p.t)].filter(Boolean).join(" · ");
    return `<figure class="tile" tabindex="0" data-i="${i}" style="flex-grow:${r};width:calc(var(--row) * ${r});aspect-ratio:${p.w}/${p.h}">
      <img src="${p.thumb || p.src}" alt="${esc(F(p, "title"))}" loading="lazy" onload="this.classList.add('loaded')">
      <figcaption>${esc(F(p, "title"))}<small>${esc(cap)}</small></figcaption>
    </figure>`;
  }

  function render() {
    renderChips();
    renderControls();
    const dir = state.sort === "new" ? -1 : 1;
    state.list = PHOTOS.filter((p) => state.cat === "all" || p.category === state.cat).sort((a, b) => dir * (a.t - b.t));

    const g = $("gallery");
    if (!state.list.length) {
      g.innerHTML = `<p class="empty">${T("empty")}</p>`;
      return;
    }
    if (state.view === "grid") {
      g.innerHTML = `<div class="rows">${state.list.map(tile).join("")}</div>`;
    } else {
      const groups = [];
      state.list.forEach((p, i) => {
        const y = p.t ? new Date(p.t).getFullYear() : T("unknownYear");
        if (!groups.length || groups.at(-1).y !== y) groups.push({ y, items: [] });
        groups.at(-1).items.push(tile(p, i));
      });
      g.innerHTML = groups
        .map((gr) => `<div class="group-head"><h2>${gr.y}</h2><span>${T("count", gr.items.length)}</span></div><div class="rows">${gr.items.join("")}</div>`)
        .join("");
    }
    setTitle();
  }

  function setTitle() {
    const site = L(SITE.title);
    const p = state.open >= 0 && state.list[state.open];
    const c = catByKey[state.cat];
    document.title = p ? `${F(p, "title") || T("photo")} · ${site}` : c ? `${catName(c)} · ${site}` : site;
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
    img.alt = F(p, "title");
    renderInfo();
    setTitle();
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
          [T("camera"), ex.camera], [T("lens"), ex.lens], [T("focal"), ex.focal],
          [T("aperture"), ex.aperture], [T("shutter"), ex.shutter], ["ISO", ex.iso],
          [T("size"), ex.w && `${ex.w} × ${ex.h}`],
        ].filter((r) => r[1])
      : [];
    const locked = !vault.key
      ? `<form class="lb-lock" id="lb-lock">
          <label for="lb-pw">${T("locked")}</label>
          <div><input id="lb-pw" type="password" autocomplete="current-password" placeholder="${T("pwPlaceholder")}"><button>${T("unlock")}</button></div>
          <p class="err">${esc(error)}</p>
        </form>`
      : `${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<p class="desc">${T("noExif")}</p>`}`;
    $("lb-info").innerHTML = `
      <div class="cat">${c ? esc(catName(c)) : ""}</div>
      <h3>${esc(F(p, "title") || F(p, "location") || (c ? catName(c) : T("untitled")))}</h3>
      <p class="meta">${esc([F(p, "location"), fmtDate(p.t)].filter(Boolean).join(" · "))}</p>
      ${F(p, "desc") ? `<p class="desc">${esc(F(p, "desc"))}</p>` : ""}
      ${locked}
      <div class="lb-actions">
        <button id="lb-copy">${T("copyLink")}</button>
        ${navigator.share ? `<button id="lb-share">${T("share")}</button>` : ""}
        ${vault.key ? `<button id="lb-orig">${vault.url ? T("downloadOrig") : T("viewOrig")}</button>` : ""}
      </div>
      <div class="lb-pos">${state.open + 1} / ${state.list.length}</div>`;
    $("lb-copy").onclick = () => copy(photoUrl(p));
    const sh = $("lb-share");
    if (sh) sh.onclick = () => navigator.share({ title: F(p, "title"), url: photoUrl(p) }).catch(() => {});
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
    if (!r.ok) throw new Error(T("cantRead", path));
    return new Uint8Array(await r.arrayBuffer());
  };
  const decrypt = (key, buf) => crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));

  async function unlock(pw) {
    if (!pw) return;
    const btn = document.querySelector("#lb-lock button");
    if (btn) { btn.disabled = true; btn.textContent = T("unlocking"); }
    try {
      if (!crypto.subtle) throw new Error(T("needHttps"));
      const info = await fetch("secure/key.json").then((r) => r.json());
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: b64(info.salt), iterations: info.iterations, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
      );
      try {
        await decrypt(key, b64(info.check));
      } catch {
        return renderInfo(T("wrongPw"));
      }
      vault.meta = JSON.parse(new TextDecoder().decode(await decrypt(key, await fetchBuf("secure/meta.bin"))));
      vault.key = key;
      renderInfo();
      toast(T("unlocked"));
    } catch (err) {
      renderInfo(err.message || T("unlockFailed"));
    }
  }

  async function showOriginal(p) {
    const ob = $("lb-orig");
    ob.disabled = true;
    ob.textContent = T("loadingOrig");
    try {
      const data = await decrypt(vault.key, await fetchBuf(`secure/${p.id}.bin`));
      if (state.list[state.open] !== p) return; // 加载期间翻到了别的照片
      releaseOriginal();
      vault.url = URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
      $("lb-img").src = vault.url;
      renderInfo();
    } catch {
      ob.disabled = false;
      ob.textContent = T("viewOrig");
      toast(T("origFailed"));
    }
  }

  function downloadOriginal(p) {
    const a = document.createElement("a");
    a.href = vault.url;
    a.download = `${F(p, "title") || p.id}.jpg`;
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
    const done = () => toast(T("copied"));
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt(T("copyPrompt"), text));
    else prompt(T("copyPrompt"), text);
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
    setTitle();
  }

  window.addEventListener("hashchange", route);
  renderStatic();
  render();
  route();
})();
