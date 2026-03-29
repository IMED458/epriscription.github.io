import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { ensureAnonymousFirebaseSession, firebaseAuth, firebaseDb } from "./firebase";

const PATIENT_REGISTRY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7/export?format=csv&gid=226530235";
const PATIENT_REGISTRY_GVIZ_URL =
  "https://docs.google.com/spreadsheets/d/1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7/gviz/tq?gid=226530235";
const STATIC_USERS = [
  {
    id: "admin",
    username: "admin",
    password: "admin123",
    role: "admin",
    name: "ადმინისტრატორი",
  },
];

function nowIso() {
  return new Date().toISOString();
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
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

function normalizeHeader(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[№#]/g, "n")
    .replace(/[^0-9a-zა-ჰ]+/g, "");
}

function findHeaderIndex(headers: string[], candidates: string[], fallbackIndex = -1) {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalizedHeaders.indexOf(candidate);
    if (index !== -1) return index;
  }
  return fallbackIndex;
}

function safeCell(row: string[], index: number) {
  if (index < 0 || index >= row.length) return "";
  return String(row[index] || "").trim();
}

function normalizeLookupValue(value: string) {
  return String(value || "").trim();
}

function collectLookupVariants(value: unknown) {
  const raw = normalizeLookupValue(String(value || ""));
  const variants = new Set<string>();

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

function matchesLookupValue(sourceValue: unknown, lookupValue: unknown) {
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

function safeJsonParse(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function collectCandidateValues(...values: unknown[]) {
  const set = new Set<string>();
  values.flat(Infinity).forEach((value) => {
    collectLookupVariants(value).forEach((variant) => set.add(variant));
  });
  return set;
}

let registryRowsPromise: Promise<string[][]> | null = null;

function toRegistryCellValue(cell: any) {
  if (!cell) return "";
  return String(cell.f ?? cell.v ?? "").trim();
}

function convertRegistryTableToRows(payload: any) {
  const headers = Array.isArray(payload?.table?.cols)
    ? payload.table.cols.map((column: any) => String(column?.label || "").trim())
    : [];
  const dataRows = Array.isArray(payload?.table?.rows)
    ? payload.table.rows.map((row: any) => Array.isArray(row?.c) ? row.c.map(toRegistryCellValue) : [])
    : [];
  return [headers, ...dataRows].filter((row) => row.some((value) => String(value || "").trim() !== ""));
}

async function loadRegistryRows() {
  if (registryRowsPromise) {
    return registryRowsPromise;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    registryRowsPromise = fetch(PATIENT_REGISTRY_CSV_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch from registry");
        }
        return response.text();
      })
      .then(parseCsvRows)
      .catch((error) => {
        registryRowsPromise = null;
        throw error;
      });
    return registryRowsPromise;
  }

  registryRowsPromise = new Promise<string[][]>((resolve, reject) => {
    const callbackName = `__registryCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(PATIENT_REGISTRY_GVIZ_URL);
    url.searchParams.set("tqx", `responseHandler:${callbackName};out:json`);

    const cleanup = () => {
      delete (window as any)[callbackName];
      script.remove();
    };

    (window as any)[callbackName] = (payload: any) => {
      cleanup();
      if (payload?.status !== "ok") {
        registryRowsPromise = null;
        reject(new Error("Failed to fetch from registry"));
        return;
      }
      resolve(convertRegistryTableToRows(payload));
    };

    script.onerror = () => {
      cleanup();
      registryRowsPromise = null;
      reject(new Error("Failed to fetch from registry"));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  }).catch((error) => {
    registryRowsPromise = null;
    throw error;
  });

  return registryRowsPromise;
}

function extractPrescriptionMetadata(item: Record<string, any>) {
  const payload = safeJsonParse(item.data);
  return {
    historyNumbers: collectCandidateValues(
      item.patientHistoryNumber,
      payload?.historyNumber,
      payload?.patientHistoryNumber,
      payload?.header?.historyNumber,
      payload?.header?.hist,
      payload?.observation?.header?.historyNumber,
      payload?.observation?.header?.hist,
      payload?.nurse?.header?.historyNo,
    ),
    personalIds: collectCandidateValues(
      item.patientPersonalId,
      payload?.personalId,
      payload?.patientPersonalId,
      payload?.patient?.personalId,
      payload?.observation?.header?.personalId,
    ),
  };
}

function normalizeRecord<T extends Record<string, any>>(value: T | undefined | null) {
  return value ? JSON.parse(JSON.stringify(value)) as T : value;
}

function getCurrentAppUser() {
  const rawUser = window.localStorage.getItem("user");
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch (_) {
    return null;
  }
}

async function ensureDataSession() {
  await ensureAnonymousFirebaseSession();
  const user = getCurrentAppUser();
  if (!user) {
    const error = new Error("AUTH_REQUIRED");
    (error as any).status = 401;
    throw error;
  }
  return user;
}

function toResponse(data: any) {
  return { data };
}

async function readAllPatients() {
  const snapshot = await getDocs(collection(firebaseDb, "patients"));
  return snapshot.docs.map((item) => normalizeRecord(item.data())!);
}

async function readAllPrescriptions() {
  const snapshot = await getDocs(collection(firebaseDb, "prescriptions"));
  return snapshot.docs.map((item) => normalizeRecord(item.data())!);
}

async function readAllTemplates() {
  const snapshot = await getDocs(collection(firebaseDb, "templates"));
  return snapshot.docs.map((item) => normalizeRecord(item.data())!);
}

async function fetchRegistryPatient(historyNumber: string) {
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
    const error = new Error("Patient not found in registry");
    (error as any).status = 404;
    throw error;
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

const api = {
  async get(path: string) {
    if (path === "/patients") {
      await ensureDataSession();
      const patients = await readAllPatients();
      patients.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return toResponse(patients);
    }

    if (path === "/templates") {
      const user = await ensureDataSession();
      const templates = await readAllTemplates();
      const visible = templates
        .filter((item) => Boolean(item.isGlobal) || item.createdBy === user.id)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return toResponse(visible);
    }

    if (path.startsWith("/patients/search-registry/")) {
      const historyNumber = decodeURIComponent(path.split("/").pop() || "");
      return toResponse(await fetchRegistryPatient(historyNumber));
    }

    if (path.startsWith("/patients/")) {
      await ensureDataSession();
      const patientId = path.slice("/patients/".length);
      const patientSnap = await getDoc(doc(firebaseDb, "patients", patientId));
      if (!patientSnap.exists()) {
        throw new Error("Patient not found");
      }

      const patient = normalizeRecord(patientSnap.data())!;
      const prescriptions = (await readAllPrescriptions())
        .filter((item) => {
          if (String(item.patientId || "") === patientId) return true;
          const metadata = extractPrescriptionMetadata(item);
          return metadata.historyNumbers.has(String(patient.historyNumber || "").trim()) ||
            metadata.personalIds.has(String(patient.personalId || "").trim());
        })
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

      return toResponse({
        ...patient,
        prescriptions,
      });
    }

    if (path.startsWith("/prescriptions/")) {
      await ensureDataSession();
      const prescriptionId = path.slice("/prescriptions/".length);
      const prescriptionSnap = await getDoc(doc(firebaseDb, "prescriptions", prescriptionId));
      if (!prescriptionSnap.exists()) {
        throw new Error("Prescription not found");
      }

      const prescription = normalizeRecord(prescriptionSnap.data())!;
      let patient = null;

      if (prescription.patientId) {
        const patientSnap = await getDoc(doc(firebaseDb, "patients", String(prescription.patientId)));
        patient = patientSnap.exists() ? normalizeRecord(patientSnap.data()) : null;
      }

      return toResponse({
        ...prescription,
        patient,
      });
    }

    throw new Error(`Unsupported GET path: ${path}`);
  },

  async post(path: string, body: any) {
    if (path === "/auth/login") {
      await ensureAnonymousFirebaseSession();
      const foundUser = STATIC_USERS.find(
        (item) => item.username === String(body?.username || "").trim() &&
          item.password === String(body?.password || "")
      );

      if (!foundUser) {
        const error = new Error("Invalid credentials");
        (error as any).status = 401;
        throw error;
      }

      const token = firebaseAuth.currentUser
        ? await firebaseAuth.currentUser.getIdToken()
        : "firebase-anonymous";

      return toResponse({
        token,
        user: {
          id: foundUser.id,
          username: foundUser.username,
          role: foundUser.role,
          name: foundUser.name,
        },
      });
    }

    if (path === "/patients") {
      await ensureDataSession();
      const allPatients = await readAllPatients();
      const nextPatient = {
        id: "",
        historyNumber: String(body?.historyNumber || "").trim(),
        firstName: String(body?.firstName || "").trim(),
        lastName: String(body?.lastName || "").trim(),
        personalId: String(body?.personalId || "").trim(),
        birthDate: body?.birthDate || "",
        gender: body?.gender || "",
        phone: body?.phone || "",
        room: String(body?.room || "").trim(),
        address: body?.address || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      const duplicate = allPatients.some(
        (item) =>
          item.historyNumber === nextPatient.historyNumber ||
          item.personalId === nextPatient.personalId
      );

      if (!nextPatient.historyNumber || !nextPatient.personalId || duplicate) {
        throw new Error("Patient already exists or invalid data");
      }

      const ref = doc(collection(firebaseDb, "patients"));
      nextPatient.id = ref.id;
      await setDoc(ref, nextPatient);
      return toResponse(nextPatient);
    }

    if (path === "/prescriptions") {
      const user = await ensureDataSession();
      const ref = doc(collection(firebaseDb, "prescriptions"));
      const createdAt = nowIso();
      const prescription = {
        id: ref.id,
        type: String(body?.type || ""),
        data: JSON.stringify(body?.data ?? {}),
        patientId: String(body?.patientId || ""),
        patientHistoryNumber: String(body?.patientHistoryNumber || "").trim(),
        patientPersonalId: String(body?.patientPersonalId || "").trim(),
        createdBy: user.id,
        createdAt,
        updatedAt: createdAt,
      };

      await setDoc(ref, prescription);
      return toResponse(prescription);
    }

    if (path === "/templates") {
      const user = await ensureDataSession();
      const ref = doc(collection(firebaseDb, "templates"));
      const template = {
        id: ref.id,
        name: String(body?.name || "").trim(),
        type: String(body?.type || "").trim(),
        data: JSON.stringify(body?.data ?? {}),
        createdBy: user.id,
        isGlobal: Boolean(body?.isGlobal),
        createdAt: nowIso(),
      };

      await setDoc(ref, template);
      return toResponse(template);
    }

    throw new Error(`Unsupported POST path: ${path}`);
  },

  async put(path: string, body: any) {
    if (path.startsWith("/prescriptions/")) {
      await ensureDataSession();
      const prescriptionId = path.slice("/prescriptions/".length);
      const ref = doc(firebaseDb, "prescriptions", prescriptionId);
      const current = await getDoc(ref);
      if (!current.exists()) {
        throw new Error("Prescription not found");
      }

      const nextValue = {
        ...normalizeRecord(current.data())!,
        ...(body?.type ? { type: body.type } : {}),
        ...(Object.prototype.hasOwnProperty.call(body || {}, "data")
          ? { data: JSON.stringify(body?.data ?? {}) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body || {}, "patientHistoryNumber")
          ? { patientHistoryNumber: String(body?.patientHistoryNumber || "").trim() }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(body || {}, "patientPersonalId")
          ? { patientPersonalId: String(body?.patientPersonalId || "").trim() }
          : {}),
        updatedAt: nowIso(),
      };

      await setDoc(ref, nextValue);
      return toResponse(nextValue);
    }

    throw new Error(`Unsupported PUT path: ${path}`);
  },

  async delete(path: string) {
    if (path.startsWith("/patients/")) {
      await ensureDataSession();
      const patientId = path.slice("/patients/".length);
      const patientRef = doc(firebaseDb, "patients", patientId);
      const patientSnap = await getDoc(patientRef);

      if (!patientSnap.exists()) {
        throw new Error("Patient not found");
      }

      const patient = normalizeRecord(patientSnap.data())!;
      const prescriptionsToDelete = (await readAllPrescriptions()).filter((item) => {
        if (String(item.patientId || "") === patientId) return true;
        const metadata = extractPrescriptionMetadata(item);
        return metadata.historyNumbers.has(String(patient.historyNumber || "").trim()) ||
          metadata.personalIds.has(String(patient.personalId || "").trim());
      });

      await Promise.all([
        ...prescriptionsToDelete.map((item) => deleteDoc(doc(firebaseDb, "prescriptions", String(item.id)))),
        deleteDoc(patientRef),
      ]);

      return toResponse({ ok: true, deletedPrescriptions: prescriptionsToDelete.length });
    }

    if (path.startsWith("/prescriptions/")) {
      await ensureDataSession();
      const prescriptionId = path.slice("/prescriptions/".length);
      await deleteDoc(doc(firebaseDb, "prescriptions", prescriptionId));
      return toResponse({ ok: true });
    }

    if (path.startsWith("/templates/")) {
      await ensureDataSession();
      const templateId = path.slice("/templates/".length);
      await deleteDoc(doc(firebaseDb, "templates", templateId));
      return toResponse({ ok: true });
    }

    throw new Error(`Unsupported DELETE path: ${path}`);
  },
};

export default api;
