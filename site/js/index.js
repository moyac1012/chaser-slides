// 一覧ページのキーワード絞り込み。
(() => {
  "use strict";

  const input = document.getElementById("deck-search");
  const cards = Array.from(document.querySelectorAll("#deck-grid .card"));
  const emptyMessage = document.getElementById("deck-empty");

  function normalize(text) {
    return text.toLowerCase().normalize("NFKC");
  }

  function matches(card, query) {
    return normalize(card.dataset.search ?? "").includes(query);
  }

  function applyFilter() {
    const query = normalize(input.value.trim());
    let visibleCount = 0;
    cards.forEach((card) => {
      const visible = query === "" || matches(card, query);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    emptyMessage.hidden = visibleCount > 0;
  }

  input.addEventListener("input", applyFilter);
})();
