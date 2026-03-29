const AUTH_STORAGE_KEY = "token";

export function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

export function getToken() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) || "";
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function fetchPatient(patientId) {
  return apiFetch(`/api/patients/${patientId}`);
}

export async function fetchRegistryPatient(historyNumber) {
  return apiFetch(`/api/patients/search-registry/${encodeURIComponent(historyNumber)}`);
}

export async function fetchPrescription(prescriptionId) {
  return apiFetch(`/api/prescriptions/${prescriptionId}`);
}

export async function savePrescription({ prescriptionId, type, patientId, data }) {
  if (prescriptionId) {
    return apiFetch(`/api/prescriptions/${prescriptionId}`, {
      method: "PUT",
      body: JSON.stringify({ type, data }),
    });
  }

  return apiFetch("/api/prescriptions", {
    method: "POST",
    body: JSON.stringify({ type, patientId, data }),
  });
}

export async function deletePrescription(prescriptionId) {
  return apiFetch(`/api/prescriptions/${prescriptionId}`, {
    method: "DELETE",
  });
}

export async function fetchTemplates(type) {
  const templates = await apiFetch("/api/templates");
  return Array.isArray(templates) ? templates.filter((item) => item.type === type) : [];
}

export async function saveTemplate({ name, type, data, isGlobal = false }) {
  return apiFetch("/api/templates", {
    method: "POST",
    body: JSON.stringify({ name, type, data, isGlobal }),
  });
}

export async function deleteTemplate(templateId) {
  return apiFetch(`/api/templates/${templateId}`, {
    method: "DELETE",
  });
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
  const isGithubPages = window.location.hostname.endsWith("github.io");
  if (isGithubPages) {
    window.location.href = `../../dist/#/patients/${patientId}`;
    return;
  }
  window.location.href = `/patients/${patientId}`;
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
