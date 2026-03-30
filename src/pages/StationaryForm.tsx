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
  const autoPrintTriggeredRef = useRef(false);
  const params = new URLSearchParams(location.search);
  const prescriptionId = params.get("prescriptionId");
  const autoPrint = params.get("autoPrint") === "1";

  const getCurrentAppUser = () => {
    if (typeof window === "undefined") return null;

    try {
      const rawUser = window.localStorage.getItem("user");
      return rawUser ? JSON.parse(rawUser) : null;
    } catch (_) {
      return null;
    }
  };
  
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const normalizedPatientId = id && /^\d+$/.test(id) ? Number(id) : id || "";
  const initialUser = getCurrentAppUser();
  
  const [formData, setFormData] = useState({
    diagnosis: "",
    hospitalizationDate: new Date().toISOString().split('T')[0],
    surgeryDate: "",
    allergy: "",
    department: "",
    room: "",
    doctorId: String(initialUser?.role === "doctor" ? initialUser?.id || "" : ""),
    doctorName: String(initialUser?.role === "doctor" ? initialUser?.name || "" : "").trim(),
    doctorPhone: String(initialUser?.role === "doctor" ? initialUser?.phone || "" : "").trim(),
    juniorDoctorName: String(initialUser?.role === "junior_doctor" ? initialUser?.name || "" : "").trim(),
    juniorDoctorPhone: String(initialUser?.role === "junior_doctor" ? initialUser?.phone || "" : "").trim(),
    medications: [
      { id: Date.now(), name: "", timeSlots: Array(4).fill(""), dates: Array(7).fill("") }
    ]
  });

  const createEmptyDates = () => Array(7).fill("");
  const createEmptyTimeSlots = () => Array(4).fill("");

  const normalizeDates = (value: any) =>
    Array.isArray(value)
      ? value.slice(0, 7).concat(Array(Math.max(0, 7 - value.length)).fill("")).slice(0, 7)
      : createEmptyDates();

  const normalizeTimeSlots = (value: any, legacyTime = "") =>
    Array.isArray(value)
      ? value.slice(0, 4).concat(Array(Math.max(0, 4 - value.length)).fill("")).slice(0, 4)
      : [String(legacyTime || "").trim(), ...Array(3).fill("")];

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

  const getCurrentUserProfile = (availableStaff = staffUsers) => {
    const storedUser = getCurrentAppUser();
    if (!storedUser) return null;
    return availableStaff.find((item: any) => String(item.id || "") === String(storedUser.id || "")) || storedUser;
  };

  const normalizeDoctorFields = (data: any, availableStaff = staffUsers) => {
    const currentUser = getCurrentUserProfile(availableStaff);
    const doctorUsers = availableStaff.filter((item: any) => item.role === "doctor");
    const nextData = {
      ...data,
      doctorId: String(data?.doctorId || "").trim(),
      doctorName: String(data?.doctorName || "").trim(),
      doctorPhone: String(data?.doctorPhone || "").trim(),
      juniorDoctorName: String(data?.juniorDoctorName || "").trim(),
      juniorDoctorPhone: String(data?.juniorDoctorPhone || "").trim(),
    };

    if (!currentUser) {
      return nextData;
    }

    if (currentUser.role === "doctor") {
      return {
        ...nextData,
        doctorId: nextData.doctorId || String(currentUser.id || "").trim(),
        doctorName: nextData.doctorName || String(currentUser.name || "").trim(),
        doctorPhone: nextData.doctorPhone || String(currentUser.phone || "").trim(),
      };
    }

    if (currentUser.role === "junior_doctor") {
      const shouldDefaultJuniorDoctor = !nextData.juniorDoctorName && !nextData.doctorName;
      const selectedDoctor =
        doctorUsers.find((item: any) => String(item.id || "") === nextData.doctorId) ||
        doctorUsers.find((item: any) => String(item.name || "").trim() === nextData.doctorName) ||
        doctorUsers[0];

      return {
        ...nextData,
        doctorId: String(selectedDoctor?.id || "").trim(),
        doctorName: String(selectedDoctor?.name || "").trim(),
        doctorPhone: String(selectedDoctor?.phone || "").trim(),
        juniorDoctorName: nextData.juniorDoctorName || (shouldDefaultJuniorDoctor ? String(currentUser.name || "").trim() : ""),
        juniorDoctorPhone: nextData.juniorDoctorPhone || (shouldDefaultJuniorDoctor ? String(currentUser.phone || "").trim() : ""),
      };
    }

    if (!nextData.doctorName && doctorUsers[0]) {
      return {
        ...nextData,
        doctorId: String(doctorUsers[0].id || "").trim(),
        doctorName: String(doctorUsers[0].name || "").trim(),
        doctorPhone: String(doctorUsers[0].phone || "").trim(),
      };
    }

    return nextData;
  };

  useEffect(() => {
    fetchInitialData();
  }, [id, prescriptionId]);

  useEffect(() => {
    if (!staffUsers.length) return;
    setFormData((prev) => {
      const next = normalizeDoctorFields(prev, staffUsers);
      if (
        next.doctorId === prev.doctorId &&
        next.doctorName === prev.doctorName &&
        next.doctorPhone === prev.doctorPhone &&
        next.juniorDoctorName === prev.juniorDoctorName &&
        next.juniorDoctorPhone === prev.juniorDoctorPhone
      ) {
        return prev;
      }
      return next;
    });
  }, [staffUsers]);

  useEffect(() => {
    if (!autoPrint || loading || !patient || autoPrintTriggeredRef.current) return;
    autoPrintTriggeredRef.current = true;
    const timer = window.setTimeout(() => {
      handlePrint();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [autoPrint, loading, patient]);

  const normalizeFormData = (data: any, availableStaff = staffUsers) =>
    normalizeDoctorFields({
      diagnosis: data?.diagnosis || "",
      hospitalizationDate: data?.hospitalizationDate || new Date().toISOString().split("T")[0],
      surgeryDate: data?.surgeryDate || "",
      allergy: data?.allergy || "",
      department: data?.department || "",
      room: data?.room || "",
      doctorId: data?.doctorId || "",
      doctorName: data?.doctorName || "",
      doctorPhone: data?.doctorPhone || "",
      juniorDoctorName: data?.juniorDoctorName || "",
      juniorDoctorPhone: data?.juniorDoctorPhone || "",
      medications: Array.isArray(data?.medications) && data.medications.length > 0
        ? applySharedDatesToMedications(data.medications.map((med: any) => ({
            id: med?.id || Date.now() + Math.random(),
            name: med?.name || "",
            timeSlots: normalizeTimeSlots(med?.timeSlots, med?.time),
            dates: normalizeDates(med?.dates),
          })))
        : [{ id: Date.now(), name: "", timeSlots: createEmptyTimeSlots(), dates: createEmptyDates() }],
    }, availableStaff);

  const fetchInitialData = async () => {
    try {
      const [patientRes, templatesRes, staffRes] = await Promise.all([
        api.get(`/patients/${id}`),
        api.get("/templates"),
        api.get("/staff-users"),
      ]);
      setPatient(patientRes.data);
      setTemplates(templatesRes.data.filter((t: any) => t.type === "stationary"));
      setStaffUsers(staffRes.data);

      if (prescriptionId) {
        const prescriptionRes = await api.get(`/prescriptions/${prescriptionId}`);
        const parsed = JSON.parse(prescriptionRes.data.data || "{}");
        setFormData(normalizeFormData(parsed, staffRes.data));
      } else {
        setFormData((prev) => normalizeFormData({
          ...prev,
          room: String(patientRes.data?.room || prev.room || ""),
        }, staffRes.data));
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
        { id: Date.now(), name: "", timeSlots: createEmptyTimeSlots(), dates: createEmptyDates() }
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
    return String(medication?.name || "").trim();
  };

  const removeMedication = (medId: number) => {
    if (formData.medications.length === 1) return;
    setFormData({
      ...formData,
      medications: applySharedDatesToMedications(formData.medications.filter(m => m.id !== medId))
    });
  };

  const duplicateMedication = (medId: number) => {
    const sourceIndex = formData.medications.findIndex((medication) => medication.id === medId);
    if (sourceIndex === -1) return;

    const sourceMedication = formData.medications[sourceIndex];
    const duplicatedMedication = {
      ...sourceMedication,
      id: Date.now() + Math.random(),
      name: String(sourceMedication?.name || ""),
      timeSlots: normalizeTimeSlots(sourceMedication?.timeSlots),
      dates: normalizeDates(sourceMedication?.dates),
    };

    const nextMedications = [...formData.medications];
    nextMedications.splice(sourceIndex + 1, 0, duplicatedMedication);

    setFormData({
      ...formData,
      medications: applySharedDatesToMedications(nextMedications),
    });
  };

  const updateMedication = (medId: number, field: string, value: any) => {
    const nextMedications = formData.medications.map((med) =>
      med.id === medId ? {
        ...med,
        [field]:
          field === "dates"
            ? normalizeDates(value)
            : field === "timeSlots"
              ? normalizeTimeSlots(value)
              : value,
      } : med
    );

    setFormData({
      ...formData,
      medications: applySharedDatesToMedications(nextMedications)
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const payloadData = normalizeDoctorFields(formData);

    try {
      if (prescriptionId) {
        await api.put(`/prescriptions/${prescriptionId}`, {
          type: "stationary",
          patientHistoryNumber: patient?.historyNumber || "",
          patientPersonalId: patient?.personalId || "",
          data: payloadData,
        });
      } else {
        await api.post("/prescriptions", {
          type: "stationary",
          data: payloadData,
          patientId: normalizedPatientId,
          patientHistoryNumber: patient?.historyNumber || "",
          patientPersonalId: patient?.personalId || "",
        });
      }
      setFormData((prev) => ({
        ...prev,
        doctorId: payloadData.doctorId,
        doctorName: payloadData.doctorName,
        doctorPhone: payloadData.doctorPhone,
        juniorDoctorName: payloadData.juniorDoctorName,
        juniorDoctorPhone: payloadData.juniorDoctorPhone,
      }));
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
      const payloadData = normalizeDoctorFields(formData);
      await api.post("/templates", {
        name,
        type: "stationary",
        data: payloadData
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

    const normalizedData = normalizeDoctorFields(formData);
    const sharedDates = getSharedMedicationDates(normalizedData.medications);
    const printableItems = normalizedData.medications.map((medication: any, index: number) => ({
      index: index + 1,
      text: formatMedicationPrintLabel(medication),
      timeSlots: normalizeTimeSlots(medication?.timeSlots).map((value) => String(value || "").trim()),
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
        diagnosis: normalizedData.diagnosis,
        hospitalizationDate: formatPrintDate(normalizedData.hospitalizationDate),
        surgeryDate: formatPrintDate(normalizedData.surgeryDate),
        allergy: normalizedData.allergy,
        department: normalizedData.department,
        ward: normalizedData.room,
      },
      doctorName: normalizedData.doctorName || String(getCurrentUserProfile()?.name || "").trim(),
      items: printableItems,
    });
  };

  if (loading) return <div className="p-10 text-center">იტვირთება...</div>;

  const currentUserProfile = getCurrentUserProfile();
  const doctorUsers = staffUsers.filter((item: any) => item.role === "doctor");
  const needsDoctorPicker = currentUserProfile?.role !== "doctor" && doctorUsers.length > 0;
  const isJuniorDoctor = currentUserProfile?.role === "junior_doctor";

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/patients/${id}`)}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-800 hover:shadow-lg"
          >
            <ChevronLeft size={20} />
            <span>უკან დაბრუნება</span>
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
              {isJuniorDoctor && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">უმცროსი ექიმი</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none"
                    value={formData.juniorDoctorName || String(currentUserProfile?.name || "").trim()}
                  />
                </div>
              )}
              <div className={needsDoctorPicker && isJuniorDoctor ? "md:col-span-2" : ""}>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">მკურნალი ექიმი</label>
                {needsDoctorPicker ? (
                  <select
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.doctorId}
                    onChange={(e) => {
                      const selectedDoctor = doctorUsers.find((item: any) => String(item.id || "") === e.target.value);
                      setFormData((prev) => normalizeDoctorFields({
                        ...prev,
                        doctorId: String(selectedDoctor?.id || ""),
                        doctorName: String(selectedDoctor?.name || ""),
                        doctorPhone: String(selectedDoctor?.phone || ""),
                      }));
                    }}
                  >
                    <option value="">აირჩიეთ ექიმი</option>
                    {doctorUsers.map((doctor: any) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}{doctor.phone ? ` - ${doctor.phone}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    readOnly
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none"
                    value={formData.doctorName || String(currentUserProfile?.name || "").trim()}
                  />
                )}
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
                    <button
                      onClick={() => duplicateMedication(med.id)}
                      className="absolute top-4 right-10 text-slate-300 hover:text-blue-600"
                      title="დუბლიკატი"
                    >
                      <Copy size={16} />
                    </button>
                    <button onClick={() => removeMedication(med.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">მედიკამენტი / დანიშნულება</label>
                      <input 
                        type="text" 
                        className="w-full h-14 px-4 bg-white border border-slate-200 rounded-xl outline-none text-base"
                        value={med.name}
                        onChange={(e) => updateMedication(med.id, "name", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">დრო (4 გრაფა)</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                        {normalizeTimeSlots(med.timeSlots).map((timeValue: string, timeIndex: number) => (
                          <input
                            key={timeIndex}
                            type="text"
                            className="w-full h-14 px-3 bg-white border border-slate-200 rounded-xl outline-none text-center text-sm"
                            value={timeValue}
                            onChange={(e) => {
                              const nextTimeSlots = normalizeTimeSlots(med.timeSlots);
                              nextTimeSlots[timeIndex] = e.target.value;
                              updateMedication(med.id, "timeSlots", nextTimeSlots);
                            }}
                          />
                        ))}
                      </div>
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
                      <td className="px-[0.5mm] pt-[0.55mm] text-center">{medication ? normalizeTimeSlots(medication?.timeSlots)[0] : ""}</td>
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
