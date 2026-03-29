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
  const response = await fetch(PATIENT_REGISTRY_CSV_URL);
  if (!response.ok) {
    throw new Error("Failed to fetch from registry");
  }

  const csv = await response.text();
  const rows = csv
    .split("\n")
    .map((row) => row.split(",").map((cell) => cell.trim()));
  const foundRow = rows.slice(1).find((row) => row[0] === historyNumber.trim());

  if (!foundRow) {
    const error = new Error("Patient not found in registry");
    (error as any).status = 404;
    throw error;
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
        .filter((item) => item.patientId === patientId)
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
        updatedAt: nowIso(),
      };

      await setDoc(ref, nextValue);
      return toResponse(nextValue);
    }

    throw new Error(`Unsupported PUT path: ${path}`);
  },

  async delete(path: string) {
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
