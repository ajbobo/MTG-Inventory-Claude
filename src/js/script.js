/* -------------------------------------------------
   MTG-Inventory – core logic with CosmosDB backend
   ------------------------------------------------- */

const API_ROOT = 'https://api.scryfall.com';
const BACKEND_API = 'http://localhost:3000/api/quantities'; // Change as needed for production

/* ---- UI ELEMENTS ---- */
const setSelect = document.getElementById('setSelect');
const setIconLeft = document.getElementById('setIconLeft');
const setIconRight = document.getElementById('setIconRight');
const tbody = document.querySelector('#cardsTable tbody');

/* ---- State ---- */
let cardsData = [];
let qtyMap = {};
let selectedCardId = null;
let detailRow = null;
let saveTimeout = null;

/* ---- Symbol cache ---- */
let symbolMap = {};

/* -------------------------------------------------
   Helper: Build composite card key from setCode and collector number
   This is the identifier used in CosmosDB: "<setCode>:<collectorNumber>"
   ------------------------------------------------- */
function buildCardKey(setCode, collectorNumber) {
  return `${setCode}:${collectorNumber}`;
}

/* -------------------------------------------------
   Helper: API call wrapper
   ------------------------------------------------- */
async function apiCall(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `API error ${resp.status}` }));
    throw new Error(error.error || `API error ${resp.status}`);
  }
  return resp.json();
}

/* -------------------------------------------------
   Helper: fetch card quantities from backend
   ------------------------------------------------- */
async function getCardQuantity(cardKey) {
  try {
    const qt = await apiCall(`${BACKEND_API}/${encodeURIComponent(cardKey)}`);
    return {
      normal: qt.normal || 0,
      foil: qt.foil || 0,
      prerelease: qt.prerelease || 0,
      autographed: qt.autographed || 0
    };
  }
  catch (err) {
    console.warn(`Could not load quantity for ${cardKey}:`, err.message);
    return { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
  }
}

async function saveCardQuantity(cardKey, cardName, cardSet, quantities) {
  try {
    const total = quantities.normal + quantities.foil + quantities.prerelease + quantities.autographed;

    await apiCall(BACKEND_API, {
      method: 'POST',
      body: JSON.stringify({
        setId: cardSet,
        collectorNumber: cardKey.split(':')[1],
        cardName: cardName,
        quantities: quantities,
      })
    });

    // If total is 0, delete the document from the database
    if (total === 0) {
      try {
        await apiCall(`${BACKEND_API}/${encodeURIComponent(cardKey)}`, { method: 'DELETE' });
      } catch (deleteErr) {
        // Ignore 404 errors (already deleted)
        if (!deleteErr.message.includes('404')) {
          console.warn(`Failed to delete card ${cardKey}:`, deleteErr.message);
        }
      }
    }
  }
  catch (err) {
    console.error('Failed to save quantity:', err);
    throw err;
  }
}

/* -------------------------------------------------
   Debounced save helper
   ------------------------------------------------- */
function scheduleSave(cardKey, cardName, cardSet, quantities) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveCardQuantity(cardKey, cardName, cardSet, quantities);
  }, 500);
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
  if (Object.keys(symbolMap).length > 0) {
    return symbolMap;
  }
  try {
    const data = await fetchJSON(`${API_ROOT}/symbology`);
    data.data.forEach((sym) => {
      symbolMap[sym.symbol] = sym.svg_uri;
    });
  }
  catch (err) {
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
    sets.data.forEach((set) => {
      const opt = document.createElement('option');
      opt.value = set.code;
      opt.textContent = set.name;
      setSelect.appendChild(opt);
    });
  }
  catch (err) {
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
  }
  catch (err) {
    console.error('Failed to fetch set icon:', err);
    return null;
  }
}

/* -------------------------------------------------
   2️⃣ When a set is chosen – load its cards + icon
   ------------------------------------------------- */
setSelect.addEventListener('change', async (e) => {
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
    // Load quantities from backend
    await loadQuantitiesForCards(cards);
    // Render with quantities populated
    renderCards(cards);
  }
  catch (err) {
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
      const cards = r.data.map((card) => ({
        mulename: card.name,
        rarity: card.rarity,
        cost: card.mana_cost || "",
        // Use composite key: setCode:collector_number instead of Scryfall UUID
        cardKey: buildCardKey(setCode, card.collector_number),
        images: card.image_uris,
        card_faces: card.card_faces || null,
        foil: !!card.variants?.includes('foil'),
        altArt: !!card.variants?.includes('alt-art'),
        setCode: setCode,
        collectorNumber: card.collector_number,
        ...card
      }));
      allCards = [...allCards, ...cards];
      url = r.next_page; // This will be null when no more pages
    }
    catch (err) {
      console.error('Error fetching cards page:', err);
      break;
    }
  }

  return allCards;
}

/* -------------------------------------------------
   Bulk fetch quantities for all cards in a set
   ------------------------------------------------- */
async function loadQuantitiesForCards(cards) {
  const cardKeys = cards.map((card) => card.cardKey);
  if (cardKeys.length === 0) return;

  try {
    const results = await apiCall(`${BACKEND_API}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ cardKeys })
    });

    // Store all quantities in memory
    cardKeys.forEach((key) => {
      if (results[key]) {
        qtyMap[key] = results[key];
      }
      else {
        qtyMap[key] = { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
      }
    });
  }
  catch (err) {
    console.error('Failed to bulk load quantities:', err);
    // Initialize all with zeros if API fails
    cardKeys.forEach((key) => {
      qtyMap[key] = qtyMap[key] || { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
    });
  }
}

/* -------------------------------------------------
   Quantity helpers
   ------------------------------------------------- */
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

  tbody.innerHTML = cards.map((card) => {
    const qt = qtyMap[card.cardKey] || { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
    const total = computeTotal(qt);
    const hasSpecial = qt.foil > 0 || qt.prerelease > 0 || qt.autographed > 0;
    const imgSrc = card.images?.normal || (card.card_faces?.[0]?.image_uris?.normal || '');
    const selectedClass = selectedCardId === card.cardKey ? 'selected' : '';
    const costHtml = renderManaCost(card.cost, symbolMap);
    return `
      <tr data-card-key="${card.cardKey}" class="${selectedClass}">
        <td class="number">${card.collector_number || ''}</td>
        <td class="rarity">
          <img src="assets/${card.rarity}.png" alt="${card.rarity}" title="${card.rarity}">
        </td>
        <td>
          ${imgSrc ? `<img src="${imgSrc}" alt="${card.mulename}" style="height:24px;vertical-align:middle;">` : ''}
          <strong>${card.mulename}</strong>
        </td>
        <td class="casting-cost">${costHtml}</td>
        <td class="price">${card.prices?.usd && parseFloat(card.prices.usd) > 1 ? `<strong>${card.prices.usd}</strong>` : card.prices?.usd || '-'}</td>
        <td class="qty">
          ${total > 0 ? `<strong>${total}</strong>` : total}${hasSpecial ? '🌟' : ''}
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
  tr.dataset.detailFor = card.cardKey;

  const qt = qtyMap[card.cardKey] || { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
  let frontUrl = '';
  let backUrl = '';
  if (card.card_faces && card.card_faces.length > 1) {
    frontUrl = card.card_faces[0].image_uris?.normal || '';
    backUrl = card.card_faces[1].image_uris?.normal || '';
  }
  else {
    frontUrl = card.images?.normal || '';
    backUrl = '';
  }

  tr.innerHTML = `
    <td colspan="6">
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
  if (selectedCardId === card.cardKey) {
    // Toggle off
    removeDetailRow();
    selectedCardId = null;
    renderCards(cardsData); // remove highlight
    return;
  }

  // Load quantities from API if not already loaded
  if (!qtyMap[card.cardKey]) {
    getCardQuantity(card.cardKey).then((qt) => {
      qtyMap[card.cardKey] = qt;
      renderCards(cardsData);
      // Now open detail row
      selectedCardId = card.cardKey;
      renderCards(cardsData);
      removeDetailRow();
      const parent = tbody;
      const row = parent.querySelector(`tr[data-card-key="${card.cardKey}"]`);
      if (row) {
        detailRow = createDetailRow(card);
        row.after(detailRow);
      }
    });
    return;
  }

  selectedCardId = card.cardKey;
  renderCards(cardsData); // update highlights

  // Remove any existing detail row and insert new one after the clicked row
  removeDetailRow();
  const parent = tbody;
  const row = parent.querySelector(`tr[data-card-key="${card.cardKey}"]`);
  if (row) {
    detailRow = createDetailRow(card);
    row.after(detailRow);
  }
}

/* -------------------------------------------------
   7️⃣ Event handling for table clicks
   ------------------------------------------------- */
tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-card-key]');
  if (tr) {
    const cardKey = tr.dataset.cardKey;
    const card = cardsData.find((c) => c.cardKey === cardKey);
    if (card) {
      selectCard(card);
    }
  }
});

/* -------------------------------------------------
   8️⃣ Variant input change handling
   ------------------------------------------------- */
tbody.addEventListener('change', (e) => {
  if (e.target.matches('input[data-variant]') && selectedCardId) {
    const variant = e.target.dataset.variant;
    const value = parseInt(e.target.value) || 0;

    if (!qtyMap[selectedCardId]) {
      qtyMap[selectedCardId] = { normal: 0, foil: 0, prerelease: 0, autographed: 0 };
    }
    qtyMap[selectedCardId][variant] = value;

    const total = computeTotal(qtyMap[selectedCardId]);

    // Update the total in the detail row
    const totalEl = detailRow?.querySelector('.total-info strong');
    if (totalEl) totalEl.textContent = total;

    // Update the table row quantity cell
    const row = tbody.querySelector(`tr[data-card-key="${selectedCardId}"]`);
    if (row) {
      const hasSpecial = qtyMap[selectedCardId].foil > 0 ||
                        qtyMap[selectedCardId].prerelease > 0 ||
                        qtyMap[selectedCardId].autographed > 0;
      row.querySelector('.qty').textContent = `${total}${hasSpecial ? '🌟' : ''}`;
    }

    // Get card metadata for API call
    const card = cardsData.find(c => c.cardKey === selectedCardId);
    if (card) {
      scheduleSave(selectedCardId, card.mulename, card.setCode, qtyMap[selectedCardId]);
    }
  }
});

/* -------------------------------------------------
   9️⃣ Initial load
   ------------------------------------------------- */
// No need to load quantities explicitly - they'll be fetched on-demand when cards are displayed
populateSets();
