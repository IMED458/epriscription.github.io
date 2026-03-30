import {
  getQueryParams,
  fetchPatient,
  fetchPrescription,
  fetchTemplates,
  saveTemplate,
  deleteTemplate,
  savePrescription,
  replaceQueryParam,
  goToPatientProfile,
  formatDateForDisplay,
} from "../../../common/clinic-api.js";

const query = getQueryParams();
const patientId = query.get("patientId") || "";
const normalizedPatientId = /^\d+$/.test(patientId) ? Number(patientId) : patientId;
let currentPrescriptionId = query.get("prescriptionId") || "";
const STORAGE_SCOPE = patientId || "default";
const LIVE_SYNC_STORAGE_KEY = `stationary24_live_sync_${STORAGE_SCOPE}`;
const NURSE_STORAGE_KEY = `stationary24_nurse_sync_${STORAGE_SCOPE}`;
const TEMPLATE_TYPE = "stationary24_nurse";
const EXCLUDED_MEDICATION_NAMES = new Set([
  "ანტიბაქტერიული თერაპია",
  "სედაცია",
  "ბაზისური თერაპია",
  "ვაზოპრესორი",
  "insulini",
  "შაქრის კონტროლი",
]);

const NURSE_ROW_COUNT = 24;
const NURSE_LEFT_ITEMS = [
  "არასტ.ხელთათმანი", "შპრიცი 2მლ", "შპრიცი 5მლ", "შპრიცი 10 მლ", "შპრიცი 20მლ", "პ.ვ.კ",
  "პვკ ფიქსატორი", "სისტემა", "სტოპკოკი", "ეკგ ქაღალდი", "ლიპუჩკა", "გლუკ.ჩხირი",
  "სპირტი", "ბინტი", "პირბადე", "ერთ.ზეწარი", "ერთ.ქუდი", "ბახილები", "ე/ტ მილი",
  "კონტური", "ფილტრი", "ც.ვ.კ 3 არხ", "სტ.ხელთათმანი", "ბეტადინი",
];
const NURSE_RIGHT_ITEMS = [
  "წყალბ.ზეჟ", "კერვა 2.0", "ბეტაპადი", "შ.ბ.კ", "ბეგი", "კატეჟელე", "ნ/გ ზონდი",
  "პამპერსის საფენი", "ჟანე", "იანკაუერი", "50მლ შპრიცი", "სისტემის დამაგრძ.",
  "სანაციის მილი", "სტ.ხალათი", "სტ.ზეწარი", "სკალპელი", "", "", "", "", "", "", "", "",
];

const statusEl = document.getElementById("firebaseStatus");
let templates = [];
let lastSyncedMeds = [];
let isSelecting = false;
let selectedInputs = new Set();
let lastFocusedInput = null;
let undoStack = [];
let redoStack = [];
let historyTimer = null;
let applyingHistoryState = false;

function updateStatus(mode, message) {
  statusEl.textContent = message;
  statusEl.className =
    mode === "online"
      ? "status-online"
      : mode === "offline"
        ? "status-offline"
        : "status-connecting";
}

function padDatePart(value) {
  return String(value || "").padStart(2, "0");
}

function formatTypedDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function normalizeDisplayDate(value) {
  return formatDateForDisplay(value);
}

function initializeDateFields() {
  document.querySelectorAll(".date-field").forEach((el) => {
    if (!(el instanceof HTMLInputElement) || el.dataset.dateBound === "1") return;
    el.value = normalizeDisplayDate(el.value);
    el.addEventListener("input", (event) => {
      if (event?.inputType?.startsWith("delete")) return;
      const nextValue = formatTypedDate(el.value);
      if (nextValue !== el.value) el.value = nextValue;
    });
    el.addEventListener("blur", () => {
      const nextValue = normalizeDisplayDate(el.value);
      if (nextValue !== el.value) el.value = nextValue;
    });
    el.dataset.dateBound = "1";
  });
}

function buildNurseExpenseTable(tableId, leftItems, rightItems) {
  let html = `
    <colgroup>
      <col style="width:30%">
      <col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%">
      <col style="width:30%">
      <col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%">
    </colgroup>
    <tr>
      <th>დასახელება</th><th colspan="4">რაოდენობა</th>
      <th>დასახელება</th><th colspan="4">რაოდენობა</th>
    </tr>
  `;
  for (let idx = 0; idx < NURSE_ROW_COUNT; idx += 1) {
    html += `
      <tr>
        <td class="n-name"><input class="n-name-input n-left" type="text" value="${leftItems[idx] || ""}"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-name"><input class="n-name-input n-right" type="text" value="${rightItems[idx] || ""}"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-qty"><input type="text"></td>
        <td class="n-qty"><input type="text"></td>
      </tr>
    `;
  }
  document.getElementById(tableId).innerHTML = html;
}

function renderNurseTables() {
  buildNurseExpenseTable("nurseExpense1", Array(NURSE_ROW_COUNT).fill(""), Array(NURSE_ROW_COUNT).fill(""));
  buildNurseExpenseTable("nurseExpense2", NURSE_LEFT_ITEMS, NURSE_RIGHT_ITEMS);
}

function normalizeMedicationText(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function formatNaClMedication(text) {
  if (!/\bnacl\b/i.test(text)) return "";
  const volumeMatch = text.match(/\b(1000|500|250|200)\s*(?:ml|მლ)?\b/i);
  if (!volumeMatch) return "";

  const baseMatch = text.match(/^(sol\.?\s+)?nacl(?:\s*0[.,]9%?)?/i);
  if (!baseMatch) return `NaCl ${volumeMatch[1]}`;

  const base = normalizeMedicationText(baseMatch[0]).replace(/^sol\.?/i, "Sol.").trim();
  return `${base} ${volumeMatch[1]}`;
}

function extractMedicationName(raw) {
  const text = normalizeMedicationText(raw);
  if (!text) return "";

  const excludedNormalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (const ex of EXCLUDED_MEDICATION_NAMES) {
    if (excludedNormalized === ex.toLowerCase()) return "";
  }

  const naclFormatted = formatNaClMedication(text);
  if (naclFormatted) return naclFormatted;

  const match = text.match(/^(sol\.?)\s+([^\s,;()]+)/i);
  if (match) {
    const sol = match[1].toLowerCase().startsWith("sol") ? "Sol." : match[1];
    const drug = match[2].replace(/[.;,:]+$/g, "");
    return `${sol} ${drug}.`;
  }

  return text.split(" ").slice(0, 2).join(" ");
}

function readObservationSync() {
  try {
    const raw = window.localStorage.getItem(LIVE_SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function readNursePayload() {
  try {
    const raw = window.localStorage.getItem(NURSE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeNursePayload() {
  window.localStorage.setItem(NURSE_STORAGE_KEY, JSON.stringify(getNursePayload()));
}

function applyLiveSyncPayload(payload) {
  if (!payload) return;
  const passport = payload.passport || {};
  document.getElementById("nurseHistoryNo").value = passport.hist || "";
  document.getElementById("nurseDiagnosis").value = passport.icd || "";
  document.getElementById("nurseFullName").value = passport.fullName || "";
  document.getElementById("nurseAdmissionDate").value = normalizeDisplayDate(passport.admission || "");

  const meds = (Array.isArray(payload.medications) ? payload.medications : [])
    .map(extractMedicationName)
    .filter(Boolean);

  const leftInputs = Array.from(document.querySelectorAll("#nurseExpense1 .n-name-input.n-left"));
  const rightInputs = Array.from(document.querySelectorAll("#nurseExpense1 .n-name-input.n-right"));
  const nameInputs = leftInputs.concat(rightInputs);
  nameInputs.forEach((inp, idx) => {
    const current = inp.value.trim();
    const oldSynced = lastSyncedMeds[idx] || "";
    const nextSynced = meds[idx] || "";
    if (!current || current === oldSynced) {
      inp.value = nextSynced;
    }
  });
  lastSyncedMeds = meds.slice(0, nameInputs.length);
}

function getNursePayload() {
  return {
    header: {
      historyNo: document.getElementById("nurseHistoryNo").value.trim(),
      diagnosis: document.getElementById("nurseDiagnosis").value.trim(),
      fullName: document.getElementById("nurseFullName").value.trim(),
      admissionDate: normalizeDisplayDate(document.getElementById("nurseAdmissionDate").value),
    },
    namesPage1: Array.from(document.querySelectorAll("#nurseExpense1 .n-name-input")).map((el) => el.value.trim()),
    namesPage2: Array.from(document.querySelectorAll("#nurseExpense2 .n-name-input")).map((el) => el.value.trim()),
    qtyPage1: Array.from(document.querySelectorAll("#nurseExpense1 .n-qty input")).map((el) => el.value.trim()),
    qtyPage2: Array.from(document.querySelectorAll("#nurseExpense2 .n-qty input")).map((el) => el.value.trim()),
  };
}

function applyNursePayload(data = {}) {
  if (data.header) {
    document.getElementById("nurseHistoryNo").value = data.header.historyNo || "";
    document.getElementById("nurseDiagnosis").value = data.header.diagnosis || "";
    document.getElementById("nurseFullName").value = data.header.fullName || "";
    document.getElementById("nurseAdmissionDate").value = normalizeDisplayDate(data.header.admissionDate || "");
  }
  Array.from(document.querySelectorAll("#nurseExpense1 .n-name-input")).forEach((el, i) => {
    el.value = data.namesPage1?.[i] || "";
  });
  Array.from(document.querySelectorAll("#nurseExpense2 .n-name-input")).forEach((el, i) => {
    el.value = data.namesPage2?.[i] || "";
  });
  Array.from(document.querySelectorAll("#nurseExpense1 .n-qty input")).forEach((el, i) => {
    el.value = data.qtyPage1?.[i] || "";
  });
  Array.from(document.querySelectorAll("#nurseExpense2 .n-qty input")).forEach((el, i) => {
    el.value = data.qtyPage2?.[i] || "";
  });
  attachSelectionHandlers();
  writeNursePayload();
  pushHistorySnapshot(true);
}

async function hydratePatient() {
  if (!patientId) return;
  const patient = await fetchPatient(patientId);
  document.getElementById("nurseHistoryNo").value = patient.historyNumber || "";
  document.getElementById("nurseFullName").value = `${patient.firstName || ""} ${patient.lastName || ""}`.trim();
  document.getElementById("nurseAdmissionDate").value = normalizeDisplayDate(new Date().toISOString().split("T")[0]);
}

async function hydratePrescription() {
  if (!currentPrescriptionId) return;
  const prescription = await fetchPrescription(currentPrescriptionId);
  const data = JSON.parse(prescription.data || "{}");
  if (data.observation) {
    const passport = data.observation.header || {};
    applyLiveSyncPayload({
      passport,
      medications: data.observation.form?.meds?.map((item) => item.drug).filter(Boolean) || [],
    });
  }
  if (data.nurse) {
    applyNursePayload(data.nurse);
  }
}

async function loadTemplates() {
  templates = await fetchTemplates(TEMPLATE_TYPE);
  renderTemplates();
}

function renderTemplates() {
  const items = document.getElementById("nurseTemplateItems");
  const noTemplates = document.getElementById("nurseNoTemplates");
  items.innerHTML = "";
  if (!templates.length) {
    noTemplates.style.display = "block";
    return;
  }
  noTemplates.style.display = "none";
  templates.forEach((template) => {
    const payload = typeof template.data === "string" ? JSON.parse(template.data) : template.data;
    const div = document.createElement("div");
    div.className = "template-item";
    div.innerHTML = `
      <strong>${template.name}</strong>
      <div>
        <button class="btn" style="padding:6px 12px; font-size:12px; margin-left:8px;">ჩატვირთვა</button>
        <button class="btn" style="padding:6px 12px; font-size:12px; background:#991b1b;">წაშლა</button>
      </div>
    `;
    const [loadBtn, deleteBtn] = div.querySelectorAll("button");
    loadBtn.addEventListener("click", () => {
      applyNursePayload(payload);
      closeTemplateModal();
      window.alert(`შაბლონი „${template.name}“ ჩაიტვირთა!`);
    });
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("დარწმუნებული ხართ?")) return;
      await deleteTemplate(template.id);
      await loadTemplates();
    });
    items.appendChild(div);
  });
}

async function saveTemplateHandler() {
  const name = document.getElementById("nurseTemplateName").value.trim();
  if (!name) {
    window.alert("შეიყვანეთ შაბლონის სახელი!");
    return;
  }
  await saveTemplate({
    name,
    type: TEMPLATE_TYPE,
    data: getNursePayload(),
  });
  document.getElementById("nurseTemplateName").value = "";
  await loadTemplates();
  window.alert(`შაბლონი „${name}“ წარმატებით შენახულია!`);
}

async function saveHistory() {
  if (!patientId) {
    window.alert("პაციენტის გარეშე შენახვა ვერ მოხერხდა.");
    return;
  }

  const observation = readObservationSync();
  const nurse = getNursePayload();
  const saved = await savePrescription({
    prescriptionId: currentPrescriptionId,
    type: "stationary24",
    patientId: normalizedPatientId,
    patientHistoryNumber: nurse.header?.historyNo || observation?.observation?.header?.hist || "",
    data: {
      observation: observation?.observation || null,
      nurse,
    },
  });
  currentPrescriptionId = String(saved.id);
  replaceQueryParam("prescriptionId", currentPrescriptionId);
  window.alert("ისტორიაში შეინახა!");
}

function openTemplateModal() {
  document.getElementById("nurseTemplateModal").style.display = "flex";
}

function closeTemplateModal() {
  document.getElementById("nurseTemplateModal").style.display = "none";
}

function getTrackedInputs() {
  return Array.from(document.querySelectorAll('input[type="text"], input[type="date"]'));
}

function snapshotState() {
  return getTrackedInputs().map((input) => input.value);
}

function applySnapshot(values) {
  const inputs = getTrackedInputs();
  applyingHistoryState = true;
  inputs.forEach((input, index) => {
    input.value = values[index] || "";
  });
  applyingHistoryState = false;
  writeNursePayload();
}

function pushHistorySnapshot(force = false) {
  if (applyingHistoryState) return;
  const snapshot = snapshotState();
  const last = undoStack[undoStack.length - 1];
  if (!force && last && last.length === snapshot.length && last.every((value, index) => value === snapshot[index])) {
    return;
  }
  undoStack.push(snapshot);
  if (undoStack.length > 200) undoStack.shift();
  redoStack = [];
}

function scheduleHistorySnapshot() {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => pushHistorySnapshot(), 220);
}

function undoHistory() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const previous = undoStack[undoStack.length - 1];
  applySnapshot(previous);
}

function redoHistory() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(next);
  applySnapshot(next);
}

function clearSelection() {
  selectedInputs.forEach((input) => input.classList.remove("selected-cell"));
  selectedInputs.clear();
}

function addToSelection(input) {
  selectedInputs.add(input);
  input.classList.add("selected-cell");
}

function removeFromSelection(input) {
  selectedInputs.delete(input);
  input.classList.remove("selected-cell");
}

function toggleSelection(input) {
  if (selectedInputs.has(input)) {
    removeFromSelection(input);
  } else {
    addToSelection(input);
  }
}

function getCellPosition(input) {
  const cell = input.closest("td,th");
  const row = cell?.parentElement;
  const table = row?.closest("table");
  if (!cell || !row || !table) return null;
  const rows = Array.from(table.rows);
  const rowIndex = rows.indexOf(row);
  const cells = Array.from(row.cells);
  const cellIndex = cells.indexOf(cell);
  return { table, rowIndex, cellIndex };
}

function selectRange(fromInput, toInput) {
  const fromPos = getCellPosition(fromInput);
  const toPos = getCellPosition(toInput);
  if (!fromPos || !toPos || fromPos.table !== toPos.table) return;

  const rows = Array.from(fromPos.table.rows);
  const minRow = Math.min(fromPos.rowIndex, toPos.rowIndex);
  const maxRow = Math.max(fromPos.rowIndex, toPos.rowIndex);
  const minCol = Math.min(fromPos.cellIndex, toPos.cellIndex);
  const maxCol = Math.max(fromPos.cellIndex, toPos.cellIndex);

  clearSelection();
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let cellIndex = minCol; cellIndex <= maxCol; cellIndex += 1) {
      const cell = row.cells[cellIndex];
      if (!cell) continue;
      const input = cell.querySelector("input");
      if (input) addToSelection(input);
    }
  }
}

function startSelection(event) {
  if (event.button !== 0) return;
  if (event.ctrlKey || event.metaKey) {
    toggleSelection(this);
    return;
  }
  if (event.shiftKey && lastFocusedInput && lastFocusedInput.isConnected) {
    selectRange(lastFocusedInput, this);
    return;
  }
  clearSelection();
  isSelecting = true;
  addToSelection(this);
}

function mouseEnterDuringSelection() {
  if (isSelecting) addToSelection(this);
}

function attachSelectionHandlers() {
  document.querySelectorAll('input[type="text"], input[type="date"]').forEach((input) => {
    if (input.dataset.selectionBound === "1") return;
    input.addEventListener("mousedown", startSelection);
    input.addEventListener("mouseenter", mouseEnterDuringSelection);
    input.addEventListener("focus", () => {
      lastFocusedInput = input;
    });
    input.dataset.selectionBound = "1";
  });
}

function copySelectedToClipboard() {
  if (!selectedInputs.size) return Promise.resolve("");
  const inputs = Array.from(selectedInputs).filter((input) => input.isConnected);
  if (!inputs.length) return Promise.resolve("");

  const firstPos = getCellPosition(inputs[0]);
  if (!firstPos) return Promise.resolve("");

  const positions = inputs
    .map((input) => {
      const pos = getCellPosition(input);
      return pos && pos.table === firstPos.table ? { input, ...pos } : null;
    })
    .filter(Boolean);

  if (!positions.length) return Promise.resolve("");

  const minRow = Math.min(...positions.map((pos) => pos.rowIndex));
  const maxRow = Math.max(...positions.map((pos) => pos.rowIndex));
  const minCol = Math.min(...positions.map((pos) => pos.cellIndex));
  const maxCol = Math.max(...positions.map((pos) => pos.cellIndex));

  const rowsOut = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const colsOut = [];
    for (let cellIndex = minCol; cellIndex <= maxCol; cellIndex += 1) {
      const match = positions.find((pos) => pos.rowIndex === rowIndex && pos.cellIndex === cellIndex);
      colsOut.push(match ? match.input.value : "");
    }
    rowsOut.push(colsOut.join("\t"));
  }
  const text = rowsOut.join("\n");

  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => text).catch(() => text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve(text);
}

function pasteTextGrid(text, startInput) {
  const pos = getCellPosition(startInput);
  if (!pos) {
    startInput.value = text;
    writeNursePayload();
    pushHistorySnapshot();
    return;
  }

  const { table, rowIndex, cellIndex } = pos;
  const tableRows = Array.from(table.rows);
  const lines = text.replace(/\r/g, "").split("\n");

  for (let rowOffset = 0; rowOffset < lines.length; rowOffset += 1) {
    const cols = lines[rowOffset].split("\t");
    const targetRowIndex = rowIndex + rowOffset;
    if (targetRowIndex >= tableRows.length) break;
    const row = tableRows[targetRowIndex];
    for (let colOffset = 0; colOffset < cols.length; colOffset += 1) {
      const targetCellIndex = cellIndex + colOffset;
      if (targetCellIndex >= row.cells.length) break;
      const cell = row.cells[targetCellIndex];
      const input = cell.querySelector("input");
      if (input) input.value = cols[colOffset];
    }
  }

  writeNursePayload();
  pushHistorySnapshot();
}

function clearAll() {
  if (!window.confirm("გსურთ ექთნის ფურცლის სრულად გასუფთავება?")) return;
  document.getElementById("nurseHistoryNo").value = "";
  document.getElementById("nurseDiagnosis").value = "";
  document.getElementById("nurseFullName").value = "";
  document.getElementById("nurseAdmissionDate").value = "";
  renderNurseTables();
  clearSelection();
  lastSyncedMeds = [];
  attachSelectionHandlers();
  document.querySelectorAll("[data-page]").forEach((btn) => btn.classList.remove("active"));
  document.querySelector('[data-page="1"]')?.classList.add("active");
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.getElementById("p1")?.classList.add("active");
  writeNursePayload();
  pushHistorySnapshot(true);
}

function setupPageNavigation() {
  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
      document.getElementById(`p${btn.dataset.page}`).classList.add("active");
      document.querySelectorAll("[data-page]").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function attachInputHandlers() {
  document.addEventListener("input", () => {
    writeNursePayload();
    scheduleHistorySnapshot();
  });
}

document.addEventListener("mouseup", () => {
  isSelecting = false;
});

document.addEventListener("paste", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !event.clipboardData) return;
  const text = event.clipboardData.getData("text");
  if (!text.includes("\n") && !text.includes("\t")) return;
  event.preventDefault();
  pasteTextGrid(text, target);
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isInput = target instanceof HTMLInputElement;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    if (selectedInputs.size > 0) {
      event.preventDefault();
      copySelectedToClipboard();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
    if (selectedInputs.size > 0) {
      event.preventDefault();
      copySelectedToClipboard().finally(() => {
        selectedInputs.forEach((input) => {
          input.value = "";
        });
        writeNursePayload();
        pushHistorySnapshot();
      });
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoHistory();
    return;
  }

  if (
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
    ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")
  ) {
    event.preventDefault();
    redoHistory();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && isInput) {
    const cell = target.closest("td,th");
    const table = cell?.closest("table");
    if (!table) return;
    event.preventDefault();
    clearSelection();
    table.querySelectorAll('input[type="text"], input[type="date"]').forEach((input) => {
      addToSelection(input);
    });
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && selectedInputs.size > 1) {
    event.preventDefault();
    selectedInputs.forEach((input) => {
      input.value = "";
    });
    writeNursePayload();
    pushHistorySnapshot();
    return;
  }

  if (!isInput) return;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;

  const cell = target.closest("td,th");
  const table = cell?.closest("table");
  if (!cell || !table) return;

  const inputsInTable = Array.from(table.querySelectorAll('input[type="text"], input[type="date"]'));
  const currentIndex = inputsInTable.indexOf(target);

  if (event.key === "ArrowRight") {
    event.preventDefault();
    if (currentIndex < inputsInTable.length - 1) inputsInTable[currentIndex + 1].focus();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (currentIndex > 0) inputsInTable[currentIndex - 1].focus();
    return;
  }

  const row = cell.parentElement;
  const rows = Array.from(table.rows);
  const rowIndex = rows.indexOf(row);
  const cells = Array.from(row.cells);
  const cellIndex = cells.indexOf(cell);

  const moveVertical = (delta) => {
    const targetRowIndex = rowIndex + delta;
    if (targetRowIndex < 0 || targetRowIndex >= rows.length) return;
    const targetRow = rows[targetRowIndex];
    const targetCell = targetRow.cells[cellIndex] || targetRow.cells[targetRow.cells.length - 1];
    const targetInput = targetCell?.querySelector("input");
    if (targetInput) targetInput.focus();
  };

  if (event.key === "Enter" || event.key === "ArrowDown") {
    event.preventDefault();
    moveVertical(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveVertical(-1);
  }
});

async function initialize() {
  updateStatus("connecting", "მიმდინარეობს სისტემასთან დაკავშირება...");
  renderNurseTables();
  attachSelectionHandlers();
  initializeDateFields();
  setupPageNavigation();
  attachInputHandlers();

  document.getElementById("syncBtn").addEventListener("click", () => {
    const payload = readObservationSync();
    if (!payload) {
      window.alert("ჯერ გახსენით დაკვირვების ფურცელი და შეავსეთ მონაცემები.");
      return;
    }
    applyLiveSyncPayload(payload);
    writeNursePayload();
    pushHistorySnapshot(true);
  });
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("saveHistoryBtn").addEventListener("click", async () => {
    try {
      await saveHistory();
    } catch (error) {
      window.alert(error.message || "შენახვა ვერ შესრულდა");
    }
  });
  document.getElementById("nurseSaveBtn").addEventListener("click", async () => {
    try {
      await saveTemplateHandler();
    } catch (error) {
      window.alert(error.message || "შაბლონის შენახვა ვერ შესრულდა");
    }
  });
  document.getElementById("nurseTemplatesBtn").addEventListener("click", openTemplateModal);
  document.getElementById("closeNurseTemplateModalTop").addEventListener("click", closeTemplateModal);
  document.getElementById("closeNurseTemplateModalBottom").addEventListener("click", closeTemplateModal);
  document.getElementById("nurseTemplateModal").addEventListener("click", (event) => {
    if (event.target.id === "nurseTemplateModal") closeTemplateModal();
  });
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("backBtn").addEventListener("click", () => goToPatientProfile(patientId));

  try {
    await loadTemplates();
    await hydratePatient();
    const observationSync = readObservationSync();
    if (observationSync) applyLiveSyncPayload(observationSync);
    if (currentPrescriptionId) await hydratePrescription();
    const savedNursePayload = readNursePayload();
    if (savedNursePayload) applyNursePayload(savedNursePayload);
    pushHistorySnapshot(true);
    updateStatus("online", "ფორმა მზადაა - შენახვა და ბეჭდვა მუშაობს");
  } catch (error) {
    updateStatus("offline", "ზოგი მონაცემი ვერ ჩაიტვირთა, მაგრამ შევსება მუშაობს");
    console.error(error);
  }
}

window.addEventListener("storage", (event) => {
  if (event.key !== LIVE_SYNC_STORAGE_KEY || !event.newValue) return;
  try {
    applyLiveSyncPayload(JSON.parse(event.newValue));
    writeNursePayload();
  } catch (_) {
    // ignore sync parse errors
  }
});

initialize();
