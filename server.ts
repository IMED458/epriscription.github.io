import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import axios from "axios";

let prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "clinic-secret-key";
const PATIENT_REGISTRY_CSV_URL =
  process.env.PATIENT_REGISTRY_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/1zsuLPC1hDVJ1pzGMsk_LY1bILCF6Dbd7/export?format=csv&gid=226530235";
const SQLITE_DB_PATH = path.resolve(process.cwd(), "prisma", "dev.db");

app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// --- API Routes ---

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
});

// External patient registry integration
app.get("/api/patients/search-registry/:historyNumber", async (req, res) => {
  const { historyNumber } = req.params;
  try {
    const response = await axios.get(PATIENT_REGISTRY_CSV_URL, { timeout: 10000 });
    const rows = response.data.split("\n").map((row: string) => row.split(","));

    const dataRows = rows.slice(1);
    const foundRow = dataRows.find((row: string[]) => row[0]?.trim() === historyNumber);

    if (foundRow) {
      res.json({
        historyNumber: foundRow[0]?.trim(),
        firstName: foundRow[1]?.trim(),
        lastName: foundRow[2]?.trim(),
        personalId: foundRow[3]?.trim(),
        birthDate: foundRow[4]?.trim(),
        gender: foundRow[5]?.trim(),
        phone: foundRow[6]?.trim(),
        address: foundRow[7]?.trim(),
      });
    } else {
      res.status(404).json({ error: "Patient not found in registry" });
    }
  } catch (err) {
    console.error("Registry fetch error:", err);
    res.status(500).json({ error: "Failed to fetch from registry" });
  }
});

// Patients
app.get("/api/patients", authenticate, async (req, res) => {
  const patients = await prisma.patient.findMany({ orderBy: { createdAt: "desc" } });
  res.json(patients);
});

app.post("/api/patients", authenticate, async (req, res) => {
  try {
    const patient = await prisma.patient.create({ data: req.body });
    res.json(patient);
  } catch (err) {
    res.status(400).json({ error: "Patient already exists or invalid data" });
  }
});

app.get("/api/patients/:id", authenticate, async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { prescriptions: { orderBy: { createdAt: "desc" } } }
  });
  res.json(patient);
});

// Prescriptions
app.post("/api/prescriptions", authenticate, async (req: any, res) => {
  const { type, data, patientId } = req.body;
  const prescription = await prisma.prescription.create({
    data: {
      type,
      data: JSON.stringify(data),
      patientId,
      createdBy: req.user.id
    }
  });
  res.json(prescription);
});

app.get("/api/prescriptions/:id", authenticate, async (req, res) => {
  const prescription = await prisma.prescription.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: {
      patient: true,
    },
  });

  if (!prescription) {
    return res.status(404).json({ error: "Prescription not found" });
  }

  res.json(prescription);
});

app.put("/api/prescriptions/:id", authenticate, async (req: any, res) => {
  const { type, data } = req.body;

  try {
    const prescription = await prisma.prescription.update({
      where: { id: parseInt(req.params.id, 10) },
      data: {
        ...(type ? { type } : {}),
        ...(data !== undefined ? { data: JSON.stringify(data) } : {}),
        updatedAt: new Date(),
      },
    });
    res.json(prescription);
  } catch (err) {
    res.status(404).json({ error: "Prescription not found" });
  }
});

app.delete("/api/prescriptions/:id", authenticate, async (req, res) => {
  try {
    await prisma.prescription.delete({
      where: { id: parseInt(req.params.id, 10) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: "Prescription not found" });
  }
});

// Templates
app.get("/api/templates", authenticate, async (req: any, res) => {
  const templates = await prisma.template.findMany({
    where: {
      OR: [
        { isGlobal: true },
        { createdBy: req.user.id }
      ]
    }
  });
  res.json(templates);
});

app.post("/api/templates", authenticate, async (req: any, res) => {
  const { name, type, data, isGlobal } = req.body;
  const template = await prisma.template.create({
    data: {
      name,
      type,
      data: JSON.stringify(data),
      createdBy: req.user.id,
      isGlobal: isGlobal || false
    }
  });
  res.json(template);
});

app.delete("/api/templates/:id", authenticate, async (req: any, res) => {
  try {
    await prisma.template.delete({
      where: { id: parseInt(req.params.id, 10) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: "Template not found" });
  }
});

// --- Vite Setup ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

async function bootstrapDatabase() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "username" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
    `CREATE TABLE IF NOT EXISTS "Patient" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "historyNumber" TEXT NOT NULL,
      "firstName" TEXT NOT NULL,
      "lastName" TEXT NOT NULL,
      "personalId" TEXT NOT NULL,
      "birthDate" TEXT,
      "gender" TEXT,
      "phone" TEXT,
      "address" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Patient_historyNumber_key" ON "Patient"("historyNumber")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Patient_personalId_key" ON "Patient"("personalId")`,
    `CREATE TABLE IF NOT EXISTS "Prescription" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "type" TEXT NOT NULL,
      "data" TEXT NOT NULL,
      "patientId" INTEGER NOT NULL,
      "createdBy" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "Prescription_patientId_idx" ON "Prescription"("patientId")`,
    `CREATE TABLE IF NOT EXISTS "Template" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "data" TEXT NOT NULL,
      "createdBy" INTEGER NOT NULL,
      "isGlobal" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function ensureDatabase() {
  try {
    await prisma.user.count();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const shouldRebuild =
      message.includes("database disk image is malformed") ||
      message.includes("no such table") ||
      message.includes("table `main.User` does not exist") ||
      message.includes("table main.User does not exist");

    if (!shouldRebuild) {
      throw err;
    }

    await prisma.$disconnect();

    if (message.includes("database disk image is malformed") && fs.existsSync(SQLITE_DB_PATH)) {
      const backupPath = path.resolve(process.cwd(), "prisma", `dev.corrupt.${Date.now()}.db`);
      fs.renameSync(SQLITE_DB_PATH, backupPath);
      console.warn(`Corrupted database backed up to ${backupPath}`);
    }

    prisma = new PrismaClient();
    await bootstrapDatabase();
  }
}

// Seed admin user if not exists
async function seed() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    await prisma.user.create({
      data: {
        username: "admin",
        password: bcrypt.hashSync("admin123", 10),
        role: "admin",
        name: "ადმინისტრატორი"
      }
    });
    console.log("Admin seeded: admin / admin123");
  }
}

async function main() {
  await ensureDatabase();
  await seed();
  await startServer();
}

main().catch((err) => {
  console.error("Server startup failed:", err);
  process.exit(1);
});
