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
const PATIENT_REGISTRY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7/export?format=csv&gid=226530235";
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
  await ensureAnonymousSession();
  const user = getCurrentAppUser();
  if (!user || !getToken()) {
    throw new Error("AUTH_REQUIRED");
  }
  return user;
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
  const response = await fetch(PATIENT_REGISTRY_CSV_URL);
  if (!response.ok) {
    throw new Error("Failed to fetch from registry");
  }

  const csv = await response.text();
  const rows = csv
    .split("\n")
    .map((row) => row.split(",").map((cell) => cell.trim()));
  const foundRow = rows.slice(1).find((row) => row[0] === String(historyNumber || "").trim());

  if (!foundRow) {
    throw new Error("Patient not found in registry");
  }

  return {
    historyNumber: foundRow[0] || "",
    firstName: foundRow[1] || "",
    lastName: foundRow[2] || "",
    personalId: foundRow[3] || "",
    birthDate: foundRow[4] || "",
    gender: foundRow[5] || "",
    phone: foundRow[6] || "",
    address: foundRow[7] || "",
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

export async function savePrescription({ prescriptionId, type, patientId, data }) {
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
