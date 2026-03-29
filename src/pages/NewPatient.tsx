import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Save, User as UserIcon } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

export default function NewPatient() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [formData, setFormData] = useState({
    historyNumber: "",
    firstName: "",
    lastName: "",
    personalId: "",
    birthDate: "",
    gender: "male",
    phone: "",
    address: ""
  });
  const lookupSeqRef = useRef(0);

  const normalizeGender = (value: string, fallback: "male" | "female") => {
    const normalized = String(value || "").trim().toLowerCase();
    if (["male", "m", "კაცი", "მამრობითი", "მამრ.", "mamrobiti"].includes(normalized)) {
      return "male";
    }
    if (["female", "f", "ქალი", "მდედრობითი", "მდედრ.", "mdedrobiti"].includes(normalized)) {
      return "female";
    }
    return fallback;
  };

  useEffect(() => {
    const historyNumber = formData.historyNumber.trim();
    const requestId = ++lookupSeqRef.current;

    if (!historyNumber) {
      setLookupState("idle");
      setLookupMessage("");
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setLookupState("loading");
      setLookupMessage("მონაცემებს ვეძებ გარე რეესტრში...");

      try {
        const res = await api.get(`/patients/search-registry/${encodeURIComponent(historyNumber)}`);
        if (requestId !== lookupSeqRef.current) return;

        setFormData((prev) => ({
          ...prev,
          historyNumber: res.data.historyNumber || prev.historyNumber,
          firstName: res.data.firstName || "",
          lastName: res.data.lastName || "",
          personalId: res.data.personalId || "",
          birthDate: res.data.birthDate || "",
          gender: normalizeGender(res.data.gender, prev.gender as "male" | "female"),
          phone: res.data.phone || "",
          address: res.data.address || "",
        }));
        setLookupState("success");
        setLookupMessage("მონაცემები წარმატებით ჩაიტვირთა რეესტრიდან");
      } catch (_) {
        if (requestId !== lookupSeqRef.current) return;
        setLookupState("error");
        setLookupMessage("ამ ისტორიის ნომრით მონაცემები ვერ მოიძებნა");
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [formData.historyNumber]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/patients", formData);
      toast.success("პაციენტი წარმატებით დაემატა");
      navigate(`/patients/${res.data.id}`);
    } catch (err) {
      toast.error("პაციენტის დამატება ვერ მოხერხდა (შესაძლოა ისტორიის # ან პ/ნ უკვე არსებობს)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/")} className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all border border-transparent hover:border-slate-200">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-3xl font-bold text-slate-900">ახალი პაციენტის დამატება</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">ისტორიის ნომერი *</label>
            <input 
              required
              type="text" 
              className={`w-full p-3 rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-blue-700 transition-all ${
                lookupState === "loading"
                  ? "border-blue-400"
                  : lookupState === "success"
                    ? "border-emerald-400"
                    : lookupState === "error"
                      ? "border-red-300"
                      : "border-slate-200"
              }`}
              value={formData.historyNumber}
              onChange={(e) => setFormData({...formData, historyNumber: e.target.value})}
            />
            <p className={`mt-2 text-sm ${
              lookupState === "loading"
                ? "text-blue-600"
                : lookupState === "success"
                  ? "text-emerald-600"
                  : lookupState === "error"
                    ? "text-red-500"
                    : "text-slate-400"
            }`}>
              {lookupMessage || "ისტორიის ნომრის ჩაწერისას მონაცემები ავტომატურად წამოვა რეესტრიდან"}
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">სახელი *</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.firstName}
              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">გვარი *</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.lastName}
              onChange={(e) => setFormData({...formData, lastName: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">პირადი ნომერი *</label>
            <input 
              required
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.personalId}
              onChange={(e) => setFormData({...formData, personalId: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">სქესი</label>
            <select 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={formData.gender}
              onChange={(e) => setFormData({...formData, gender: e.target.value})}
            >
              <option value="male">მამრობითი</option>
              <option value="female">მდედრობითი</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">დაბადების თარიღი</label>
            <input 
              type="date" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.birthDate}
              onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">ტელეფონი</label>
            <input 
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">მისამართი</label>
            <input 
              type="text" 
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
            />
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 flex justify-end">
          <button 
            type="submit" 
            disabled={loading}
            className="flex items-center gap-2 bg-blue-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md disabled:opacity-50"
          >
            <Save size={20} />
            <span>შენახვა</span>
          </button>
        </div>
      </form>
    </div>
  );
}
