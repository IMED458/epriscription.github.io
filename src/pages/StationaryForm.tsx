import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Printer, Save, Plus, Trash2, Copy, FileText, Layout } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
      ? data.medications.map((med: any) => ({
          id: med?.id || Date.now() + Math.random(),
          name: med?.name || "",
          description: med?.description || "",
          time: med?.time || "",
          dates: Array.isArray(med?.dates) ? med.dates.slice(0, 7).concat(Array(Math.max(0, 7 - med.dates.length)).fill("")).slice(0, 7) : Array(7).fill(""),
        }))
      : [{ id: Date.now(), name: "", description: "", time: "", dates: Array(7).fill("") }],
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
      medications: [
        ...formData.medications,
        { id: Date.now(), name: "", description: "", time: "", dates: Array(7).fill("") }
      ]
    });
  };

  const removeMedication = (medId: number) => {
    if (formData.medications.length === 1) return;
    setFormData({
      ...formData,
      medications: formData.medications.filter(m => m.id !== medId)
    });
  };

  const updateMedication = (medId: number, field: string, value: any) => {
    setFormData({
      ...formData,
      medications: formData.medications.map(m => m.id === medId ? { ...m, [field]: value } : m)
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (prescriptionId) {
        await api.put(`/prescriptions/${prescriptionId}`, {
          type: "stationary",
          data: formData,
        });
      } else {
        await api.post("/prescriptions", {
          type: "stationary",
          data: formData,
          patientId: parseInt(id!)
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

  const handlePrint = async () => {
    if (!printRef.current) return;
    const canvas = await html2canvas(printRef.current, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`stationary_${patient.lastName}_${patient.historyNumber}.pdf`);
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
            <span>ბეჭდვა / PDF</span>
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
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                          value={med.name}
                          onChange={(e) => updateMedication(med.id, "name", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">დრო</label>
                        <input 
                          type="text" 
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                          value={med.time}
                          onChange={(e) => updateMedication(med.id, "time", e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">აღწერა / დოზირება</label>
                      <input 
                        type="text" 
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                        value={med.description}
                        onChange={(e) => updateMedication(med.id, "description", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">რიცხვები</label>
                      <div className="grid grid-cols-7 gap-2 mt-1">
                        {med.dates.map((dateValue: string, dateIndex: number) => (
                          <input
                            key={dateIndex}
                            type="text"
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none text-center text-xs"
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
          <img src="/assets/stationary-template.png" alt="" className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute left-[14mm] top-[21.5mm] text-[11pt] font-bold">
            პაციენტი: {patient.firstName} {patient.lastName}, იძ # {patient.historyNumber}, პ/ნ: {patient.personalId}
          </div>

          <div className="absolute left-[64mm] top-[31.8mm] w-[130mm] text-[9.5pt]">
            {formData.diagnosis}
          </div>
          <div className="absolute left-[47mm] top-[41.5mm] w-[32mm] text-[9pt] text-center">
            {formData.hospitalizationDate}
          </div>
          <div className="absolute left-[132mm] top-[41.5mm] w-[32mm] text-[9pt] text-center">
            {formData.surgeryDate}
          </div>
          <div className="absolute left-[104mm] top-[51.2mm] w-[89mm] text-[9pt]">
            {formData.allergy}
          </div>
          <div className="absolute left-[23mm] top-[88.8mm] w-[118mm] text-[9pt]">
            {formData.department}
          </div>
          <div className="absolute left-[170mm] top-[88.8mm] w-[18mm] text-[9pt] text-center">
            {formData.room}
          </div>

          <div className="absolute left-[14.5mm] top-[100.7mm] w-[182.5mm]">
            <table className="w-full table-fixed border-collapse text-[7.2pt] leading-tight">
              <colgroup>
                <col style={{ width: "9mm" }} />
                <col style={{ width: "88mm" }} />
                <col style={{ width: "18mm" }} />
                {Array.from({ length: 7 }).map((_, index) => (
                  <col key={index} style={{ width: "9.7mm" }} />
                ))}
              </colgroup>
              <tbody>
                {Array.from({ length: 18 }).map((_, rowIndex) => {
                  const medication = formData.medications[rowIndex];
                  return (
                    <tr key={rowIndex} className="h-[7.9mm] align-top">
                      <td className="px-[1mm] pt-[1.2mm] text-center font-semibold">{medication ? rowIndex + 1 : ""}</td>
                      <td className="px-[1.2mm] pt-[0.9mm]">
                        {medication ? (
                          <>
                            <div className="font-semibold">{medication.name}</div>
                            <div className="text-[6.5pt] italic">{medication.description}</div>
                          </>
                        ) : null}
                      </td>
                      <td className="px-[0.5mm] pt-[1.2mm] text-center">{medication?.time || ""}</td>
                      {Array.from({ length: 7 }).map((_, dateIndex) => (
                        <td key={dateIndex} className="px-[0.3mm] pt-[1.2mm] text-center">{medication?.dates?.[dateIndex] || ""}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="absolute left-0 top-[248mm] h-[49mm] w-full bg-white" />
          <div className="absolute left-[14mm] top-[255.5mm] text-[9.2pt] leading-tight font-semibold">
            დანიშნულება შევასრულე
            <div className="text-[7.5pt] font-normal">მორიგე ექთანი</div>
          </div>
          <div className="absolute left-[135mm] top-[260.5mm] h-0 w-[54mm] border-b border-black" />

          <div className="absolute left-[135mm] top-[272.5mm] h-0 w-[54mm] border-b border-black" />

          <div className="absolute left-[14mm] top-[278.8mm] text-[9pt] leading-tight font-semibold">
            დანიშნულებების შესრულებას ვადასტურებ
            <div className="text-[7.5pt] font-normal">მკურნალი ექიმი</div>
          </div>
          <div className="absolute left-[135mm] top-[283.8mm] h-0 w-[54mm] border-b border-black" />
        </div>
      </div>
    </div>
  );
}
