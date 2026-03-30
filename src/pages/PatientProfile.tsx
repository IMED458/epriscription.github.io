import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Plus, FileText, ExternalLink, History, User as UserIcon, Calendar, Phone, MapPin, Fingerprint, Printer, Trash2, Building2 } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deletingPatient, setDeletingPatient] = useState(false);

  const buildFormUrl = (formType: "stationary24" | "home", params: Record<string, string>) => {
    const appBase =
      typeof window !== "undefined" && window.location.pathname !== "/"
        ? window.location.pathname.replace(/\/$/, "")
        : "";
    const search = new URLSearchParams(params);
    return `${appBase}/forms/${formType}/index.html?${search.toString()}`;
  };

  const buildStationaryUrl = (params: Record<string, string>) => {
    const search = new URLSearchParams(params);
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = `/patients/${id}/stationary?${search.toString()}`;
    return nextUrl.toString();
  };

  useEffect(() => {
    fetchPatient();
  }, [id]);

  const fetchPatient = async () => {
    try {
      const res = await api.get(`/patients/${id}`);
      setPatient(res.data);
    } catch (err) {
      toast.error("პაციენტის მონაცემები ვერ მოიძებნა");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const openPrescription = (prescription: any) => {
    if (prescription.type === "stationary") {
      navigate(`/patients/${id}/stationary?prescriptionId=${prescription.id}`);
      return;
    }

    const formType = prescription.type === "stationary24" ? "stationary24" : "home";
    window.location.href = buildFormUrl(formType, {
      patientId: String(id || ""),
      prescriptionId: String(prescription.id),
    });
  };

  const openPrescriptionPrint = (prescription: any) => {
    if (prescription.type === "stationary") {
      const popup = window.open(
        buildStationaryUrl({
          prescriptionId: String(prescription.id),
          autoPrint: "1",
        }),
        "_blank",
        "noopener"
      );
      if (!popup) {
        toast.error("ბეჭდვის ფანჯარა ვერ გაიხსნა");
      }
      return;
    }

    const formType = prescription.type === "stationary24" ? "stationary24" : "home";
    const popup = window.open(
      buildFormUrl(formType, {
        patientId: String(id || ""),
        prescriptionId: String(prescription.id),
        autoPrint: "1",
      }),
      "_blank",
      "noopener"
    );
    if (!popup) {
      toast.error("ბეჭდვის ფანჯარა ვერ გაიხსნა");
    }
  };

  const deletePrescription = async (prescriptionId: number) => {
    if (!window.confirm("ნამდვილად გსურთ ჩანაწერის წაშლა?")) return;
    try {
      await api.delete(`/prescriptions/${prescriptionId}`);
      toast.success("ჩანაწერი წაიშალა");
      fetchPatient();
    } catch (err) {
      toast.error("ჩანაწერის წაშლა ვერ მოხერხდა");
    }
  };

  const deletePatient = async () => {
    if (!patient || deletingPatient) return;

    const confirmed = window.confirm(
      `ნამდვილად გსურთ პაციენტის "${patient.firstName} ${patient.lastName}" წაშლა? ეს მოქმედება წაშლის მის დანიშნულებების ისტორიასაც.`
    );

    if (!confirmed) return;

    setDeletingPatient(true);
    try {
      const res = await api.delete(`/patients/${id}`);
      const deletedPrescriptions = Number(res.data?.deletedPrescriptions || 0);
      toast.success(
        deletedPrescriptions > 0
          ? `პაციენტი წაიშალა და მოიხსნა ${deletedPrescriptions} დანიშნულებაც`
          : "პაციენტი წაიშალა"
      );
      navigate("/");
    } catch (err) {
      toast.error("პაციენტის წაშლა ვერ მოხერხდა");
    } finally {
      setDeletingPatient(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">იტვირთება...</div>;
  if (!patient) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-800 hover:shadow-lg"
        >
          <ChevronLeft size={20} />
          <span>უკან დაბრუნება</span>
        </button>
        <h1 className="text-3xl font-bold text-slate-900">პაციენტის პროფილი</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Patient Info Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 z-0" />
            <div className="relative z-10">
              <div className="w-20 h-20 bg-blue-700 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg">
                <UserIcon size={40} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{patient.firstName} {patient.lastName}</h2>
              <p className="text-blue-700 font-mono font-bold mt-1 tracking-wider">ისტორია: #{patient.historyNumber}</p>
              
              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Fingerprint size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">პირადი ნომერი</p>
                    <p className="font-medium">{patient.personalId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">დაბადების თარიღი</p>
                    <p className="font-medium">{patient.birthDate || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Phone size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">ტელეფონი</p>
                    <p className="font-medium">{patient.phone || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">პალატა №</p>
                    <p className="font-medium">{patient.room || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">მისამართი</p>
                    <p className="font-medium">{patient.address || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-3">
            <button 
              onClick={() => navigate(`/patients/${id}/stationary?fresh=1`)}
              className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-all">
                  <FileText size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-900">სტაციონარი</p>
                  <p className="text-xs text-slate-500">დანიშნულების ფორმა</p>
                </div>
              </div>
              <Plus size={20} className="text-slate-300 group-hover:text-blue-700" />
            </button>

            <a 
              href={buildFormUrl("stationary24", {
                patientId: String(id || ""),
                fresh: "1",
              })}
              className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-orange-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 text-orange-700 rounded-xl flex items-center justify-center group-hover:bg-orange-700 group-hover:text-white transition-all">
                  <History size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-900">სტაციონარი 24სთ</p>
                  <p className="text-xs text-slate-500">გარე სისტემა</p>
                </div>
              </div>
              <ExternalLink size={20} className="text-slate-300 group-hover:text-orange-700" />
            </a>

            <a 
              href={buildFormUrl("home", {
                patientId: String(id || ""),
                fresh: "1",
              })}
              className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-emerald-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-all">
                  <MapPin size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-900">ბინა</p>
                  <p className="text-xs text-slate-500">ბინაზე დანიშნულება</p>
                </div>
              </div>
              <ExternalLink size={20} className="text-slate-300 group-hover:text-emerald-700" />
            </a>

            <button
              onClick={deletePatient}
              disabled={deletingPatient}
              className="flex items-center justify-between p-5 bg-white border border-red-200 rounded-2xl hover:border-red-500 hover:shadow-md transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 text-red-700 rounded-xl flex items-center justify-center group-hover:bg-red-700 group-hover:text-white transition-all">
                  <Trash2 size={24} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-900">პაციენტის წაშლა</p>
                  <p className="text-xs text-slate-500">
                    {deletingPatient ? "მიმდინარეობს..." : "წაშლის პაციენტს და მის ისტორიას"}
                  </p>
                </div>
              </div>
              <Trash2 size={20} className="text-red-300 group-hover:text-red-700" />
            </button>
          </div>
        </div>

        {/* Prescription History */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <History size={20} className="text-blue-700" />
                დანიშნულებების ისტორია
              </h3>
              <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                სულ: {patient.prescriptions?.length || 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[600px]">
              {patient.prescriptions?.length === 0 ? (
                <div className="p-20 text-center text-slate-400">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={32} />
                  </div>
                  <p>დანიშნულებები ჯერ არ არის შექმნილი</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {patient.prescriptions.map((pres: any) => (
                    <div key={pres.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer" onClick={() => openPrescription(pres)}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          pres.type === 'stationary' ? 'bg-blue-50 text-blue-700' : 
                          pres.type === 'stationary24' ? 'bg-orange-50 text-orange-700' : 
                          'bg-emerald-50 text-emerald-700'
                        }`}>
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {pres.type === 'stationary' ? 'სტაციონარი' : 
                             pres.type === 'stationary24' ? 'სტაციონარი 24სთ' : 'ბინა'}
                          </p>
                          <p className="text-xs text-slate-500">
                            შექმნილია: {new Date(pres.createdAt).toLocaleString('ka-GE')}
                          </p>
                          <p className="text-xs text-slate-500">
                            ავტორი: {pres.createdByName || "უცნობი მომხმარებელი"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={(e) => { e.stopPropagation(); openPrescriptionPrint(pres); }} className="p-2 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all">
                          <Printer size={18} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deletePrescription(pres.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
