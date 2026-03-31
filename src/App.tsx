import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate, Link } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { LogOut, User as UserIcon, Search, Plus, FileText, Printer, Save, Trash2, ChevronLeft, LayoutDashboard, Settings } from "lucide-react";
import api from "./lib/api";
import clinicLogo from "./assets/clinic-logo.png";

import PatientProfile from "./pages/PatientProfile";
import StationaryForm from "./pages/StationaryForm";
import NursingDocumentsPage from "./pages/NursingDocumentsPage";

import NewPatient from "./pages/NewPatient";
import AdminUsers from "./pages/AdminUsers";

const APP_LOGO_SRC = clinicLogo;

const getRoleLabel = (role: string) => {
  if (role === "admin") return "ადმინისტრატორი";
  if (role === "doctor") return "ექიმი";
  if (role === "junior_doctor") return "უმცროსი ექიმი";
  return "ექთანი";
};

// --- Components ---

const Layout = ({ children, user, onLogout }: { children: React.ReactNode, user: any, onLogout: () => void }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3 text-blue-700">
            <img
              src={APP_LOGO_SRC}
              alt="კლინიკის ლოგო"
              className="h-11 w-11 shrink-0 object-contain"
            />
            <div className="flex flex-col leading-none">
              <span className="mb-1 text-[11px] font-semibold tracking-[0.18em] text-blue-500">ინგოროყვას</span>
              <span className="text-2xl font-bold text-blue-700">კლინიკა</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6 ml-10">
            <Link to="/" className="text-slate-600 hover:text-blue-700 font-medium transition-colors">მთავარი</Link>
            <Link to="/patients" className="text-slate-600 hover:text-blue-700 font-medium transition-colors">პაციენტები</Link>
            {user?.role === "admin" && (
              <Link to="/admin/users" className="text-slate-600 hover:text-blue-700 font-medium transition-colors">მომხმარებლები</Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-900">{user?.name}</span>
            <span className="text-xs text-slate-500 uppercase tracking-wider">{getRoleLabel(user?.role || "")}</span>
          </div>
          <button 
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
            title="გამოსვლა"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-slate-400 text-sm">
        &copy; 2026 კლინიკის მართვის სისტემა. ყველა უფლება დაცულია.
      </footer>
    </div>
  );
};

// --- Pages ---

const Login = ({ onLogin }: { onLogin: (token: string, user: any) => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { username, password });
      onLogin(res.data.token, res.data.user);
      toast.success("წარმატებული ავტორიზაცია");
    } catch (err) {
      toast.error("არასწორი მომხმარებელი ან პაროლი");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <img
            src={APP_LOGO_SRC}
            alt="კლინიკის ლოგო"
            className="mx-auto mb-4 h-20 w-20 object-contain drop-shadow-sm"
          />
          <h1 className="text-2xl font-bold text-slate-900">სისტემაში შესვლა</h1>
          <p className="text-slate-500 mt-2">გთხოვთ გაიაროთ ავტორიზაცია</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">მომხმარებელი</label>
            <input 
              type="text" 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">პაროლი</label>
            <input 
              type="password" 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold hover:bg-blue-800 transition-all shadow-md disabled:opacity-50"
          >
            {loading ? "მიმდინარეობს..." : "შესვლა"}
          </button>
        </form>
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 uppercase tracking-widest">კლინიკის მართვის პლატფორმა</p>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const res = await api.get("/patients");
      setPatients(res.data);
    } catch (err) {
      toast.error("მონაცემების წამოღება ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  };

  const handleSheetSearch = async () => {
    if (!sheetSearch) return;
    setSheetLoading(true);
    try {
      const res = await api.get(`/patients/search-registry/${sheetSearch}`);
      // If found, we can either redirect to a "create" page with this data or create it automatically
      // Let's ask if they want to add this patient
      if (window.confirm(`მოიძებნა პაციენტი: ${res.data.firstName} ${res.data.lastName}. გსურთ ბაზაში დამატება?`)) {
        try {
          const createRes = await api.post("/patients", res.data);
          toast.success("პაციენტი წარმატებით დაემატა");
          fetchPatients();
          navigate(`/patients/${createRes.data.id}`);
        } catch (err: any) {
          if (err?.code === "DUPLICATE_PATIENT") {
            toast.error("პაციენტი უკვე ჩასმულია აღნიშნულ პროგრამაში");
            if (err?.existingPatientId) {
              navigate(`/patients/${err.existingPatientId}`);
            }
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      toast.error("პაციენტი გარე რეესტრში ვერ მოიძებნა");
    } finally {
      setSheetLoading(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.firstName.toLowerCase().includes(search.toLowerCase()) ||
    p.lastName.toLowerCase().includes(search.toLowerCase()) ||
    p.personalId.includes(search) ||
    p.historyNumber.includes(search)
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">პაციენტების მართვა</h1>
          <p className="text-slate-500">მოძებნეთ ან დაამატეთ ახალი პაციენტი</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="ისტორიის # (გარე რეესტრი)" 
              className="pl-4 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none w-64 shadow-sm"
              value={sheetSearch}
              onChange={(e) => setSheetSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSheetSearch()}
            />
            <button 
              onClick={handleSheetSearch}
              disabled={sheetLoading}
              className="absolute right-2 top-1.5 p-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-all disabled:opacity-50"
            >
              <Search size={18} />
            </button>
          </div>
          <button 
            onClick={() => navigate("/patients/new")}
            className="flex items-center gap-2 bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-800 transition-all shadow-md"
          >
            <Plus size={20} />
            <span>დამატება</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <Search size={18} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="ძებნა სახელით, გვარით, პირადი ნომრით..." 
            className="bg-transparent border-none outline-none w-full text-slate-700"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">ისტორიის #</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">პაციენტი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">პირადი ნომერი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">ტელეფონი</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">მოქმედება</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">იტვირთება...</td></tr>
              ) : filteredPatients.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">პაციენტები არ მოიძებნა</td></tr>
              ) : (
                filteredPatients.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                    <td className="px-6 py-4 font-mono text-blue-700 font-semibold">{p.historyNumber}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{p.firstName} {p.lastName}</div>
                      <div className="text-xs text-slate-500">{p.gender === 'male' ? 'მამრობითი' : 'მდედრობითი'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{p.personalId}</td>
                    <td className="px-6 py-4 text-slate-600">{p.phone || '-'}</td>
                    <td className="px-6 py-4">
                      <button className="text-blue-700 hover:text-blue-900 font-medium">პროფილი</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setInitialized(true);
  }, []);

  const handleLogin = (token: string, user: any) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  if (!initialized) return null;

  return (
    <HashRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        {!user ? (
          <Route path="*" element={<Login onLogin={handleLogin} />} />
        ) : (
          <>
            <Route path="/" element={<Layout user={user} onLogout={handleLogout}><Dashboard /></Layout>} />
            <Route path="/patients" element={<Layout user={user} onLogout={handleLogout}><Dashboard /></Layout>} />
            <Route path="/patients/:id" element={<Layout user={user} onLogout={handleLogout}><PatientProfile /></Layout>} />
            <Route path="/patients/:id/edit" element={<Layout user={user} onLogout={handleLogout}><NewPatient /></Layout>} />
            <Route path="/patients/:id/stationary" element={<Layout user={user} onLogout={handleLogout}><StationaryForm /></Layout>} />
            <Route path="/patients/:id/nursing" element={<Layout user={user} onLogout={handleLogout}><NursingDocumentsPage /></Layout>} />
            <Route path="/patients/:id/nursing/:docType" element={<Layout user={user} onLogout={handleLogout}><NursingDocumentsPage /></Layout>} />
            <Route path="/patients/new" element={<Layout user={user} onLogout={handleLogout}><NewPatient /></Layout>} />
            <Route
              path="/admin/users"
              element={
                user?.role === "admin"
                  ? <Layout user={user} onLogout={handleLogout}><AdminUsers /></Layout>
                  : <Navigate to="/" replace />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </HashRouter>
  );
}
