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

const PATIENT_REGISTRY_SPREADSHEET_ID = "1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7";
const PATIENT_REGISTRY_GIDS = ["226530235", "761247166", "991199225"];
const STATIC_USERS = [
  {
    id: "admin",
    username: "admin",
    password: "admin123",
    role: "admin",
    name: "ადმინისტრატორი",
    phone: "",
  },
];
const MANAGED_USER_ROLES = new Set(["doctor", "nurse", "junior_doctor"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
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

function buildRegistryCsvUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/${PATIENT_REGISTRY_SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function buildRegistryGvizUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/${PATIENT_REGISTRY_SPREADSHEET_ID}/gviz/tq?gid=${gid}`;
}

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

function isRegistryHeaderRow(row: string[]) {
  const normalized = row.map(normalizeHeader);
  return normalized.includes("ისტn") && normalized.includes("სახელი") && normalized.includes("გვარი");
}

function mergeRegistrySheets(sheetRowsList: string[][][]) {
  let headers: string[] = [];
  const dataRows: string[][] = [];

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

async function loadRegistryRowsForGid(gid: string) {
  const response = await fetch(buildRegistryCsvUrl(gid));
  if (!response.ok) {
    throw new Error("Failed to fetch from registry");
  }
  return parseCsvRows(await response.text());
}

async function loadRegistryRowsForGidInBrowser(gid: string) {
  return new Promise<string[][]>((resolve, reject) => {
    const callbackName = `__registryCallback_${gid}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(buildRegistryGvizUrl(gid));
    url.searchParams.set("tqx", `responseHandler:${callbackName};out:json`);

    const cleanup = () => {
      delete (window as any)[callbackName];
      script.remove();
    };

    (window as any)[callbackName] = (payload: any) => {
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

function ensureAdminUser(user: any) {
  if (user?.role !== "admin") {
    const error = new Error("FORBIDDEN");
    (error as any).status = 403;
    throw error;
  }
}

function sanitizeUserRecord(user: Record<string, any>) {
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    role: String(user.role || ""),
    name: String(user.name || ""),
    phone: String(user.phone || ""),
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || "",
    isStatic: Boolean(user.isStatic),
  };
}

function getStaticUsers() {
  return STATIC_USERS.map((user) => ({
    ...user,
    isStatic: true,
    createdAt: "",
    updatedAt: "",
  }));
}

function sortUsers<T extends Record<string, any>>(users: T[]) {
  return [...users].sort((left, right) => {
    if (left.role === "admin" && right.role !== "admin") return -1;
    if (left.role !== "admin" && right.role === "admin") return 1;
    return String(left.name || left.username || "").localeCompare(String(right.name || right.username || ""), "ka");
  });
}

function resolveCreatorMetadata<T extends Record<string, any>>(item: T, users: Record<string, any>[]) {
  const creator = users.find((user) => String(user.id || "") === String(item.createdBy || ""));
  return {
    ...item,
    createdByName: String(item.createdByName || creator?.name || ""),
    createdByRole: String(item.createdByRole || creator?.role || ""),
    createdByPhone: String(item.createdByPhone || creator?.phone || ""),
  };
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

async function readAllUsers() {
  const snapshot = await getDocs(collection(firebaseDb, "users"));
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
    if (path === "/users") {
      const user = await ensureDataSession();
      ensureAdminUser(user);
      const storedUsers = await readAllUsers();
      return toResponse(
        sortUsers([
          ...getStaticUsers().map(sanitizeUserRecord),
          ...storedUsers.map(sanitizeUserRecord),
        ])
      );
    }

    if (path === "/staff-users") {
      await ensureDataSession();
      const storedUsers = await readAllUsers();
      return toResponse(
        sortUsers([
          ...getStaticUsers().map(sanitizeUserRecord),
          ...storedUsers.map(sanitizeUserRecord),
        ])
      );
    }

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
        .filter((item) => String(item.createdBy || "") === String(user.id || ""))
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
      const allUsers = [...getStaticUsers(), ...(await readAllUsers())];
      const prescriptions = (await readAllPrescriptions())
        .filter((item) => {
          if (String(item.patientId || "") === patientId) return true;
          const metadata = extractPrescriptionMetadata(item);
          return metadata.historyNumbers.has(String(patient.historyNumber || "").trim()) ||
            metadata.personalIds.has(String(patient.personalId || "").trim());
        })
        .map((item) => resolveCreatorMetadata(item, allUsers))
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

      const allUsers = [...getStaticUsers(), ...(await readAllUsers())];

      return toResponse({
        ...resolveCreatorMetadata(prescription, allUsers),
        patient,
      });
    }

    throw new Error(`Unsupported GET path: ${path}`);
  },

  async post(path: string, body: any) {
    if (path === "/auth/login") {
      await ensureAnonymousFirebaseSession();
      const username = normalizeUsername(body?.username);
      const password = String(body?.password || "");
      const storedUsers = await readAllUsers();
      const foundUser = [...getStaticUsers(), ...storedUsers].find(
        (item) =>
          normalizeUsername(item.username) === username &&
          String(item.password || "") === password
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
        user: sanitizeUserRecord(foundUser),
      });
    }

    if (path === "/users") {
      const user = await ensureDataSession();
      ensureAdminUser(user);

      const username = normalizeUsername(body?.username);
      const password = String(body?.password || "");
      const name = String(body?.name || "").trim();
      const phone = String(body?.phone || "").trim();
      const role = String(body?.role || "").trim();
      const existingUsers = [...getStaticUsers(), ...(await readAllUsers())];
      const duplicate = existingUsers.some((item) => normalizeUsername(item.username) === username);

      if (!username || !password || !name || !phone || !MANAGED_USER_ROLES.has(role) || duplicate) {
        throw new Error("Invalid user data");
      }

      const ref = doc(collection(firebaseDb, "users"));
      const createdAt = nowIso();
      const nextUser = {
        id: ref.id,
        username,
        password,
        role,
        name,
        phone,
        createdAt,
        updatedAt: createdAt,
      };

      await setDoc(ref, nextUser);
      return toResponse(sanitizeUserRecord(nextUser));
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
        createdByName: String(user.name || "").trim(),
        createdByRole: String(user.role || "").trim(),
        createdByPhone: String(user.phone || "").trim(),
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
        createdByName: String(user.name || "").trim(),
        isGlobal: Boolean(body?.isGlobal),
        createdAt: nowIso(),
      };

      await setDoc(ref, template);
      return toResponse(template);
    }

    throw new Error(`Unsupported POST path: ${path}`);
  },

  async put(path: string, body: any) {
    if (path.startsWith("/users/")) {
      const user = await ensureDataSession();
      ensureAdminUser(user);

      const userId = path.slice("/users/".length);
      if (STATIC_USERS.some((item) => item.id === userId)) {
        throw new Error("Default admin cannot be modified");
      }

      const ref = doc(firebaseDb, "users", userId);
      const current = await getDoc(ref);
      if (!current.exists()) {
        throw new Error("User not found");
      }

      const currentValue = normalizeRecord(current.data())!;
      const nextUsername = Object.prototype.hasOwnProperty.call(body || {}, "username")
        ? normalizeUsername(body?.username)
        : normalizeUsername(currentValue.username);
      const nextRole = Object.prototype.hasOwnProperty.call(body || {}, "role")
        ? String(body?.role || "").trim()
        : String(currentValue.role || "");
      const nextName = Object.prototype.hasOwnProperty.call(body || {}, "name")
        ? String(body?.name || "").trim()
        : String(currentValue.name || "");
      const nextPhone = Object.prototype.hasOwnProperty.call(body || {}, "phone")
        ? String(body?.phone || "").trim()
        : String(currentValue.phone || "");
      const nextPassword = Object.prototype.hasOwnProperty.call(body || {}, "password")
        ? String(body?.password || "")
        : String(currentValue.password || "");

      const duplicate = [...getStaticUsers(), ...(await readAllUsers())].some(
        (item) => item.id !== userId && normalizeUsername(item.username) === nextUsername
      );

      if (!nextUsername || !nextName || !nextPhone || !nextPassword || !MANAGED_USER_ROLES.has(nextRole) || duplicate) {
        throw new Error("Invalid user data");
      }

      const nextValue = {
        ...currentValue,
        username: nextUsername,
        role: nextRole,
        name: nextName,
        phone: nextPhone,
        password: nextPassword,
        updatedAt: nowIso(),
      };

      await setDoc(ref, nextValue);
      return toResponse(sanitizeUserRecord(nextValue));
    }

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
    if (path.startsWith("/users/")) {
      const user = await ensureDataSession();
      ensureAdminUser(user);

      const userId = path.slice("/users/".length);
      if (STATIC_USERS.some((item) => item.id === userId)) {
        throw new Error("Default admin cannot be deleted");
      }
      if (String(user.id || "") === userId) {
        throw new Error("You cannot delete the active user");
      }

      await deleteDoc(doc(firebaseDb, "users", userId));
      return toResponse({ ok: true });
    }

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
      const user = await ensureDataSession();
      const templateId = path.slice("/templates/".length);
      const templateRef = doc(firebaseDb, "templates", templateId);
      const templateSnap = await getDoc(templateRef);
      if (!templateSnap.exists()) {
        throw new Error("Template not found");
      }
      const template = normalizeRecord(templateSnap.data())!;
      if (String(template.createdBy || "") !== String(user.id || "") && user.role !== "admin") {
        throw new Error("FORBIDDEN");
      }
      await deleteDoc(templateRef);
      return toResponse({ ok: true });
    }

    throw new Error(`Unsupported DELETE path: ${path}`);
  },
};

export default api;
