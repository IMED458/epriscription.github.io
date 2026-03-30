const PATIENT_REGISTRY_SPREADSHEET_ID = "1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7";

type RegistryPatient = {
  historyNumber: string;
  firstName: string;
  lastName: string;
  personalId: string;
  birthDate: string;
  gender: string;
  phone: string;
  address: string;
  diagnosis: string;
  department: string;
  age: string;
  admissionDate: string;
  sheetName: string;
};

type RegistryWorkbookSheet = {
  sheetName: string;
  rows: string[][];
};

let registryWorkbookSheetsPromise: Promise<RegistryWorkbookSheet[]> | null = null;

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

function extractSpreadsheetId(value: string) {
  const trimmedValue = String(value || "").trim();
  const match = trimmedValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmedValue;
}

function normalizeSheetCellValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
  }
  return String(value).trim().replace(/\.0+$/, "");
}

function isRegistryHeaderRow(row: string[]) {
  const normalized = row.map(normalizeHeader);
  return normalized.includes("ისტn") && normalized.includes("სახელი") && normalized.includes("გვარი");
}

async function loadRegistryWorkbookSheets() {
  if (registryWorkbookSheetsPromise) {
    return registryWorkbookSheetsPromise;
  }

  registryWorkbookSheetsPromise = (async () => {
    const spreadsheetId = extractSpreadsheetId(PATIENT_REGISTRY_SPREADSHEET_ID);
    const workbookUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
    const response = await fetch(workbookUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Workbook fetch failed with status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "array" });

    return workbook.SheetNames.map((sheetName) => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      })
        .map((row) => Array.isArray(row) ? row.map(normalizeSheetCellValue) : [])
        .filter((row) => row.some((cell) => String(cell || "").trim() !== "")),
    }));
  })().catch((error) => {
    registryWorkbookSheetsPromise = null;
    throw error;
  });

  return registryWorkbookSheetsPromise;
}

function mapRegistryPatientFromRows(rows: string[][], historyNumber: string, sheetName: string): RegistryPatient | null {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const headerRowIndex = rows.findIndex(isRegistryHeaderRow);
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex] : [];
  const dataRows = rows.filter((row, index) => {
    if (!row.some((cell) => String(cell || "").trim() !== "")) return false;
    if (index === headerRowIndex) return false;
    return !isRegistryHeaderRow(row);
  });

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
    return null;
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
    sheetName,
  };
}

export async function fetchRegistryPatientFromWorkbook(historyNumber: string) {
  const normalizedHistoryNumber = normalizeLookupValue(historyNumber);
  if (!normalizedHistoryNumber) {
    const error = new Error("Patient not found in registry");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const workbookSheets = await loadRegistryWorkbookSheets();
  for (const sheet of workbookSheets) {
    const patient = mapRegistryPatientFromRows(sheet.rows, normalizedHistoryNumber, sheet.sheetName);
    if (patient) {
      return patient;
    }
  }

  const error = new Error("Patient not found in registry");
  (error as Error & { status?: number }).status = 404;
  throw error;
}
