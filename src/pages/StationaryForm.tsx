import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Printer, Save, Plus, Trash2, Copy, FileText, Layout } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function StationaryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  
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
    fetchPatient();
    fetchTemplates();
  }, [id]);

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
      await api.post("/prescriptions", {
        type: "stationary",
        data: formData,
        patientId: parseInt(id!)
      });
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
      setFormData({ ...formData, medications: data.medications });
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

      {/* Hidden Print Version (Matching the provided PDF structure) */}
      <div className="fixed left-[-9999px] top-0">
        <div ref={printRef} className="w-[210mm] min-h-[297mm] bg-white p-[15mm] text-[10pt] font-serif leading-tight text-black">
          <div className="text-right text-[8pt] mb-2">
            20032269103637.<br/>
            დანართი 3<br/>
            ფორმა №IV-300-2/ა
          </div>
          
          <div className="border-b-2 border-black pb-2 mb-4">
            <p className="font-bold text-[12pt]">პაციენტი: {patient.firstName} {patient.lastName}, ისტ # {patient.historyNumber}, პ/ნ: {patient.personalId}</p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex gap-2">
              <span className="font-bold min-w-[150px]">დიაგნოზი/ქირურგიული ჩარევა:</span>
              <span className="border-b border-dotted border-black flex-1">{formData.diagnosis}</span>
            </div>
            <div className="flex gap-4">
              <div className="flex gap-2 flex-1">
                <span className="font-bold">ჰოსპიტალიზაციის თარიღი:</span>
                <span className="border-b border-dotted border-black flex-1">{formData.hospitalizationDate}</span>
              </div>
              <div className="flex gap-2 flex-1">
                <span className="font-bold">ქირურგიული ჩარევის თარიღი:</span>
                <span className="border-b border-dotted border-black flex-1">{formData.surgeryDate}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-bold">ალერგია (პრეპარატის დასახელება, ალერგიული რეაქციის ტიპი და ფორმა):</span>
              <span className="border-b border-dotted border-black min-h-[20px]">{formData.allergy}</span>
            </div>
          </div>

          <div className="text-center font-bold text-[14pt] mb-4">ექიმის დანიშნულების ფურცელი</div>
          
          <div className="flex gap-4 mb-4">
            <div className="flex gap-2 flex-1">
              <span className="font-bold">განყოფილება:</span>
              <span className="border-b border-dotted border-black flex-1">{formData.department}</span>
            </div>
            <div className="flex gap-2 w-1/4">
              <span className="font-bold">პალატა №:</span>
              <span className="border-b border-dotted border-black flex-1">{formData.room}</span>
            </div>
          </div>

          <table className="w-full border-collapse border border-black text-[9pt]">
            <thead>
              <tr>
                <th className="border border-black p-1 w-8">№</th>
                <th className="border border-black p-1">დანიშნულება</th>
                <th className="border border-black p-1 w-16">დრო</th>
                <th colSpan={7} className="border border-black p-1 text-center">რიცხვი</th>
              </tr>
              <tr>
                <th className="border border-black p-1 h-6"></th>
                <th className="border border-black p-1"></th>
                <th className="border border-black p-1"></th>
                {[...Array(7)].map((_, i) => <th key={i} className="border border-black p-1 w-10"></th>)}
              </tr>
            </thead>
            <tbody>
              {formData.medications.map((med, i) => (
                <tr key={i} className="min-h-[40px]">
                  <td className="border border-black p-1 text-center">{i + 1}</td>
                  <td className="border border-black p-1">
                    <div className="font-bold">{med.name}</div>
                    <div className="text-[8pt] italic">{med.description}</div>
                  </td>
                  <td className="border border-black p-1 text-center">{med.time}</td>
                  {[...Array(7)].map((_, j) => <td key={j} className="border border-black p-1"></td>)}
                </tr>
              ))}
              {/* Fill empty rows to maintain structure */}
              {[...Array(Math.max(0, 15 - formData.medications.length))].map((_, i) => (
                <tr key={`empty-${i}`} className="h-8">
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1"></td>
                  {[...Array(7)].map((_, j) => <td key={j} className="border border-black p-1"></td>)}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 space-y-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <p className="font-bold">დანიშნულება შევასრულე</p>
                <p className="text-[8pt]">მორიგე ექთანი</p>
              </div>
              <div className="border-b border-black w-64 h-6"></div>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <p className="font-bold">დანიშნულება შევასრულე</p>
                <p className="text-[8pt]">მორიგე ექიმი</p>
              </div>
              <div className="border-b border-black w-64 h-6"></div>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <p className="font-bold">დანიშნულების შესრულებას ვადასტურებ</p>
                <p className="text-[8pt]">მკურნალი ექიმი</p>
              </div>
              <div className="border-b border-black w-64 h-6"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
