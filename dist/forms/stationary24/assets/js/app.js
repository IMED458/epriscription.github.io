import {
  getQueryParams,
  fetchPatient,
  fetchPrescription,
  fetchRegistryPatient,
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
const autoPrint = query.get("autoPrint") === "1";
const isFresh = query.get("fresh") === "1";
const STORAGE_SCOPE = patientId || "default";
const LIVE_SYNC_STORAGE_KEY = `stationary24_live_sync_${STORAGE_SCOPE}`;
const NURSE_STORAGE_KEY = `stationary24_nurse_sync_${STORAGE_SCOPE}`;
const TEMPLATE_TYPE = "stationary24";
const HOURS = [...Array(16).keys()].map((i) => i + 9).concat([...Array(9).keys()].map((i) => i + 1));
const PASSPORT_IDS = ["fullName", "hist", "gender", "age", "admission", "today", "icd", "dept", "blood", "room", "allergy"];
const DATE_FIELD_IDS = new Set(["admission", "today"]);
const EXCLUDED_MEDICATION_NAMES = new Set([
  "ანტიბაქტერიული თერაპია",
  "სედაცია",
  "ბაზისური თერაპია",
  "ვაზოპრესორი",
  "insulini",
  "შაქრის კონტროლი",
]);
const SIGNATURE_OPTIONS = {
  "doctor-nino": {
    slotId: "doctorSignatureSlot",
    imgId: "doctorSignatureImg",
    src: "ნინო კიკვაძე.png",
  },
  "nurse-giorgi": {
    slotId: "nurseSignatureSlot",
    imgId: "nurseSignatureImg",
    src: "giorgi esign.png",
  },
};

const statusEl = document.getElementById("firebaseStatus");
const templateItemsEl = document.getElementById("templateItems");
const noTemplatesEl = document.getElementById("noTemplates");
const patientSaveBtn = document.getElementById("patientSaveBtn");

let templates = [];
let historyLookupTimer = null;
let patientSaveFeedbackTimer = null;

function updateStatus(mode, message) {
  statusEl.textContent = message;
  statusEl.className =
    mode === "online"
      ? "status-online"
      : mode === "offline"
        ? "status-offline"
        : "status-connecting";
}

function flashPatientSaveFeedback(text) {
  patientSaveBtn.textContent = text;
  if (patientSaveFeedbackTimer) clearTimeout(patientSaveFeedbackTimer);
  patientSaveFeedbackTimer = setTimeout(() => {
    patientSaveBtn.textContent = "ისტორიაში შენახვა";
  }, 1800);
}

function padDatePart(value) {
  return String(value || "").padStart(2, "0");
}

function todayDisplay() {
  const now = new Date();
  return `${padDatePart(now.getDate())}.${padDatePart(now.getMonth() + 1)}.${now.getFullYear()}`;
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

function calcAge(value) {
  if (!value) return "";
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

function buildTables() {
  let medsHTML = `<tr><th class="num">№</th><th class="drug">ინფუზიური-ტრანსფ.თერაპია</th>${HOURS.map((h) => `<th class="time">${h}</th>`).join("")}</tr>`;
  for (let i = 1; i <= 34; i += 1) {
    let drugText = "";
    if (i === 6) drugText = "ანტიბაქტერიული თერაპია";
    if (i === 12) drugText = "სედაცია";
    if (i === 18) drugText = "ბაზისური თერაპია";
    if (i === 28) drugText = "ვაზოპრესორი";
    if (i === 33) drugText = "insulini";
    if (i === 34) drugText = "შაქრის კონტროლი";

    medsHTML += `<tr>
      <td class="num">${i}.</td>
      <td class="drug"><input type="text" value="${drugText}"></td>
      ${HOURS.map(() => `<td class="dose"><input type="text"></td>`).join("")}
    </tr>`;
  }
  document.getElementById("meds").innerHTML = medsHTML;

  const vitalsLabels = ["პულსი", "სისტ.", "დიასტ.", "MAP", "ტ°", "სუნთქვა", "CVP", "FiO2", "SaO2"];
  let vitalsHTML = `<tr><th class="drug">პარამეტრი</th>${HOURS.map((h) => `<th class="time">${h}</th>`).join("")}</tr>`;
  vitalsLabels.forEach((label) => {
    vitalsHTML += `<tr><td class="drug">${label}</td>${HOURS.map(() => `<td><input type="text"></td>`).join("")}</tr>`;
  });
  document.getElementById("vitals").innerHTML = vitalsHTML;

  document.getElementById("enteral").innerHTML = `
    <tr><th class="drug">ენტერალური კვება</th><th>დილა</th><th>შუადღე</th><th>საღამო</th></tr>
    <tr><td class="drug">მლ</td><td><input type="text"></td><td><input type="text"></td><td><input type="text"></td></tr>
  `;

  const otherLabels = ["დიურეზი", "დეფეკაცია", "ოყნა", "დრენაჟი", "ბალანსი"];
  let otherHTML = `<tr><th class="drug">პარამეტრი</th>${HOURS.map((h) => `<th class="time">${h}</th>`).join("")}</tr>`;
  otherLabels.forEach((label) => {
    otherHTML += `<tr><td class="drug">${label}</td>${HOURS.map(() => `<td><input type="text"></td>`).join("")}</tr>`;
  });
  document.getElementById("other").innerHTML = otherHTML;
}

function setPassportData(data = {}, { preserveExisting = false } = {}) {
  PASSPORT_IDS.forEach((id) => {
    if (!(id in data)) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (preserveExisting && String(el.value || "").trim()) return;
    el.value = DATE_FIELD_IDS.has(id) ? normalizeDisplayDate(data[id]) : data[id] || "";
  });
  updatePatientNameBanner();
}

function getPassportData() {
  const passport = {};
  PASSPORT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    const rawValue = el ? String(el.value || "").trim() : "";
    passport[id] = DATE_FIELD_IDS.has(id) ? normalizeDisplayDate(rawValue) : rawValue;
  });
  return passport;
}

function getFormData() {
  const meds = Array.from(document.querySelectorAll("#meds tr:not(:first-child)")).map((row) => ({
    drug: row.cells[1].querySelector("input").value.trim(),
    doses: Array.from(row.querySelectorAll(".dose input")).map((inp) => inp.value.trim()),
  }));
  const vitals = Array.from(document.querySelectorAll("#vitals tr:not(:first-child)")).map((row) => ({
    values: Array.from(row.querySelectorAll("input")).map((inp) => inp.value.trim()),
  }));
  const enteral = Array.from(document.querySelectorAll("#enteral input")).map((inp) => inp.value.trim());
  const other = Array.from(document.querySelectorAll("#other tr:not(:first-child)")).map((row) => ({
    values: Array.from(row.querySelectorAll("input")).map((inp) => inp.value.trim()),
  }));
  return { meds, vitals, enteral, other };
}

function applyFormData(data = {}) {
  document.querySelectorAll("#meds tr:not(:first-child)").forEach((row, i) => {
    const item = data.meds?.[i];
    row.cells[1].querySelector("input").value = item?.drug || "";
    row.querySelectorAll(".dose input").forEach((inp, j) => {
      inp.value = item?.doses?.[j] || "";
    });
  });

  document.querySelectorAll("#vitals tr:not(:first-child)").forEach((row, i) => {
    row.querySelectorAll("input").forEach((inp, j) => {
      inp.value = data.vitals?.[i]?.values?.[j] || "";
    });
  });

  document.querySelectorAll("#enteral input").forEach((inp, i) => {
    inp.value = data.enteral?.[i] || "";
  });

  document.querySelectorAll("#other tr:not(:first-child)").forEach((row, i) => {
    row.querySelectorAll("input").forEach((inp, j) => {
      inp.value = data.other?.[i]?.values?.[j] || "";
    });
  });
}

function getSignatureSelection() {
  return {
    doctor: document.getElementById("doctorSignatureSelect").value || "",
    nurse: document.getElementById("nurseSignatureSelect").value || "",
  };
}

function renderSignatureSlots() {
  const selections = getSignatureSelection();
  [
    { role: "doctor", slotId: "doctorSignatureSlot", imgId: "doctorSignatureImg" },
    { role: "nurse", slotId: "nurseSignatureSlot", imgId: "nurseSignatureImg" },
  ].forEach(({ role, slotId, imgId }) => {
    const slot = document.getElementById(slotId);
    const img = document.getElementById(imgId);
    const signature = SIGNATURE_OPTIONS[selections[role]];
    if (!slot || !img) return;
    if (signature) {
      slot.classList.add("has-signature");
      img.src = encodeURI(signature.src);
      img.classList.remove("missing");
    } else {
      slot.classList.remove("has-signature");
      img.removeAttribute("src");
      img.classList.add("missing");
    }
  });
}

function applySignatureSelection(data = {}) {
  document.getElementById("doctorSignatureSelect").value = data.doctor || "";
  document.getElementById("nurseSignatureSelect").value = data.nurse || "";
  renderSignatureSlots();
}

function updatePatientNameBanner() {
  const fullName = document.getElementById("fullName").value.trim() || "პაციენტის სახელი და გვარი";
  document.getElementById("name2").textContent = fullName;
}

function collectLiveSyncPayload() {
  const medications = Array.from(document.querySelectorAll("#meds tr:not(:first-child) .drug input"))
    .map((inp) => inp.value.trim())
    .filter((name) => name && !EXCLUDED_MEDICATION_NAMES.has(name));
  return {
    passport: getPassportData(),
    medications,
    observation: getObservationPayload(),
    updatedAtMs: Date.now(),
  };
}

function writeLiveSync() {
  window.localStorage.setItem(LIVE_SYNC_STORAGE_KEY, JSON.stringify(collectLiveSyncPayload()));
}

function readNursePayload() {
  try {
    const raw = window.localStorage.getItem(NURSE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function getObservationPayload() {
  return {
    header: getPassportData(),
    form: getFormData(),
    signatures: getSignatureSelection(),
  };
}

function applyObservationPayload(payload = {}) {
  if (payload.header) setPassportData(payload.header);
  if (payload.form) applyFormData(payload.form);
  if (payload.signatures) applySignatureSelection(payload.signatures);
  updatePatientNameBanner();
  writeLiveSync();
}

function defaultPassportFromPatient(patient) {
  return {
    fullName: `${patient.firstName || ""} ${patient.lastName || ""}`.trim(),
    hist: patient.historyNumber || "",
    gender: patient.gender === "male" ? "მამრ." : patient.gender === "female" ? "მდედრ." : "",
    age: calcAge(patient.birthDate),
    admission: todayDisplay(),
    today: todayDisplay(),
    icd: "",
    dept: "",
    blood: "",
    room: "",
    allergy: "",
  };
}

async function hydratePatient() {
  if (!patientId) return;
  const patient = await fetchPatient(patientId);
  setPassportData(defaultPassportFromPatient(patient), { preserveExisting: true });
}

async function hydratePrescription() {
  if (!currentPrescriptionId) return;
  const prescription = await fetchPrescription(currentPrescriptionId);
  const data = JSON.parse(prescription.data || "{}");
  applyObservationPayload(data.observation || {});
  if (data.nurse) {
    window.localStorage.setItem(NURSE_STORAGE_KEY, JSON.stringify(data.nurse));
  }
}

async function loadTemplates() {
  templates = await fetchTemplates(TEMPLATE_TYPE);
  renderTemplates();
}

function renderTemplates() {
  templateItemsEl.innerHTML = "";
  if (!templates.length) {
    noTemplatesEl.style.display = "block";
    return;
  }
  noTemplatesEl.style.display = "none";

  templates.forEach((template) => {
    const data = typeof template.data === "string" ? JSON.parse(template.data) : template.data;
    const div = document.createElement("div");
    div.className = "template-item";
    div.innerHTML = `
      <strong>${template.name}</strong>
      <div>
        <button class="btn" style="padding:6px 12px; font-size:12px; margin-left:8px;">ჩატვირთვა</button>
        <button class="btn delete" style="padding:6px 12px; font-size:12px;">წაშლა</button>
      </div>
    `;
    const [loadBtn, deleteBtn] = div.querySelectorAll("button");
    loadBtn.addEventListener("click", () => {
      applyObservationPayload(data);
      closeTemplateModal();
      window.alert(`შაბლონი „${template.name}“ ჩაიტვირთა!`);
    });
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("დარწმუნებული ხართ?")) return;
      await deleteTemplate(template.id);
      await loadTemplates();
    });
    templateItemsEl.appendChild(div);
  });
}

function openTemplateModal() {
  document.getElementById("templateModal").style.display = "flex";
}

function closeTemplateModal() {
  document.getElementById("templateModal").style.display = "none";
}

async function saveTemplateHandler() {
  const name = document.getElementById("templateName").value.trim();
  if (!name) {
    window.alert("შეიყვანეთ შაბლონის სახელი!");
    return;
  }

  await saveTemplate({
    name,
    type: TEMPLATE_TYPE,
    data: getObservationPayload(),
  });
  document.getElementById("templateName").value = "";
  await loadTemplates();
  window.alert(`შაბლონი „${name}“ წარმატებით შენახულია!`);
}

async function saveHistory() {
  if (!patientId) {
    flashPatientSaveFeedback("პაციენტი?");
    window.alert("პაციენტის გარეშე შენახვა ვერ მოხერხდა.");
    return;
  }

  const saved = await savePrescription({
    prescriptionId: currentPrescriptionId,
    type: TEMPLATE_TYPE,
    patientId: normalizedPatientId,
    patientHistoryNumber: getObservationPayload().header?.hist || "",
    data: {
      observation: getObservationPayload(),
      nurse: readNursePayload(),
    },
  });

  currentPrescriptionId = String(saved.id);
  replaceQueryParam("prescriptionId", currentPrescriptionId);
  flashPatientSaveFeedback("შენახულია");
}

async function lookupPatientByHistory() {
  const historyNumber = document.getElementById("hist").value.trim();
  if (!historyNumber || patientId) return;

  try {
    const patient = await fetchRegistryPatient(historyNumber);
    const nextName = [patient.lastName, patient.firstName].filter(Boolean).join(" ").trim();
    if (nextName && !document.getElementById("fullName").value.trim()) {
      document.getElementById("fullName").value = nextName;
      updatePatientNameBanner();
      writeLiveSync();
    }
  } catch (_) {
    // ignore registry misses on this screen
  }
}

function scheduleHistoryLookup() {
  if (historyLookupTimer) clearTimeout(historyLookupTimer);
  historyLookupTimer = setTimeout(lookupPatientByHistory, 320);
}

function clearAll() {
  if (!window.confirm("გსურთ ყველაფრის გასუფთავება?")) return;
  document.querySelectorAll("input[type=text], input[type=number]").forEach((el) => {
    el.value = "";
  });
  document.querySelectorAll("select").forEach((el) => {
    el.selectedIndex = 0;
  });
  buildTables();
  document.getElementById("today").value = todayDisplay();
  renderSignatureSlots();
  updatePatientNameBanner();
  writeLiveSync();
}

function attachGlobalInputHandlers() {
  document.getElementById("fullName").addEventListener("input", () => {
    updatePatientNameBanner();
    writeLiveSync();
  });
  document.getElementById("hist").addEventListener("input", () => {
    writeLiveSync();
    scheduleHistoryLookup();
  });
  PASSPORT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", writeLiveSync);
    el.addEventListener("change", writeLiveSync);
  });
  document.getElementById("meds").addEventListener("input", writeLiveSync);
  document.getElementById("vitals").addEventListener("input", writeLiveSync);
  document.getElementById("enteral").addEventListener("input", writeLiveSync);
  document.getElementById("other").addEventListener("input", writeLiveSync);
  document.getElementById("doctorSignatureSelect").addEventListener("change", renderSignatureSlots);
  document.getElementById("nurseSignatureSelect").addEventListener("change", renderSignatureSlots);
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
      document.getElementById(`p${btn.dataset.page}`).classList.add("active");
      document.querySelectorAll("[data-page]").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function openNursePage() {
  const url = new URL("./nurse.html", window.location.href);
  url.searchParams.set("patientId", patientId);
  if (currentPrescriptionId) url.searchParams.set("prescriptionId", currentPrescriptionId);
  if (isFresh) url.searchParams.set("fresh", "1");
  window.open(url.toString(), "_blank", "noopener");
}

function initializeFreshState() {
  if (!isFresh) return;
  currentPrescriptionId = "";
  replaceQueryParam("prescriptionId", "");
  window.localStorage.removeItem(NURSE_STORAGE_KEY);
}

async function initialize() {
  updateStatus("connecting", "მიმდინარეობს სისტემასთან დაკავშირება...");
  initializeFreshState();
  buildTables();
  initializeDateFields();
  setupNavigation();
  attachGlobalInputHandlers();
  document.getElementById("today").value = todayDisplay();

  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("patientSaveBtn").addEventListener("click", async () => {
    try {
      await saveHistory();
    } catch (error) {
      flashPatientSaveFeedback("ვერ შეინახა");
      window.alert(error.message || "შენახვა ვერ შესრულდა");
    }
  });
  document.getElementById("templateSaveBtn").addEventListener("click", async () => {
    try {
      await saveTemplateHandler();
    } catch (error) {
      window.alert(error.message || "შაბლონის შენახვა ვერ შესრულდა");
    }
  });
  document.getElementById("templatesBtn").addEventListener("click", openTemplateModal);
  document.getElementById("closeTemplateModalBtn").addEventListener("click", closeTemplateModal);
  document.getElementById("closeTemplateModalBtnBottom").addEventListener("click", closeTemplateModal);
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("nurseOpenBtn").addEventListener("click", openNursePage);
  document.getElementById("backBtn").addEventListener("click", () => goToPatientProfile(patientId));
  document.getElementById("templateModal").addEventListener("click", (event) => {
    if (event.target.id === "templateModal") closeTemplateModal();
  });

  try {
    await loadTemplates();
    await hydratePatient();
    if (currentPrescriptionId) await hydratePrescription();
    renderSignatureSlots();
    writeLiveSync();
    updateStatus("online", "ფორმა მზადაა - შენახვა და ბეჭდვა მუშაობს");
    if (autoPrint) {
      window.setTimeout(() => window.print(), 220);
    }
  } catch (error) {
    updateStatus("offline", "ზოგი მონაცემი ვერ ჩაიტვირთა, მაგრამ ლოკალური შევსება მუშაობს");
    console.error(error);
  }
}

initialize();
