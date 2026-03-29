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
} from "../../common/clinic-api.js";

const query = getQueryParams();
const patientId = query.get("patientId") || "";
const normalizedPatientId = /^\d+$/.test(patientId) ? Number(patientId) : patientId;
let currentPrescriptionId = query.get("prescriptionId") || "";
const STORAGE_SCOPE = patientId || "default";
const LIVE_SYNC_STORAGE_KEY = `stationary24_live_sync_${STORAGE_SCOPE}`;
const NURSE_STORAGE_KEY = `stationary24_nurse_sync_${STORAGE_SCOPE}`;
const TEMPLATE_TYPE = "stationary24_nurse";

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

function extractMedicationName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
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
  writeNursePayload();
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

function clearAll() {
  if (!window.confirm("გსურთ ექთნის ფურცლის სრულად გასუფთავება?")) return;
  renderNurseTables();
  lastSyncedMeds = [];
  writeNursePayload();
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
  });
}

async function initialize() {
  updateStatus("connecting", "მიმდინარეობს სისტემასთან დაკავშირება...");
  renderNurseTables();
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
    updateStatus("online", "ფორმა მზადაა - შენახვა და ბეჭდვა მუშაობს");
  } catch (error) {
    updateStatus("offline", "ზოგი მონაცემი ვერ ჩაიტვირთა, მაგრამ შევსება მუშაობს");
    console.error(error);
  }
}

initialize();
