const SHEET_ID = '1Ammisk3_X2bn9EAeUOHahhQkL2O8eoaNu2cIQn3SV5A';
const SOURCES = {
  clubs: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Approved%20Clubs`,
  players: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Approved%20Players`
};
const copy = {
  clubs: { description: 'Khám phá các CLB và kèo đang tìm thêm người chơi.', label: 'CÁC CLB ĐANG TUYỂN', title: 'Lên kèo cùng hội mới.', search: 'Tìm theo CLB, sân hoặc khu vực…', intent: 'Đang tìm', count: 'CLB / kèo đang hiển thị', empty: 'Chưa có CLB phù hợp.' },
  players: { description: 'Xem những người chơi đang muốn tìm một hội tennis hợp gu.', label: 'NGƯỜI CHƠI ĐANG TÌM CLB', title: 'Tìm thêm một người chơi.', search: 'Tìm theo tên, trình độ hoặc khu vực…', intent: 'Nội dung', count: 'người chơi đang hiển thị', empty: 'Chưa có người chơi phù hợp.' }
};
const el = id => document.getElementById(id);
const grid = el('listing-grid'), empty = el('empty-state'), dialog = el('listing-dialog'), detail = el('listing-detail');
const searchInput = el('search-input'), cityFilter = el('city-filter'), districtFilter = el('district-filter'), timeFilter = el('time-filter'), intentFilter = el('intent-filter'), levelFilter = el('level-filter'), dayFilter = el('day-filter'), formatFilter = el('format-filter'), groupFilter = el('group-filter'), clearButton = el('clear-filters');
let mode = 'clubs';
let listings = { clubs: [], players: [] };

const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const split = value => String(value || '').split(/[,|]/).map(item => item.trim()).filter(Boolean);
const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
const safeUrl = value => { const raw = String(value || '').trim(); if (!raw) return ''; if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw; if (/^[+\d\s()-]{7,}$/.test(raw)) return `tel:${raw.replace(/[^+\d]/g, '')}`; return `https://${raw}`; };

function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; if (row.length || cell) { row.push(cell); rows.push(row); row = []; cell = ''; } }
    else cell += char;
  }
  if (row.length || cell) { row.push(cell); rows.push(row); }
  return rows.slice(1);
}

function normaliseClub(row, index) {
  return { id: `club-${index}`, kind: 'club', name: row[9], city: row[10], district: row[11], days: row[12], times: row[13], groupType: row[14], status: row[15] || 'Đang cập nhật', details: row[16], description: row[17], venue: row[18], levels: row[19], format: row[20], cost: row[21], contact: row[22], contactMethod: row[24] || 'Liên hệ host', verified: row[26] };
}
function normalisePlayer(row, index) {
  return { id: `player-${index}`, kind: 'player', name: row[23] || 'Người chơi Rally Up', city: row[3], district: row[4], days: row[5], times: row[6], levels: row[7], format: row[8], contact: row[22], contactMethod: row[24] || 'Liên hệ', verified: row[26] };
}
function approved(rows, normaliser) { return rows.map(normaliser).filter(item => item.name && item.city); }
function current() { return listings[mode] || []; }

function addOptions(select, values, placeholder) {
  const before = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach(value => select.add(new Option(value, value)));
  select.value = values.includes(before) ? before : '';
}
function populateFilters() {
  const data = current();
  addOptions(cityFilter, unique(data.map(item => item.city)), 'Tất cả tỉnh, thành');
  addOptions(districtFilter, unique(data.filter(item => !cityFilter.value || item.city === cityFilter.value).map(item => item.district)), 'Tất cả quận, huyện');
  addOptions(timeFilter, unique(data.map(item => item.times)), 'Mọi khung giờ');
  addOptions(intentFilter, unique(data.map(item => mode === 'clubs' ? item.status : item.format)), 'Tất cả');
  addOptions(levelFilter, unique(data.flatMap(item => split(item.levels))), 'Tất cả trình độ');
  addOptions(dayFilter, unique(data.map(item => item.days)), 'Mọi ngày');
  addOptions(formatFilter, unique(data.map(item => item.format)), 'Tất cả nội dung');
  addOptions(groupFilter, unique(data.map(item => item.groupType)), mode === 'clubs' ? 'Tất cả loại nhóm' : 'Không áp dụng');
  groupFilter.disabled = mode === 'players';
}
function visibleListings() {
  const query = searchInput.value.trim().toLowerCase();
  return current().filter(item => {
    const haystack = [item.name,item.city,item.district,item.venue,item.description,item.status,item.levels,item.format,item.days,item.times].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!cityFilter.value || item.city === cityFilter.value) && (!districtFilter.value || item.district === districtFilter.value) && (!timeFilter.value || item.times === timeFilter.value) && (!intentFilter.value || (mode === 'clubs' ? item.status : item.format) === intentFilter.value) && (!levelFilter.value || split(item.levels).includes(levelFilter.value)) && (!dayFilter.value || item.days === dayFilter.value) && (!formatFilter.value || item.format === formatFilter.value) && (!groupFilter.value || item.groupType === groupFilter.value);
  });
}
function pillText(item) { return mode === 'clubs' ? item.status : `${item.levels || 'Trình độ đang cập nhật'}`; }
function card(item, index) {
  const location = [item.venue, [item.district, item.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const subtitle = mode === 'clubs' ? location : [item.days, item.times].filter(Boolean).join(' · ');
  const tag = mode === 'clubs' ? split(item.levels)[0] : item.format;
  const levelClass = String(split(item.levels)[0]).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  return `<article class="listing-card" data-id="${escapeHtml(item.id)}"><div class="card-top"><span class="pill${mode === 'players' ? ` level-${escapeHtml(levelClass)}` : ''}">${escapeHtml(pillText(item))}</span></div><h3>${escapeHtml(item.name)}</h3><p class="location">${escapeHtml(subtitle || 'Thông tin đang cập nhật')}</p><div class="detail-line">${tag ? `<span class="mini-tag${mode === 'clubs' ? ` level-${escapeHtml(levelClass)}` : ''}">${escapeHtml(tag)}</span>` : '<span></span>'}<button class="view-detail" type="button" data-id="${escapeHtml(item.id)}">Xem chi tiết →</button></div></article>`;
}
function render() {
  const visible = visibleListings(), text = copy[mode];
  el('result-count').textContent = `${visible.length} ${visible.length === 1 ? text.count.replace(/s? đang.*/, '') : text.count}`;
  el('active-note').textContent = mode === 'clubs' ? 'Dữ liệu từ CLB đã duyệt' : 'Dữ liệu từ người chơi đã duyệt';
  grid.innerHTML = visible.map(card).join('');
  empty.hidden = visible.length > 0; empty.querySelector('h3').textContent = text.empty;
  const active = searchInput.value || cityFilter.value || districtFilter.value || timeFilter.value || intentFilter.value || levelFilter.value || dayFilter.value || formatFilter.value || groupFilter.value;
  clearButton.hidden = !active;
}
function clearFilters() { searchInput.value = ''; cityFilter.value = ''; districtFilter.value = ''; timeFilter.value = ''; intentFilter.value = ''; levelFilter.value = ''; dayFilter.value = ''; formatFilter.value = ''; groupFilter.value = ''; populateFilters(); render(); searchInput.focus(); }
function switchMode(next) {
  mode = next; const text = copy[mode];
  document.querySelectorAll('.mode-tab').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
  el('mode-description').textContent = text.description; el('section-label').textContent = text.label; el('listings-title').textContent = text.title; searchInput.placeholder = text.search; el('intent-label').textContent = text.intent; el('group-label').textContent = mode === 'clubs' ? 'Loại hình nhóm' : 'Loại hình nhóm';
  clearFilters();
}
function showDetail(id) {
  const item = current().find(entry => entry.id === id); if (!item) return;
  const title = mode === 'clubs' ? item.name : item.name;
  const location = mode === 'clubs' ? [item.venue, [item.district,item.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : [item.district,item.city].filter(Boolean).join(', ');
  const fields = mode === 'clubs'
    ? [['Lịch chơi', [item.days,item.times].filter(Boolean).join(' · ')], ['Trình độ', item.levels], ['Nội dung', item.format], ['Chi phí', item.cost], ['Loại nhóm', item.groupType]]
    : [['Trình độ', item.levels], ['Nội dung thích chơi', item.format], ['Thường rảnh', [item.days,item.times].filter(Boolean).join(' · ')]];
  const contactUrl = safeUrl(item.contact);
  detail.innerHTML = `<div class="detail-inner"><span class="pill">${escapeHtml(pillText(item))}</span><h2 id="dialog-name">${escapeHtml(title)}</h2><p class="detail-place">${escapeHtml(location || 'Khu vực đang cập nhật')}</p>${item.description ? `<p class="detail-description">${escapeHtml(item.description)}</p>` : ''}<ul class="detail-list">${fields.filter(([,value]) => value).map(([label,value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join('')}</ul><div class="detail-actions">${contactUrl ? `<a href="${escapeHtml(contactUrl)}" target="_blank" rel="noopener">Liên hệ qua ${escapeHtml(item.contactMethod)} ↗</a>` : '<span class="detail-place">Thông tin liên hệ đang cập nhật.</span>'}</div></div>`;
  dialog.showModal();
}
async function fetchRows(url) { const response = await fetch(url); if (!response.ok) throw new Error('Không thể tải dữ liệu'); return parseCSV(await response.text()); }
async function loadListings() {
  try { const [clubRows, playerRows] = await Promise.all([fetchRows(SOURCES.clubs), fetchRows(SOURCES.players)]); listings.clubs = approved(clubRows, normaliseClub); listings.players = approved(playerRows, normalisePlayer); el('data-status').textContent = 'Dữ liệu mới nhất'; }
  catch (error) { el('data-status').textContent = 'Chưa tải được dữ liệu'; }
  populateFilters(); render();
}

document.querySelectorAll('.mode-tab').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
searchInput.addEventListener('input', render);
cityFilter.addEventListener('change', () => { populateFilters(); render(); });
[districtFilter, timeFilter, intentFilter, levelFilter, dayFilter, formatFilter, groupFilter].forEach(filter => filter.addEventListener('change', render));
el('advanced-toggle').addEventListener('click', () => { const panel = el('advanced-filters'), button = el('advanced-toggle'), open = panel.hidden; panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); button.querySelector('span').textContent = open ? '−' : '+'; });
clearButton.addEventListener('click', clearFilters); el('empty-clear').addEventListener('click', clearFilters);
grid.addEventListener('click', event => { const card = event.target.closest('.listing-card'); if (card) showDetail(card.dataset.id); });
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
el('year').textContent = new Date().getFullYear(); loadListings();
