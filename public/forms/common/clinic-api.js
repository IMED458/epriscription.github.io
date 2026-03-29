import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const AUTH_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "user";
const PATIENT_REGISTRY_SPREADSHEET_ID = "1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7";
const PATIENT_REGISTRY_GIDS = ["226530235", "761247166", "991199225"];
const firebaseConfig = {
  apiKey: "AIzaSyAiC-U155Z6QZ_fFU54by8dG3hbpx56-f4",
  authDomain: "epriscription-bb066.firebaseapp.com",
  projectId: "epriscription-bb066",
  storageBucket: "epriscription-bb066.firebasestorage.app",
  messagingSenderId: "35872352364",
  appId: "1:35872352364:web:0c000379edc3c1029b9049",
  measurementId: "G-0YSRHL8LST",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const DEFAULT_APP_USER = {
  id: "admin",
  username: "admin",
  role: "admin",
  name: "ადმინისტრატორი",
};

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (inQuotes) {
      if (char === "\"") {
        if (csv[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[№#]/g, "n")
    .replace(/[^0-9a-zა-ჰ]+/g, "");
}

function findHeaderIndex(headers, candidates, fallbackIndex = -1) {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalizedHeaders.indexOf(candidate);
    if (index !== -1) return index;
  }
  return fallbackIndex;
}

function safeCell(row, index) {
  if (index < 0 || index >= row.length) return "";
  return String(row[index] || "").trim();
}

function normalizeLookupValue(value) {
  return String(value || "").trim();
}

function collectLookupVariants(value) {
  const raw = normalizeLookupValue(String(value || ""));
  const variants = new Set();

  if (!raw) {
    return variants;
  }

  variants.add(raw);

  const collapsed = raw.replace(/\s+/g, "");
  if (collapsed) {
    variants.add(collapsed);
  }

  const digitsOnly = raw.replace(/\D+/g, "");
  if (digitsOnly) {
    variants.add(digitsOnly);
  }

  const firstChunk = raw
    .split(/[./\\\-\s]+/)
    .map((part) => part.trim())
    .find(Boolean);
  if (firstChunk) {
    variants.add(firstChunk);
  }

  const firstDigitChunk = raw.match(/\d+/)?.[0];
  if (firstDigitChunk) {
    variants.add(firstDigitChunk);
  }

  return variants;
}

function matchesLookupValue(sourceValue, lookupValue) {
  const sourceVariants = collectLookupVariants(sourceValue);
  const lookupVariants = collectLookupVariants(lookupValue);

  if (sourceVariants.size === 0 || lookupVariants.size === 0) {
    return false;
  }

  for (const variant of sourceVariants) {
    if (lookupVariants.has(variant)) {
      return true;
    }
  }

  return false;
}

let registryRowsPromise = null;

function buildRegistryCsvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${PATIENT_REGISTRY_SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function buildRegistryGvizUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${PATIENT_REGISTRY_SPREADSHEET_ID}/gviz/tq?gid=${gid}`;
}

function toRegistryCellValue(cell) {
  if (!cell) return "";
  return String(cell.f ?? cell.v ?? "").trim();
}

function convertRegistryTableToRows(payload) {
  const headers = Array.isArray(payload?.table?.cols)
    ? payload.table.cols.map((column) => String(column?.label || "").trim())
    : [];
  const dataRows = Array.isArray(payload?.table?.rows)
    ? payload.table.rows.map((row) => Array.isArray(row?.c) ? row.c.map(toRegistryCellValue) : [])
    : [];
  return [headers, ...dataRows].filter((row) => row.some((value) => String(value || "").trim() !== ""));
}

function isRegistryHeaderRow(row) {
  const normalized = row.map(normalizeHeader);
  return normalized.includes("ისტn") && normalized.includes("სახელი") && normalized.includes("გვარი");
}

function mergeRegistrySheets(sheetRowsList) {
  let headers = [];
  const dataRows = [];

  for (const sheetRows of sheetRowsList) {
    if (!Array.isArray(sheetRows) || sheetRows.length === 0) {
      continue;
    }

    const [firstRow, ...restRows] = sheetRows;
    const hasHeader = isRegistryHeaderRow(firstRow);

    if (headers.length === 0 && hasHeader) {
      headers = firstRow;
    }

    const rowsToAppend = hasHeader ? restRows : sheetRows;
    rowsToAppend
      .filter((row) => row.some((value) => String(value || "").trim() !== ""))
      .forEach((row) => dataRows.push(row));
  }

  if (headers.length === 0 && sheetRowsList[0]?.[0]) {
    headers = sheetRowsList[0][0];
  }

  return headers.length > 0 ? [headers, ...dataRows] : dataRows;
}

async function loadRegistryRowsForGid(gid) {
  const response = await fetch(buildRegistryCsvUrl(gid));
  if (!response.ok) {
    throw new Error("Failed to fetch from registry");
  }
  return parseCsvRows(await response.text());
}

async function loadRegistryRowsForGidInBrowser(gid) {
  return new Promise((resolve, reject) => {
    const callbackName = `__registryCallback_${gid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(buildRegistryGvizUrl(gid));
    url.searchParams.set("tqx", `responseHandler:${callbackName};out:json`);

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (payload) => {
      cleanup();
      if (payload?.status !== "ok") {
        reject(new Error("Failed to fetch from registry"));
        return;
      }
      resolve(convertRegistryTableToRows(payload));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Failed to fetch from registry"));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function loadRegistryRows() {
  if (registryRowsPromise) {
    return registryRowsPromise;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    registryRowsPromise = Promise.all(PATIENT_REGISTRY_GIDS.map((gid) => loadRegistryRowsForGid(gid)))
      .then(mergeRegistrySheets)
      .catch((error) => {
        registryRowsPromise = null;
        throw error;
      });
    return registryRowsPromise;
  }

  registryRowsPromise = Promise.all(PATIENT_REGISTRY_GIDS.map((gid) => loadRegistryRowsForGidInBrowser(gid)))
    .then(mergeRegistrySheets)
    .catch((error) => {
    registryRowsPromise = null;
    throw error;
  });

  return registryRowsPromise;
}

export function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

export function getToken() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) || "";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRecord(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

async function ensureAnonymousSession() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

function getCurrentAppUser() {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function ensureDataSession() {
  const firebaseUser = await ensureAnonymousSession();
  const fallbackToken = await firebaseUser.getIdToken();
  if (!getToken()) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, fallbackToken);
  }

  const user = getCurrentAppUser();
  if (user) {
    return user;
  }

  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(DEFAULT_APP_USER));
  return DEFAULT_APP_USER;
}

export async function fetchPatient(patientId) {
  await ensureDataSession();
  const snapshot = await getDoc(doc(db, "patients", String(patientId)));
  if (!snapshot.exists()) {
    throw new Error("Patient not found");
  }
  return normalizeRecord(snapshot.data());
}

export async function fetchRegistryPatient(historyNumber) {
  const rows = await loadRegistryRows();
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  const historyIndex = findHeaderIndex(headers, ["ისტn", "ისტორია", "ისტორიანომერი"], 5);
  const firstNameIndex = findHeaderIndex(headers, ["სახელი"], 2);
  const lastNameIndex = findHeaderIndex(headers, ["გვარი"], 1);
  const personalIdIndex = findHeaderIndex(headers, ["პირადინ", "პირადინომერი"], 3);
  const birthDateIndex = findHeaderIndex(headers, ["დაბადებისთარიღი", "დაბადება"], -1);
  const genderIndex = findHeaderIndex(headers, ["სქესი"], -1);
  const phoneIndex = findHeaderIndex(headers, ["ტელეფონი", "მობილური"], -1);
  const addressIndex = findHeaderIndex(headers, ["მისამართი"], -1);
  const diagnosisIndex = findHeaderIndex(headers, ["დიაგნოზი"], 7);
  const departmentIndex = findHeaderIndex(headers, ["განყოფილება"], 8);
  const ageIndex = findHeaderIndex(headers, ["ასაკი"], 9);
  const admissionDateIndex = findHeaderIndex(headers, ["თარიღი"], 6);

  const foundRow = dataRows.find((row) => matchesLookupValue(safeCell(row, historyIndex), historyNumber));

  if (!foundRow) {
    throw new Error("Patient not found in registry");
  }

  return {
    historyNumber: safeCell(foundRow, historyIndex),
    firstName: safeCell(foundRow, firstNameIndex),
    lastName: safeCell(foundRow, lastNameIndex),
    personalId: safeCell(foundRow, personalIdIndex),
    birthDate: safeCell(foundRow, birthDateIndex),
    gender: safeCell(foundRow, genderIndex),
    phone: safeCell(foundRow, phoneIndex),
    address: safeCell(foundRow, addressIndex),
    diagnosis: safeCell(foundRow, diagnosisIndex),
    department: safeCell(foundRow, departmentIndex),
    age: safeCell(foundRow, ageIndex),
    admissionDate: safeCell(foundRow, admissionDateIndex),
  };
}

export async function fetchPrescription(prescriptionId) {
  await ensureDataSession();
  const snapshot = await getDoc(doc(db, "prescriptions", String(prescriptionId)));
  if (!snapshot.exists()) {
    throw new Error("Prescription not found");
  }
  return normalizeRecord(snapshot.data());
}

export async function savePrescription({
  prescriptionId,
  type,
  patientId,
  patientHistoryNumber = "",
  patientPersonalId = "",
  data,
}) {
  const user = await ensureDataSession();

  if (prescriptionId) {
    const ref = doc(db, "prescriptions", String(prescriptionId));
    const current = await getDoc(ref);
    if (!current.exists()) {
      throw new Error("Prescription not found");
    }

    const nextValue = {
      ...normalizeRecord(current.data()),
      ...(type ? { type } : {}),
      data: JSON.stringify(data ?? {}),
      patientHistoryNumber: String(patientHistoryNumber || "").trim(),
      patientPersonalId: String(patientPersonalId || "").trim(),
      updatedAt: nowIso(),
    };

    await setDoc(ref, nextValue);
    return nextValue;
  }

  const ref = doc(collection(db, "prescriptions"));
  const createdAt = nowIso();
  const nextValue = {
    id: ref.id,
    type: String(type || ""),
    data: JSON.stringify(data ?? {}),
    patientId: String(patientId || ""),
    patientHistoryNumber: String(patientHistoryNumber || "").trim(),
    patientPersonalId: String(patientPersonalId || "").trim(),
    createdBy: user.id,
    createdAt,
    updatedAt: createdAt,
  };

  await setDoc(ref, nextValue);
  return nextValue;
}

export async function deletePrescription(prescriptionId) {
  await ensureDataSession();
  await deleteDoc(doc(db, "prescriptions", String(prescriptionId)));
  return { ok: true };
}

export async function fetchTemplates(type) {
  const user = await ensureDataSession();
  const snapshot = await getDocs(collection(db, "templates"));
  return snapshot.docs
    .map((item) => normalizeRecord(item.data()))
    .filter((item) => item.type === type && (item.isGlobal || item.createdBy === user.id))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveTemplate({ name, type, data, isGlobal = false }) {
  const user = await ensureDataSession();
  const ref = doc(collection(db, "templates"));
  const template = {
    id: ref.id,
    name: String(name || "").trim(),
    type: String(type || "").trim(),
    data: JSON.stringify(data ?? {}),
    createdBy: user.id,
    isGlobal: Boolean(isGlobal),
    createdAt: nowIso(),
  };

  await setDoc(ref, template);
  return template;
}

export async function deleteTemplate(templateId) {
  await ensureDataSession();
  await deleteDoc(doc(db, "templates", String(templateId)));
  return { ok: true };
}

export function replaceQueryParam(name, value) {
  const url = new URL(window.location.href);
  if (value === null || value === undefined || value === "") {
    url.searchParams.delete(name);
  } else {
    url.searchParams.set(name, String(value));
  }
  window.history.replaceState({}, "", url.toString());
}

export function goToPatientProfile(patientId) {
  if (!patientId) return;
  const pathPrefix = window.location.pathname.includes("/forms/")
    ? window.location.pathname.split("/forms/")[0]
    : window.location.pathname.replace(/\/$/, "");
  window.location.href = `${pathPrefix}/#/patients/${patientId}`;
}

export function normalizeDateToInput(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const displayMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (displayMatch) {
    return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
  }
  return raw;
}

export function formatDateForDisplay(value) {
  if (!value) return "";
  const input = normalizeDateToInput(value);
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatDateForSlashDisplay(value) {
  if (!value) return "";
  const input = normalizeDateToInput(value);
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}
