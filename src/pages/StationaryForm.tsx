import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Printer, Save, Plus, Trash2, Copy, FileText, Layout } from "lucide-react";
import api from "../lib/api";
import { printPrescription } from "../lib/printPrescription";
import { toast } from "sonner";

export default function StationaryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const printRef = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams(location.search);
  const prescriptionId = params.get("prescriptionId");
  
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const normalizedPatientId = id && /^\d+$/.test(id) ? Number(id) : id || "";
  
  const [formData, setFormData] = useState({
    diagnosis: "",
    hospitalizationDate: new Date().toISOString().split('T')[0],
    surgeryDate: "",
    allergy: "",
    department: "",
    room: "",
    medications: [
      { id: Date.now(), name: "", description: "", time: "", dates: Array(7).fill("") }
    ]
  });

  const createEmptyDates = () => Array(7).fill("");

  const normalizeDates = (value: any) =>
    Array.isArray(value)
      ? value.slice(0, 7).concat(Array(Math.max(0, 7 - value.length)).fill("")).slice(0, 7)
      : createEmptyDates();

  const getSharedMedicationDates = (medications: any[]) => {
    const source = medications.find((medication) =>
      Array.isArray(medication?.dates) &&
      medication.dates.some((cell: string) => String(cell || "").trim())
    );
    return normalizeDates(source?.dates);
  };

  const applySharedDatesToMedications = (medications: any[]) => {
    const sharedDates = getSharedMedicationDates(medications);
    return medications.map((medication, index) => ({
      ...medication,
      dates: index === 0 ? sharedDates : createEmptyDates(),
    }));
  };

  useEffect(() => {
    fetchInitialData();
  }, [id, prescriptionId]);

  const normalizeFormData = (data: any) => ({
    diagnosis: data?.diagnosis || "",
    hospitalizationDate: data?.hospitalizationDate || new Date().toISOString().split("T")[0],
    surgeryDate: data?.surgeryDate || "",
    allergy: data?.allergy || "",
    department: data?.department || "",
    room: data?.room || "",
    medications: Array.isArray(data?.medications) && data.medications.length > 0
      ? applySharedDatesToMedications(data.medications.map((med: any) => ({
          id: med?.id || Date.now() + Math.random(),
          name: med?.name || "",
          description: med?.description || "",
          time: med?.time || "",
          dates: normalizeDates(med?.dates),
        })))
      : [{ id: Date.now(), name: "", description: "", time: "", dates: createEmptyDates() }],
  });

  const fetchInitialData = async () => {
    try {
      const [patientRes, templatesRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get("/templates"),
      ]);
      setPatient(patientRes.data);
      setTemplates(templatesRes.data.filter((t: any) => t.type === "stationary"));

      if (prescriptionId) {
        const prescriptionRes = await api.get(`/prescriptions/${prescriptionId}`);
        const parsed = JSON.parse(prescriptionRes.data.data || "{}");
        setFormData(normalizeFormData(parsed));
      } else {
        setFormData((prev) => ({
          ...prev,
          room: String(patientRes.data?.room || prev.room || ""),
        }));
      }
    } catch (err) {
      toast.error("ფორმის ჩატვირთვა ვერ მოხერხდა");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const fetchPatient = async () => {
    try {
      const res = await api.get(`/patients/${id}`);
      setPatient(res.data);
    } catch (err) {
      toast.error("პაციენტი ვერ მოიძებნა");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/templates");
      setTemplates(res.data.filter((t: any) => t.type === 'stationary'));
    } catch (err) {}
  };

  const addMedication = () => {
    setFormData({
      ...formData,
      medications: applySharedDatesToMedications([
        ...formData.medications,
        { id: Date.now(), name: "", description: "", time: "", dates: createEmptyDates() }
      ])
    });
  };

  const formatPrintDate = (value: string) => {
    if (!value) return "";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;
    return `${match[3]}.${match[2]}.${match[1]}`;
  };

  const formatMedicationPrintLabel = (medication: any) => {
    return [medication?.name, medication?.description]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(", ");
  };

  const removeMedication = (medId: number) => {
    if (formData.medications.length === 1) return;
    setFormData({
      ...formData,
      medications: applySharedDatesToMedications(formData.medications.filter(m => m.id !== medId))
    });
  };

  const updateMedication = (medId: number, field: string, value: any) => {
    const nextMedications = formData.medications.map((med) =>
      med.id === medId ? { ...med, [field]: field === "dates" ? normalizeDates(value) : value } : med
    );

    setFormData({
      ...formData,
      medications: applySharedDatesToMedications(nextMedications)
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (prescriptionId) {
        await api.put(`/prescriptions/${prescriptionId}`, {
          type: "stationary",
          patientHistoryNumber: patient?.historyNumber || "",
          patientPersonalId: patient?.personalId || "",
          data: formData,
        });
      } else {
        await api.post("/prescriptions", {
          type: "stationary",
          data: formData,
          patientId: normalizedPatientId,
          patientHistoryNumber: patient?.historyNumber || "",
          patientPersonalId: patient?.personalId || "",
        });
      }
      toast.success("დანიშნულება წარმატებით შეინახა");
      navigate(`/patients/${id}`);
    } catch (err) {
      toast.error("შენახვა ვერ მოხერხდა");
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplate = async () => {
    const name = window.prompt("შეიყვანეთ შაბლონის სახელი:");
    if (!name) return;
    try {
      await api.post("/templates", {
        name,
        type: "stationary",
        data: formData
      });
      toast.success("შაბლონი შეინახა");
      fetchTemplates();
    } catch (err) {
      toast.error("შაბლონის შენახვა ვერ მოხერხდა");
    }
  };

  const applyTemplate = (template: any) => {
    try {
      const data = JSON.parse(template.data);
      setFormData(normalizeFormData(data));
      toast.success(`შაბლონი "${template.name}" გამოყენებულია`);
    } catch (err) {}
  };

  const handlePrint = () => {
    if (!patient) return;

    const sharedDates = getSharedMedicationDates(formData.medications);
    const printableItems = formData.medications.map((medication, index) => ({
      index: index + 1,
      text: formatMedicationPrintLabel(medication),
      time: String(medication?.time || "").trim(),
      dates: index === 0
        ? sharedDates.map((value: string) => String(value || "").trim()).slice(0, 7)
        : createEmptyDates(),
    }));

    printPrescription({
      patient: {
        name: `${patient.firstName || ""} ${patient.lastName || ""}`.trim(),
        historyNumber: patient.historyNumber || "",
        personalId: patient.personalId || "",
      },
      prescription: {
        diagnosis: formData.diagnosis,
        hospitalizationDate: formatPrintDate(formData.hospitalizationDate),
        surgeryDate: formatPrintDate(formData.surgeryDate),
        allergy: formData.allergy,
        department: formData.department,
        ward: formData.room,
      },
      items: printableItems,
    });
  };

  if (loading) return <div className="p-10 text-center">იტვირთება...</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/patients/${id}`)} className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all border border-transparent hover:border-slate-200">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold text-slate-900">სტაციონარის დანიშნულება</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveAsTemplate} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all">
            <Copy size={18} />
            <span>შაბლონად შენახვა</span>
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all">
            <Printer size={18} />
            <span>ბეჭდვა</span>
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-blue-700 text-white rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md">
            <Save size={18} />
            <span>შენახვა</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Form Editor */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">დიაგნოზი / ქირურგიული ჩარევა</label>
                <textarea 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-20"
                  value={formData.diagnosis}
                  onChange={(e) => setFormData({...formData, diagnosis: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">ჰოსპიტალიზაციის თარიღი</label>
                <input 
                  type="date" 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.hospitalizationDate}
                  onChange={(e) => setFormData({...formData, hospitalizationDate: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">ქირურგიული ჩარევის თარიღი</label>
                <input 
                  type="date" 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.surgeryDate}
                  onChange={(e) => setFormData({...formData, surgeryDate: e.target.value})}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">ალერგია</label>
                <input 
                  type="text" 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.allergy}
                  onChange={(e) => setFormData({...formData, allergy: e.target.value})}
                  placeholder="პრეპარატის დასახელება, რეაქციის ტიპი..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">განყოფილება</label>
                <input 
                  type="text" 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.department}
                  onChange={(e) => setFormData({...formData, department: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">პალატა №</label>
                <input 
                  type="text" 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.room}
                  onChange={(e) => setFormData({...formData, room: e.target.value})}
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900">ექიმის დანიშნულებები</h3>
                <button onClick={addMedication} className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-bold text-sm">
                  <Plus size={16} />
                  <span>დამატება</span>
                </button>
              </div>
              <div className="space-y-4">
                {formData.medications.map((med, idx) => (
                  <div key={med.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 relative">
                    <button onClick={() => removeMedication(med.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">მედიკამენტი / დანიშნულება</label>
                        <input 
                          type="text" 
                          className="w-full h-14 px-4 bg-white border border-slate-200 rounded-xl outline-none text-base"
                          value={med.name}
                          onChange={(e) => updateMedication(med.id, "name", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">დრო</label>
                        <input 
                          type="text" 
                          className="w-full h-14 px-4 bg-white border border-slate-200 rounded-xl outline-none text-base"
                          value={med.time}
                          onChange={(e) => updateMedication(med.id, "time", e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">აღწერა / დოზირება</label>
                      <input 
                        type="text" 
                        className="w-full h-14 px-4 bg-white border border-slate-200 rounded-xl outline-none text-base"
                        value={med.description}
                        onChange={(e) => updateMedication(med.id, "description", e.target.value)}
                      />
                    </div>
                    {idx === 0 && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">რიცხვები</label>
                      <div className="grid grid-cols-7 gap-2 mt-1">
                        {med.dates.map((dateValue: string, dateIndex: number) => (
                          <input
                            key={dateIndex}
                            type="text"
                            className="w-full h-14 px-3 bg-white border border-slate-200 rounded-xl outline-none text-center text-sm"
                            value={dateValue}
                            onChange={(e) => {
                              const nextDates = [...med.dates];
                              nextDates[dateIndex] = e.target.value;
                              updateMedication(med.id, "dates", nextDates);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Templates Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Layout size={18} className="text-blue-700" />
              შაბლონები
            </h3>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">შაბლონები არ არის</p>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-sm font-medium text-slate-700"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden Print Version */}
      <div className="fixed left-[-9999px] top-0">
        <div ref={printRef} className="relative w-[210mm] h-[297mm] overflow-hidden bg-white text-black" style={{ fontFamily: '"Times New Roman", "Sylfaen", serif' }}>
          <img src="/assets/stationary-template.png" alt="" className="absolute inset-0 h-full w-full object-fill" />

          <div className="absolute left-[11.7mm] top-[20.4mm] h-[10.6mm] w-[154.6mm] border-b-[0.45mm] border-black bg-white" />
          <div className="absolute left-[13.2mm] top-[22.4mm] text-[8.8pt] font-semibold">
            პაციენტი: {patient.firstName} {patient.lastName}, ის # {patient.historyNumber}, პ/ნ: {patient.personalId}
          </div>

          <div className="absolute left-[40mm] top-[36.1mm] w-[156mm] text-[8.3pt] leading-tight">
            {formData.diagnosis}
          </div>
          <div className="absolute left-[49.6mm] top-[43.8mm] h-[5.2mm] w-[25.8mm] border-b-[0.28mm] border-black bg-white text-[8.2pt] text-center">
            {formatPrintDate(formData.hospitalizationDate)}
          </div>
          <div className="absolute left-[126.3mm] top-[43.8mm] h-[5.2mm] w-[31mm] border-b-[0.28mm] border-black bg-white text-[8.2pt] text-center">
            {formatPrintDate(formData.surgeryDate)}
          </div>
          <div className="absolute left-[91.6mm] top-[52.3mm] w-[101mm] text-[8.2pt]">
            {formData.allergy}
          </div>
          <div className="absolute left-[25.2mm] top-[72.7mm] w-[100mm] text-[8.4pt]">
            {formData.department}
          </div>
          <div className="absolute left-[167.9mm] top-[72.7mm] w-[21mm] text-[8.4pt] text-center">
            {formData.room}
          </div>

          <div className="absolute left-[15.1mm] top-[103.1mm] h-[11.8mm] w-[4.8mm] bg-white" />

          <div className="absolute left-[13.5mm] top-[91.5mm] w-[181.5mm]">
            <table className="w-full table-fixed border-collapse text-[6.35pt] leading-none">
              <colgroup>
                <col style={{ width: "8.4mm" }} />
                <col style={{ width: "78.4mm" }} />
                <col style={{ width: "17.2mm" }} />
                {Array.from({ length: 7 }).map((_, index) => (
                  <col key={index} style={{ width: "11mm" }} />
                ))}
              </colgroup>
              <tbody>
                {Array.from({ length: 18 }).map((_, rowIndex) => {
                  const medication = formData.medications[rowIndex];
                  return (
                    <tr key={rowIndex} className="h-[7.05mm] align-middle">
                      <td className="pt-[0.8mm] text-center font-semibold">{medication ? rowIndex + 1 : ""}</td>
                      <td className="px-[1.1mm] pt-[0.55mm] whitespace-nowrap overflow-hidden">
                        {medication ? formatMedicationPrintLabel(medication) : ""}
                      </td>
                      <td className="px-[0.5mm] pt-[0.55mm] text-center">{medication?.time || ""}</td>
                      {Array.from({ length: 7 }).map((_, dateIndex) => (
                        <td key={dateIndex} className="px-[0.2mm] pt-[0.55mm] text-center">{medication?.dates?.[dateIndex] || ""}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
