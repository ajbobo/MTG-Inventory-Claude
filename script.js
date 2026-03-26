/* -------------------------------------------------
   MTG-Inventory – core logic
   ------------------------------------------------- */

const API_ROOT = "https://api.scryfall.com";

/* ---- UI ELEMENTS ---- */
const setSelect = document.getElementById("setSelect");
const setIconLeft = document.getElementById("setIconLeft");
const setIconRight = document.getElementById("setIconRight");
const tbody = document.querySelector("#cardsTable tbody");

/* ---- State ---- */
let cardsData = [];
let qtyMap = {};
let selectedCardId = null;
let detailRow = null;
const STORAGE_KEY = "mtg-inventory-quantities";

/* ---- Symbol cache ---- */
let symbolMap = {};

/* -------------------------------------------------
   Helper: load saved quantities from localStorage
   ------------------------------------------------- */
function loadQuantities() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      Object.keys(parsed).forEach(cardId => {
        const val = parsed[cardId];
        if (typeof val === 'number') {
          parsed[cardId] = { normal: val, foil: 0, prerelease: 0, autographed: 0 };
        } else if (typeof val === 'object' && val !== null) {
          parsed[cardId] = {
            normal: val.normal || 0,
            foil: val.foil || 0,
            prerelease: val.prerelease || 0,
            autographed: val.autographed || 0
          };
        }
      });
      qtyMap = parsed;
    } catch (e) {
      console.error('Failed to parse stored quantities', e);
      qtyMap = {};
    }
  }
}
function saveQuantities() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(qtyMap));
}

/* -------------------------------------------------
   Helper: fetch JSON with error handling
   ------------------------------------------------- */
async function fetchJSON(url, opts = {}) {
  const resp = await fetch(url, opts);
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  return resp.json();
}

/* -------------------------------------------------
   Helper: fetch and cache mana symbols
   ------------------------------------------------- */
async function fetchSymbols() {
  if (Object.keys(symbolMap).length > 0) return symbolMap;
  try {
    const data = await fetchJSON(`${API_ROOT}/symbology`);
    data.data.forEach(sym => {
      symbolMap[sym._symbol] = sym.image_uris?.svg || sym.image_uris?.png;
    });
  } catch (err) {
    console.error('Failed to fetch symbology:', err);
  }
  return symbolMap;
}

/* -------------------------------------------------
   Helper: convert mana cost string to HTML with symbols
   ------------------------------------------------- */
function renderManaCost(cost, symbols) {
  if (!cost) return '';
  return cost.replace(/\{[^}]+\}/g, (match) => {
    const url = symbols[match];
    if (url) {
      return `<img src="${url}" alt="${match}" class="mana-symbol" style="height:20px;vertical-align:middle;">`;
    }
    return match;
  });
}

/* -------------------------------------------------
   1️⃣ Populate the Set dropdown
   ------------------------------------------------- */
async function populateSets() {
  try {
    const sets = await fetchJSON(`${API_ROOT}/sets`);
    sets.data.forEach(set => {
      const opt = document.createElement("option");
      opt.value = set.code;
      opt.textContent = set.name;
      setSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load sets:', err);
    alert('Could not load MTG sets. Please check your internet connection.');
  }
}

/* -------------------------------------------------
   Helper: fetch set icon SVG URI
   ------------------------------------------------- */
async function fetchSetIcon(setCode) {
  try {
    const setData = await fetchJSON(`${API_ROOT}/sets/${setCode}`);
    return setData.icon_svg_uri;
  } catch (err) {
    console.error('Failed to fetch set icon:', err);
    return null;
  }
}

/* -------------------------------------------------
   2️⃣ When a set is chosen – load its cards + icon
   ------------------------------------------------- */
setSelect.addEventListener("change", async e => {
  const setCode = e.currentTarget.value;
  selectedCardId = null;
  removeDetailRow();
  tbody.innerHTML = "";
  setIconLeft.innerHTML = "";
  setIconRight.innerHTML = "";

  if (!setCode) return;

  const selectedOption = e.currentTarget.options[e.currentTarget.selectedIndex];
  if (!selectedOption) return;
  const selectedText = selectedOption.textContent;

  // Fetch set icon
  const iconUrl = await fetchSetIcon(setCode);
  if (iconUrl) {
    const altText = selectedText || 'MTG Set icon';
    const iconHtml = `<img src="${iconUrl}" alt="${altText} icon" style="width:32px;height:32px;">`;
    setIconLeft.innerHTML = iconHtml;
    setIconRight.innerHTML = iconHtml;
  }

  // Fetch cards for that set
  try {
    const cards = await fetchAllCards(setCode);
    renderCards(cards);
  } catch (err) {
    console.error('Failed to load cards:', err);
    alert('Failed to load cards for that set.');
    tbody.innerHTML = "";
  }
});

/* -------------------------------------------------
   2a️⃣ Fetch all cards in a given set (with pagination)
   ------------------------------------------------- */
async function fetchAllCards(setCode) {
  let url = `${API_ROOT}/cards/search?q=set:${setCode}&order=set`;
  let allCards = [];

  while (url) {
    try {
      const r = await fetchJSON(url);
      const cards = r.data.map(card => ({
        mulename: card.name,
        rarity: card.rarity,
        cost: card.mana_cost || "",
        id: card.id,
        images: card.image_uris,
        card_faces: card.card_faces || null,
        foil: !!card.variants?.includes("foil"),
        altArt: !!card.variants?.includes("alt-art"),
        ...card
      }));
      allCards = [...allCards, ...cards];
      url = r.next_page; // This will be null when no more pages
    } catch (err) {
      console.error('Error fetching cards page:', err);
      break;
    }
  }

  return allCards;
}

/* -------------------------------------------------
   Quantity helpers
   ------------------------------------------------- */
function getCardQuantities(cardId) {
  return qtyMap[cardId] || { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
}
function computeTotal(qt) {
  return (qt.normal || 0) + (qt.foil || 0) + (qt.prerelease || 0) + (qt.autographed || 0);
}

/* -------------------------------------------------
   3️⃣ Render the table rows
   ------------------------------------------------- */
function renderCards(cards) {
  cardsData = cards;
  // Pre-fetch symbols if not already loaded
  if (Object.keys(symbolMap).length === 0) {
    fetchSymbols().then(() => renderCards(cards)); // re-render when symbols arrive
    return;
  }

  tbody.innerHTML = cards.map(card => {
    const qt = getCardQuantities(card.id);
    const total = computeTotal(qt);
    const hasSpecial = qt.foil > 0 || qt.prerelease > 0 || qt.autographed > 0;
    const imgSrc = card.images?.normal || (card.card_faces?.[0]?.image_uris?.normal || '');
    const selectedClass = selectedCardId === card.id ? 'selected' : '';
    const costHtml = renderManaCost(card.cost, symbolMap);
    return `
      <tr data-card-id="${card.id}" class="${selectedClass}">
        <td class="number">${card.collector_number || ''}</td>
        <td>
          ${imgSrc ? `<img src="${imgSrc}" alt="${card.mulename}" style="height:24px;vertical-align:middle;">` : ''}
          <strong>${card.mulename}</strong>
        </td>
        <td class="rarity">${card.rarity}</td>
        <td class="casting-cost">${costHtml}</td>
        <td class="price">${card.prices?.usd || '-'}</td>
        <td class="qty">
          ${total}${hasSpecial ? '🌟' : ''}
        </td>
      </tr>`;
  }).join('');
}

/* -------------------------------------------------
   4️⃣ Remove existing detail row
   ------------------------------------------------- */
function removeDetailRow() {
  if (detailRow) {
    detailRow.remove();
    detailRow = null;
  }
}

/* -------------------------------------------------
   5️⃣ Create/insert detail row inline
   ------------------------------------------------- */
function createDetailRow(card) {
  const tr = document.createElement('tr');
  tr.className = 'card-detail-row';
  tr.dataset.detailFor = card.id;

  const qt = getCardQuantities(card.id);
  let frontUrl = '';
  let backUrl = '';
  if (card.card_faces && card.card_faces.length > 1) {
    frontUrl = card.card_faces[0].image_uris?.normal || '';
    backUrl = card.card_faces[1].image_uris?.normal || '';
  } else {
    frontUrl = card.images?.normal || '';
    backUrl = '';
  }

  tr.innerHTML = `
    <td colspan="4">
      <div class="detail-content">
        <div class="detail-images">
          <img src="${frontUrl}" alt="${card.mulename} front" class="detail-card-image">
          ${backUrl ? `<img src="${backUrl}" alt="${card.mulename} back" class="detail-card-image">` : ''}
        </div>
        <div class="detail-variants">
          <h4>${card.mulename}</h4>
          <div class="variant-row">
            <label>Normal:</label>
            <input type="number" data-variant="normal" min="0" value="${qt.normal}">
          </div>
          <div class="variant-row">
            <label>Foil:</label>
            <input type="number" data-variant="foil" min="0" value="${qt.foil}">
            <span class="variant-emoji">🌟</span>
          </div>
          <div class="variant-row">
            <label>Prerelease:</label>
            <input type="number" data-variant="prerelease" min="0" value="${qt.prerelease}">
            <span class="variant-emoji">⭐</span>
          </div>
          <div class="variant-row">
            <label>Autographed:</label>
            <input type="number" data-variant="autographed" min="0" value="${qt.autographed}">
            <span class="variant-emoji">✨</span>
          </div>
          <div class="total-info">
            Total: <strong>${computeTotal(qt)}</strong>
          </div>
        </div>
      </div>
    </td>
  `;
  return tr;
}

/* -------------------------------------------------
   6️⃣ Select a card to show details (toggle)
   ------------------------------------------------- */
function selectCard(card) {
  if (selectedCardId === card.id) {
    // Toggle off
    removeDetailRow();
    selectedCardId = null;
    renderCards(cardsData); // remove highlight
    return;
  }

  selectedCardId = card.id;
  renderCards(cardsData); // update highlights

  // Remove any existing detail row and insert new one after the clicked row
  removeDetailRow();
  const parent = tbody;
  const row = parent.querySelector(`tr[data-card-id="${card.id}"]`);
  if (row) {
    detailRow = createDetailRow(card);
    row.after(detailRow);
  }
}

/* -------------------------------------------------
   7️⃣ Event handling for table clicks
   ------------------------------------------------- */
tbody.addEventListener("click", e => {
  const tr = e.target.closest("tr[data-card-id]");
  if (tr) {
    const cardId = tr.dataset.cardId;
    const card = cardsData.find(c => c.id === cardId);
    if (card) {
      selectCard(card);
    }
  }
});

/* -------------------------------------------------
   8️⃣ Variant input change handling
   ------------------------------------------------- */
tbody.addEventListener("change", e => {
  if (e.target.matches('input[data-variant]') && selectedCardId) {
    const variant = e.target.dataset.variant;
    const value = parseInt(e.target.value) || 0;
    if (!qtyMap[selectedCardId]) {
      qtyMap[selectedCardId] = { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
    }
    qtyMap[selectedCardId][variant] = value;
    saveQuantities();

    const qt = getCardQuantities(selectedCardId);
    const total = computeTotal(qt);

    // Update the total in the detail row
    const totalEl = detailRow?.querySelector('.total-info strong');
    if (totalEl) totalEl.textContent = total;

    // Update the table row quantity cell
    const row = tbody.querySelector(`tr[data-card-id="${selectedCardId}"]`);
    if (row) {
      const hasSpecial = qt.foil > 0 || qt.prerelease > 0 || qt.autographed > 0;
      row.querySelector('.qty').textContent = `${total}${hasSpecial ? '🌟' : ''}`;
    }
  }
});

/* -------------------------------------------------
   9️⃣ Initial load
   ------------------------------------------------- */
loadQuantities();
populateSets();
