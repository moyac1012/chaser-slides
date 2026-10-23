// スライドビューア：拡大縮小・ページ送り・ノート・一覧表示・全画面。
// 状態は currentIndex だけを持ち、表示の更新は render() に集約する。
(() => {
  "use strict";

  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;
  const SWIPE_THRESHOLD = 40;

  const stage = document.getElementById("stage");
  const canvas = document.getElementById("canvas");
  const counter = document.getElementById("counter");
  const notesPanel = document.getElementById("notes");
  const notesText = document.getElementById("notes-text");
  const overview = document.getElementById("overview");
  const slides = Array.from(canvas.querySelectorAll(".slide"));

  let currentIndex = 0;

  // ---------- 表示 ----------

  function fitCanvasToStage() {
    const scale = Math.min(stage.clientWidth / CANVAS_WIDTH, stage.clientHeight / CANVAS_HEIGHT);
    canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function showActiveSlide() {
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === currentIndex));
  }

  function updateCounter() {
    counter.textContent = `${currentIndex + 1} / ${slides.length}`;
  }

  function readNotes(slide) {
    const aside = slide.querySelector("section > aside");
    return aside ? aside.textContent.trim() : "";
  }

  function updateNotes() {
    const text = readNotes(slides[currentIndex]);
    notesText.textContent = text || "（このスライドにノートはありません）";
  }

  function updateHash() {
    history.replaceState(null, "", `#${currentIndex + 1}`);
  }

  function render() {
    showActiveSlide();
    updateCounter();
    updateNotes();
    updateHash();
  }

  // ---------- ページ送り ----------

  function goTo(index) {
    currentIndex = Math.max(0, Math.min(slides.length - 1, index));
    render();
  }

  function goNext() { goTo(currentIndex + 1); }
  function goPrev() { goTo(currentIndex - 1); }
  function goFirst() { goTo(0); }
  function goLast() { goTo(slides.length - 1); }

  function indexFromHash() {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isFinite(n) ? n - 1 : 0;
  }

  // ---------- パネル ----------

  function setPressed(action, pressed) {
    const button = document.querySelector(`[data-action="${action}"]`);
    if (button) button.setAttribute("aria-pressed", String(pressed));
  }

  function toggleNotes() {
    notesPanel.hidden = !notesPanel.hidden;
    setPressed("notes", !notesPanel.hidden);
  }

  function buildOverviewItem(slide, index) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "overview__item";
    item.dataset.index = String(index);

    const frame = document.createElement("div");
    frame.className = "overview__frame";
    const clone = slide.cloneNode(true);
    clone.classList.remove("is-active");
    frame.appendChild(clone);

    const label = document.createElement("span");
    label.className = "overview__label";
    label.textContent = `${index + 1}`;

    item.append(frame, label);
    item.addEventListener("click", () => {
      closeOverview();
      goTo(index);
    });
    return item;
  }

  function buildOverview() {
    if (overview.childElementCount > 0) return;
    slides.forEach((slide, i) => overview.appendChild(buildOverviewItem(slide, i)));
  }

  function scaleOverviewThumbs() {
    overview.querySelectorAll(".overview__frame").forEach((frame) => {
      const scale = frame.clientWidth / CANVAS_WIDTH;
      frame.firstElementChild.style.transform = `scale(${scale})`;
    });
  }

  function markCurrentInOverview() {
    overview.querySelectorAll(".overview__item").forEach((item) => {
      item.classList.toggle("is-current", Number(item.dataset.index) === currentIndex);
    });
  }

  function openOverview() {
    buildOverview();
    overview.hidden = false;
    setPressed("overview", true);
    scaleOverviewThumbs();
    markCurrentInOverview();
  }

  function closeOverview() {
    overview.hidden = true;
    setPressed("overview", false);
  }

  function toggleOverview() {
    if (overview.hidden) openOverview();
    else closeOverview();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  // ---------- 入力 ----------

  const ACTIONS = {
    prev: goPrev,
    next: goNext,
    notes: toggleNotes,
    overview: toggleOverview,
    fullscreen: toggleFullscreen,
  };

  const KEY_BINDINGS = {
    ArrowRight: goNext,
    ArrowDown: goNext,
    PageDown: goNext,
    " ": goNext,
    ArrowLeft: goPrev,
    ArrowUp: goPrev,
    PageUp: goPrev,
    Home: goFirst,
    End: goLast,
    n: toggleNotes,
    o: toggleOverview,
    f: toggleFullscreen,
    Escape: closeOverview,
  };

  function handleKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const handler = KEY_BINDINGS[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  }

  function handleToolbarClick(event) {
    const button = event.target.closest("[data-action]");
    if (button) ACTIONS[button.dataset.action]?.();
  }

  function bindSwipe() {
    let startX = null;
    stage.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (dx <= -SWIPE_THRESHOLD) goNext();
      if (dx >= SWIPE_THRESHOLD) goPrev();
      startX = null;
    });
  }

  function handleResize() {
    fitCanvasToStage();
    if (!overview.hidden) scaleOverviewThumbs();
  }

  // ---------- 起動 ----------

  function isThumbMode() {
    return new URLSearchParams(location.search).has("thumb");
  }

  function startThumbMode() {
    document.body.classList.add("is-thumb");
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === 0));
    fitCanvasToStage();
    window.addEventListener("resize", fitCanvasToStage);
  }

  function startViewer() {
    document.addEventListener("keydown", handleKeydown);
    document.getElementById("toolbar").addEventListener("click", handleToolbarClick);
    window.addEventListener("resize", handleResize);
    window.addEventListener("hashchange", () => goTo(indexFromHash()));
    bindSwipe();
    fitCanvasToStage();
    goTo(indexFromHash());
  }

  if (isThumbMode()) startThumbMode();
  else startViewer();
})();
