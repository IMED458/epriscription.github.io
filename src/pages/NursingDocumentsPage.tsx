/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
  Printer, 
  RotateCcw,
  AlertTriangle,
  Info,
  ChevronLeft,
  ClipboardList,
  ShieldAlert,
  ArrowLeftRight,
  ArrowRight,
  Save,
  Copy,
  Droplets,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import '../nursing-documents.css';
import tmCenterLogo from '../assets/tm-center-logo.png';
import { DepartmentDatalist, DepartmentSearchInput } from '../components/DepartmentSearchInput';

const DEPARTMENT_LIST_ID = 'nursing-department-options';

// --- Types ---

type View = 'dashboard' | 'morse' | 'braden' | 'handover' | 'abcdfwc' | 'nursingAssessment' | 'bloodRequest';
type RiskLevel = 'low' | 'medium' | 'high' | 'none';

interface Criterion {
  id: string;
  label: string;
  options: { label: string; value: number }[];
}

interface PatientInfo {
  name: string;
  age: string;
  id: string;
  historyNum: string;
  gender: string;
  assessor: string;
  date: string;
  department: string;
  bloodGroup: string;
  rhesus: string;
}

const createInitialPatientInfo = (): PatientInfo => ({
  name: '',
  age: '',
  id: '',
  historyNum: '',
  gender: '',
  assessor: '',
  date: new Date().toISOString().split('T')[0],
  department: '',
  bloodGroup: '',
  rhesus: '',
});

type SerializedField = {
  index: number;
  tag: string;
  type: string;
  value: string;
  checked?: boolean;
};

type NursingDocumentPayload = {
  patientInfo: PatientInfo;
  morseScores?: Record<string, number | null>;
  bradenScores?: Record<string, number | null>;
  bloodRequest?: BloodRequestFormData;
  fields?: SerializedField[];
};

type BloodRequestFormData = {
  department: string;
  history_number: string;
  time: string;
  patient_name: string;
  blood_group: string;
  rhesus: string;
  diagnosis: string;
  transfusion_indication: string;
  eritro: boolean;
  eritro_qty: string;
  plasma: boolean;
  plasma_qty: string;
  trombo: boolean;
  trombo_qty: string;
  request_date: string;
  doctor: string;
};

const NURSING_DOC_CONFIG: Record<Exclude<View, 'dashboard'>, { title: string; prescriptionType: string; icon: React.ReactNode }> = {
  morse: {
    title: 'დაცემის მორზეს შკალა',
    prescriptionType: 'nurse_morse',
    icon: <ShieldAlert className="text-red-500" size={20} />,
  },
  braden: {
    title: 'ბრადენის შკალა',
    prescriptionType: 'nurse_braden',
    icon: <ClipboardList className="text-blue-500" size={20} />,
  },
  handover: {
    title: 'ექთნის გადაბარების ჩექლისტი',
    prescriptionType: 'nurse_handover',
    icon: <ArrowLeftRight className="text-emerald-500" size={20} />,
  },
  abcdfwc: {
    title: 'პირველადი ABCDFWC შეფასება',
    prescriptionType: 'nurse_abcdfwc',
    icon: <AlertTriangle className="text-orange-500" size={20} />,
  },
  nursingAssessment: {
    title: 'საექთნო შეფასების ფორმა',
    prescriptionType: 'nurse_assessment',
    icon: <ClipboardList className="text-violet-500" size={20} />,
  },
  bloodRequest: {
    title: 'მიმართვა სისხლის კომპონენტებზე',
    prescriptionType: 'blood_components_request',
    icon: <Droplets className="text-rose-500" size={20} />,
  },
};

const createInitialMorseScores = () => Object.fromEntries(MORSE_CRITERIA.map((criterion) => [criterion.id, null]));
const createInitialBradenScores = () => Object.fromEntries(BRADEN_CRITERIA.map((criterion) => [criterion.id, null]));

const createInitialBloodRequest = (patientInfo: PatientInfo = createInitialPatientInfo(), user: any = null): BloodRequestFormData => ({
  department: String(patientInfo.department || user?.department || ''),
  history_number: String(patientInfo.historyNum || ''),
  time: '',
  patient_name: String(patientInfo.name || ''),
  blood_group: String(patientInfo.bloodGroup || ''),
  rhesus: String(patientInfo.rhesus || ''),
  diagnosis: '',
  transfusion_indication: '',
  eritro: false,
  eritro_qty: '',
  plasma: false,
  plasma_qty: '',
  trombo: false,
  trombo_qty: '',
  request_date: String(patientInfo.date || createInitialPatientInfo().date),
  doctor: String(user?.name || ''),
});

const toDocumentView = (value: string | undefined | null): View => {
  if (!value) return 'dashboard';
  const matchingConfigEntry = Object.entries(NURSING_DOC_CONFIG).find(([, config]) => config.prescriptionType === value);
  if (matchingConfigEntry) {
    return matchingConfigEntry[0] as View;
  }
  return Object.prototype.hasOwnProperty.call(NURSING_DOC_CONFIG, value) ? (value as View) : 'dashboard';
};

const getCurrentAppUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    const rawUser = window.localStorage.getItem('user');
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (_) {
    return null;
  }
};

const normalizePatientGender = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['male', 'm', 'კაცი', 'მამრობითი', 'მამრ', 'მამრ.'].includes(normalized)) return 'კაცი';
  if (['female', 'f', 'ქალი', 'მდედრობითი', 'მდედრ', 'მდედრ.'].includes(normalized)) return 'ქალი';
  return String(value || '').trim();
};

const calculateAge = (value: string) => {
  if (!value) return '';
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : '';
};

const buildPatientInfoFromPatient = (patient: any, user: any): PatientInfo => ({
  name: `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
  age: calculateAge(String(patient?.birthDate || '')),
  id: String(patient?.personalId || ''),
  historyNum: String(patient?.historyNumber || ''),
  gender: normalizePatientGender(String(patient?.gender || '')),
  assessor: String(user?.name || ''),
  date: createInitialPatientInfo().date,
  department: String(patient?.department || user?.department || ''),
  bloodGroup: String(patient?.bloodGroup || ''),
  rhesus: String(patient?.rhesus || ''),
});

const serializeDomFields = (root: HTMLElement | null): SerializedField[] => {
  if (!root) return [];
  return Array.from(root.querySelectorAll('input, textarea, select')).map((element, index) => {
    const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const type = field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase();
    return {
      index,
      tag: field.tagName.toLowerCase(),
      type,
      value: field.value,
      checked: field instanceof HTMLInputElement ? field.checked : undefined,
    };
  });
};

const applySerializedDomFields = (root: HTMLElement | null, fields: SerializedField[] = []) => {
  if (!root || !fields.length) return;
  const elements = Array.from(root.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  fields.forEach((savedField) => {
    const field = elements[savedField.index];
    if (!field) return;
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      field.checked = Boolean(savedField.checked);
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    field.value = savedField.value || '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const mergePatientInfo = (base: PatientInfo, incoming: Partial<PatientInfo> | null | undefined): PatientInfo => ({
  ...base,
  ...(incoming || {}),
  date: String(incoming?.date || base.date || createInitialPatientInfo().date),
});

const mergeBloodRequestData = (
  base: BloodRequestFormData,
  incoming: Partial<BloodRequestFormData> | null | undefined,
): BloodRequestFormData => ({
  ...base,
  ...(incoming || {}),
  eritro: Boolean(incoming?.eritro ?? base.eritro),
  plasma: Boolean(incoming?.plasma ?? base.plasma),
  trombo: Boolean(incoming?.trombo ?? base.trombo),
});

const getDraftStorageKey = (patientId: string | undefined, view: View) => `nursing_draft_${patientId || 'unknown'}_${view}`;

const readDraftPayload = (patientId: string | undefined, view: View): NursingDocumentPayload | null => {
  if (typeof window === 'undefined' || view === 'dashboard') return null;
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(patientId, view));
    if (!raw) return null;
    return JSON.parse(raw) as NursingDocumentPayload;
  } catch (_) {
    return null;
  }
};

const writeDraftPayload = (patientId: string | undefined, view: View, payload: NursingDocumentPayload) => {
  if (typeof window === 'undefined' || view === 'dashboard') return;
  try {
    window.localStorage.setItem(getDraftStorageKey(patientId, view), JSON.stringify(payload));
  } catch (_) {
    // ignore storage quota issues
  }
};

// --- Constants (Morse Fall Scale) ---

const MORSE_CRITERIA: Criterion[] = [
  {
    id: 'falls',
    label: 'დაცემის ანამნეზი ბოლო 3 თვის განმავლობაში',
    options: [
      { label: 'არა', value: 0 },
      { label: 'კი', value: 25 },
    ],
  },
  {
    id: 'como',
    label: 'კომორბიდობები ანუ ერთზე მეტი დაავადება',
    options: [
      { label: 'არა', value: 0 },
      { label: 'კი', value: 15 },
    ],
  },
  {
    id: 'mob',
    label: 'გადაადგილების დამხმარე საშუალებები',
    options: [
      { label: 'არ იყენებს / წოლითი რეჟიმი / ექთნის დახმარება', value: 0 },
      { label: 'იყენებს ყავარჯნებს, ხელჯოხს ან ორთოპედიული სამარჯვს, ჭოჭინის სახით', value: 15 },
      { label: 'ეჭიდება ავეჯს, ან გადაადგილდება კედელ-კედელ', value: 30 },
    ],
  },
  {
    id: 'iv',
    label: 'ინტრავენური სისტემის ან ჰეპარინის ლოკის არსებობა',
    options: [
      { label: 'არა', value: 0 },
      { label: 'კი', value: 20 },
    ],
  },
  {
    id: 'gait',
    label: 'სიარული / გადაადგილება',
    options: [
      { label: 'ნორმალური / წოლითი რეჟიმი / უმოძრაო', value: 0 },
      { label: 'სიარული მოკლე ნაბიჯებით, შეჩერებებით და დაყოვნებით', value: 10 },
      { label: 'არ შეუძლია ადგომა, დადის მხოლოდ თუ ეყდნობა რაღაცას და დაბლა იყურება', value: 20 },
    ],
  },
  {
    id: 'mental',
    label: 'ფსიქიკური მდგომარეობა',
    options: [
      { label: 'იცის საკუთარი შესაძლებლობები', value: 0 },
      { label: 'პაციენტი რეალურად ვერ აცნობიერებს საკუთარ შეზღუდვებს და არარეალური წარმოდგენები აქვს საკუთარ შესაძლებლობებზე', value: 15 },
    ],
  },
];

const MORSE_INTERVENTIONS = {
  low: [
    'დაცემის დაბალი რისკის (MFS=0-24) შემთხვევაში:',
    '• პაციენტისთვის მორზეს დაცემის კალკულატორის მონაცემების შედეგების შეტყობინება;',
    '• პაციენტისთვის გამოძახების ღილაკის და საექთო პოსტის ლოკალიზაციის/ადგილმდებარეობის გაცნობა;',
    '• პაციენტისთვის დაცემის პრევენციული ზომების გაცნობა (შესაბამისი ინფორმაციის განთავსება ყველა პალატაში);',
    '• პაციენტის დაცემის შემთხვევევაში, პირველადი დახმარების გაწევა, ექიმის ინფორმირება, დაცემის ინციდენტის ფორმის შევებსა და გადაცემა უფროსი ექთნისთვის;',
    '• პაციენტის დაცემის რისკის განმეორებითი შეფასება'
  ],
  medium: [
    'დაცემის საშუალო რისკის (MFS=25-50) შემთვევაში:',
    '• დაბალი რისკის რუბრიკაში აღწერილ ღონისძიებებს პლუს დაცემის პრევენციის ღონისძიებების დეტალური გაცნობა:',
    '• საწოლიდან ან სავარძლიდან წამოდგომამდე რამდენიმე წუთი დაყოვნება მჯდომარე მდგომარეობაში და შემდგომ ნელი წამოდგომა',
    '• თავბრუს/თავბრუხვევის შემთხვევაში არ შეიძლება წამოდგომა და გამოძახებულ უნდა იქნას ექთანი შესაბამისი ღილაკის მეშვეობით',
    '• დაცემის შემთხვევაში ექთნის გამოძახება შესაბამისი ღილაკის მეშვეობით',
    '• უქუსლო, კარგი მოჭიდების მქონე ფეხსაცმლის ტარება',
    '• პაციენტის გადაადგილების გზაზე არ უნდა იყოს დაბრკოლებები და იატაკი უნდა იყოს მშრალი (ყურადღება მიექცეს სველ წერტილებს)',
    '• პალატაში ღამის განათების უზრუნველყოფა'
  ],
  high: [
    'დაცემის მაღალი რისკის (MFS >= 51) შემთხვევაში:',
    '• საშუალო რისკის რუბრიკაში აღწერილ ღონისძიებებს პლუს:',
    '• პაციენტის განთავსება საექთო პოსტთან მაქსიმალურად ახლოს',
    '• პაციენტის მუდმივი მეთვალყურეობა (საჭიროების შემთხვევაში ახლობლის ჩართულობა)',
    '• დამხმარე საშუალებების (ჭოჭინა, ხელჯოხი) გამოყენების მკაცრი კონტროლი',
    '• საჭიროების შემთხვევაში პაციენტის ფიქსაცია (მხოლოდ ექიმის დანიშნულებით და შესაბამისი პროტოკოლით)',
    '• დაცემის რისკის შესახებ საინფორმაციო ნიშნის განთავსება პაციენტის საწოლთან'
  ]
};

// --- Constants (Braden Scale) ---

const BRADEN_CRITERIA: Criterion[] = [
  {
    id: 'sensory',
    label: 'მგრძნობელობა (Sensory Perception)',
    options: [
      { label: '1. სრულად შეზღუდული', value: 1 },
      { label: '2. ძალიან შეზღუდული', value: 2 },
      { label: '3. ოდნავ შეზღუდული', value: 3 },
      { label: '4. არ არის დარღვევა', value: 4 },
    ],
  },
  {
    id: 'moisture',
    label: 'ტენიანობა (Moisture)',
    options: [
      { label: '1. მუდმივად ტენიანი', value: 1 },
      { label: '2. ძალიან ტენიანი', value: 2 },
      { label: '3. ხანდახან ტენიანი', value: 3 },
      { label: '4. იშვიათად ტენიანი', value: 4 },
    ],
  },
  {
    id: 'activity',
    label: 'აქტივობა (Activity)',
    options: [
      { label: '1. წოლითი რეჟიმი', value: 1 },
      { label: '2. მჯდომარე რეჟიმი', value: 2 },
      { label: '3. იშვიათად დადის', value: 3 },
      { label: '4. ხშირად დადის', value: 4 },
    ],
  },
  {
    id: 'mobility',
    label: 'მობილობა (Mobility)',
    options: [
      { label: '1. სრულიად უმოძრაო', value: 1 },
      { label: '2. ძალიან შეზღუდული', value: 2 },
      { label: '3. ოდნავ შეზღუდული', value: 3 },
      { label: '4. არ არის შეზღუდვა', value: 4 },
    ],
  },
  {
    id: 'nutrition',
    label: 'კვება (Nutrition)',
    options: [
      { label: '1. ძალიან ცუდი', value: 1 },
      { label: '2. სავარაუდოდ არაადეკვატური', value: 2 },
      { label: '3. ადეკვატური', value: 3 },
      { label: '4. შესანიშნავი', value: 4 },
    ],
  },
  {
    id: 'friction',
    label: 'ხახუნი და დაწოლა (Friction and Shear)',
    options: [
      { label: '1. პრობლემა', value: 1 },
      { label: '2. პოტენციური პრობლემა', value: 2 },
      { label: '3. არ არის აშკარა პრობლემა', value: 3 },
    ],
  },
];

const BRADEN_INTERVENTIONS = {
  veryHigh: [
    'ძალიან მაღალი რისკი (Score <= 9):',
    '• პაციენტის მობრუნება ყოველ 2 საათში ერთხელ მკაცრი გრაფიკით',
    '• სპეციალური ანტი-დეკუბიტალური ლეიბის გამოყენება',
    '• კანის დატენიანება და დაცვა ტენიანობისგან',
    '• კვების სტატუსის ოპტიმიზაცია (დიეტოლოგის კონსულტაცია)',
    '• ხახუნის და დაწოლის შემცირება დამხმარე საშუალებებით'
  ],
  high: [
    'მაღალი რისკი (Score 10-12):',
    '• პაციენტის მობრუნების გრაფიკის დაცვა',
    '• კანის ყოველდღიური ინსპექცია',
    '• ტენიანობის კონტროლი',
    '• დამხმარე ბალიშების გამოყენება ძვლოვანი პროექციების დასაცავად'
  ],
  moderate: [
    'საშუალო რისკი (Score 13-14):',
    '• პაციენტის მობილიზაციის წახალისება',
    '• კანის მოვლის საშუალებების გამოყენება',
    '• კვების გაუმჯობესება'
  ],
  low: [
    'დაბალი რისკი (Score 15-18):',
    '• პერიოდული მეთვალყურეობა',
    '• კანის სისუფთავის და სიმშრალის შენარჩუნება',
    '• აქტიური მოძრაობის წახალისება'
  ],
  none: [
    'რისკი არ არის (Score > 18):',
    '• სტანდარტული მოვლა'
  ]
};

const formatDisplayDate = (value: string) => {
  if (!value) return '________________';

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString('ka-GE');
};

const getMorseSelectionMeta = (criterion: Criterion, value: number | null) => {
  const option = criterion.options.find((entry) => entry.value === value);

  if (value === null || !option) {
    return {
      label: '',
      full: '',
      score: '—',
    };
  }

  return {
    label: option.label,
    full: option.label,
    score: String(value),
  };
};

const cleanInterventionItem = (value: string) => value.replace(/^•\s*/, '');
const splitPatientName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

const getSharedDateValue = (value: string) => value || createInitialPatientInfo().date;
const isMaleGender = (value: string) => value === 'კაცი' || value === 'მამრ';
const isFemaleGender = (value: string) => value === 'ქალი' || value === 'მდედრ';

// --- Components ---

const ClinicLogo = ({ compact = false }: { compact?: boolean }) => (
  <img
    src={tmCenterLogo}
    alt="HTMC TM Center"
    className={`clinic-logo ${compact ? 'clinic-logo--compact' : 'clinic-logo--default'}`}
  />
);

const DocumentTitleBlock = ({
  title,
  subtitle,
  note,
  print = false,
}: {
  title: string;
  subtitle: string;
  note?: string;
  print?: boolean;
}) => (
  <div className={`mx-auto flex flex-col items-center ${print ? 'max-w-[27rem]' : 'max-w-[34rem]'}`}>
    <ClinicLogo compact />
    <h1 className={`${print ? 'mt-2 text-lg' : 'mt-3 text-xl sm:text-2xl'} font-black text-slate-900 uppercase tracking-tight`}>
      {title}
    </h1>
    <p className={`${print ? 'mt-1 text-[11px]' : 'mt-1 text-xs'} font-bold uppercase tracking-widest text-slate-900`}>
      {subtitle}
    </p>
    {note ? (
      <p className={`${print ? 'mt-2 text-[8px]' : 'mt-2 text-[9px]'} font-semibold ${print ? 'text-slate-900' : 'text-slate-500'}`}>
        {note}
      </p>
    ) : null}
  </div>
);

const Dashboard = ({
  setView,
  patientInfo,
  setPatientInfo,
  onResetPatientInfo,
}: {
  setView: (v: View) => void;
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
  onResetPatientInfo: () => void;
}) => {
  const documents = [
    { 
      id: 'morse' as View, 
      title: 'დაცემის მორზეს შკალა', 
      description: 'პაციენტის დაცემის რისკის შეფასების ინსტრუმენტი',
      icon: <ShieldAlert className="text-red-500" size={24} />,
      color: 'hover:border-red-200 hover:bg-red-50/30'
    },
    { 
      id: 'braden' as View, 
      title: 'ბრადენის შკალა-ნაწოლები', 
      description: 'ნაწოლების განვითარების რისკის შეფასება',
      icon: <ClipboardList className="text-blue-500" size={24} />,
      color: 'hover:border-blue-200 hover:bg-blue-50/30'
    },
    { 
      id: 'handover' as View, 
      title: 'ექთნის გადაბარების ჩექლისთი', 
      description: 'პაციენტის ინფორმაციის გადაცემის სტანდარტული ფორმა',
      icon: <ArrowLeftRight className="text-emerald-500" size={24} />,
      color: 'hover:border-emerald-200 hover:bg-emerald-50/30'
    },
    {
      id: 'abcdfwc' as View,
      title: 'პირველადი ABCDFWC შეფასება',
      description: 'გადაუდებელი დახმარების დეპარტამენტის პირველადი საექთნო შეფასების ფორმა',
      icon: <AlertTriangle className="text-orange-500" size={24} />,
      color: 'hover:border-orange-200 hover:bg-orange-50/30'
    },
    {
      id: 'nursingAssessment' as View,
      title: 'საექთნო შეფასების ფორმა',
      description: 'პაციენტის სრული საექთნო შეფასების დეტალური ფორმა',
      icon: <ClipboardList className="text-violet-500" size={24} />,
      color: 'hover:border-violet-200 hover:bg-violet-50/30'
    },
    {
      id: 'bloodRequest' as View,
      title: 'მიმართვა სისხლის კომპონენტებზე',
      description: 'სისხლის ბანკისთვის მიმართვის დოკუმენტი პაციენტის ავტომატური შევსებით',
      icon: <Droplets className="text-rose-500" size={24} />,
      color: 'hover:border-rose-200 hover:bg-rose-50/30'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 screen-only">
      <div className="text-center mb-16">
        <div className="flex justify-end mb-4">
          <ClinicLogo />
        </div>
        <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-4">საექთნო დოკუმენტები</h1>
        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Nursing Documentation Portal</p>
      </div>

      <div className="mb-10 rounded-[1.75rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 mb-2">საერთო პაციენტის მონაცემები</p>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">პაციენტის მონაცემები</h2>
            <p className="text-sm font-medium leading-relaxed text-slate-500">
              ეს ველები გაზიარდება მორზეს შკალაში, ბრადენის შკალაში და მომდევნო დოკუმენტებშიც, ამიტომ ექთანს ხელახლა შეყვანა აღარ დასჭირდება.
            </p>
          </div>
          <button
            onClick={onResetPatientInfo}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            <RotateCcw size={14} /> მონაცემების გასუფთავება
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-10 gap-y-8">
          <div className="sm:col-span-8 group text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">პაციენტის სახელი, გვარი</label>
            <input
              type="text"
              value={patientInfo.name}
              onChange={e => setPatientInfo({ ...patientInfo, name: e.target.value })}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all placeholder:text-slate-200"
              placeholder="შეიყვანეთ სახელი..."
            />
          </div>
          <div className="sm:col-span-4 group text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">ასაკი</label>
            <div className="flex items-end gap-2 border-b border-slate-200 focus-within:border-slate-900 transition-all">
              <input
                type="text"
                value={patientInfo.age}
                onChange={e => setPatientInfo({ ...patientInfo, age: e.target.value })}
                className="w-full bg-transparent outline-none py-1.5 font-bold text-slate-800"
              />
              <span className="pb-1.5 text-[10px] font-bold text-slate-300 uppercase">წელი</span>
            </div>
          </div>

          <div className="sm:col-span-6 group text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">პირადი ნომერი</label>
            <input
              type="text"
              value={patientInfo.id}
              onChange={e => setPatientInfo({ ...patientInfo, id: e.target.value })}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all"
            />
          </div>
          <div className="sm:col-span-6 group text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">ისტორიის ნომერი</label>
            <input
              type="text"
              value={patientInfo.historyNum}
              onChange={e => setPatientInfo({ ...patientInfo, historyNum: e.target.value })}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all"
            />
          </div>

          <div className="sm:col-span-4 text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">სქესი</label>
            <div className="flex gap-2">
              {['კაცი', 'ქალი'].map((gender) => (
                <button
                  key={gender}
                  onClick={() => setPatientInfo({ ...patientInfo, gender })}
                  className={`flex-1 py-1.5 rounded border font-bold text-[10px] uppercase tracking-wider transition-all ${
                    patientInfo.gender === gender
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-4 group text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">შემფასებელი</label>
            <input
              type="text"
              value={patientInfo.assessor}
              onChange={e => setPatientInfo({ ...patientInfo, assessor: e.target.value })}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all"
            />
          </div>
          <div className="sm:col-span-4 group text-left">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">შეფასების თარიღი</label>
            <input
              type="date"
              value={patientInfo.date}
              onChange={e => setPatientInfo({ ...patientInfo, date: e.target.value })}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setView(doc.id)}
            className={`group text-left p-8 bg-white border border-slate-200 rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-1 ${doc.color}`}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-white transition-colors">
                {doc.icon}
              </div>
              <ArrowRight className="text-slate-200 group-hover:text-slate-400 transition-colors" size={20} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">{doc.title}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">{doc.description}</p>
          </button>
        ))}
        
        <div className="md:col-span-2 p-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-4">
            <Info size={24} />
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ახალი ფორმებიც უკვე დაემატა და კიდევაც განვაგრძობთ გაფართოებას</p>
        </div>
      </div>
    </div>
  );
};

const MorseFallScale = ({
  onBack,
  patientInfo,
  setPatientInfo,
  scores,
  setScores,
}: {
  onBack: () => void;
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
  scores: Record<string, number | null>;
  setScores: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
}) => {
  const totalScore = useMemo(() => {
    return Object.keys(scores).reduce((acc, key) => acc + (scores[key] || 0), 0);
  }, [scores]);

  const riskLevel: RiskLevel = useMemo(() => {
    if (Object.values(scores).some(v => v === null)) return 'none';
    if (totalScore >= 51) return 'high';
    if (totalScore >= 25) return 'medium';
    return 'low';
  }, [totalScore, scores]);

  const isComplete = useMemo(() => {
    return Object.values(scores).every(v => v !== null);
  }, [scores]);

  const getRiskColor = () => {
    if (riskLevel === 'high') return 'text-red-600 bg-red-50 border-red-200';
    if (riskLevel === 'medium') return 'text-amber-600 bg-amber-50 border-amber-200';
    if (riskLevel === 'low') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    return 'text-slate-400 bg-slate-50 border-slate-200';
  };

  const getRiskLabel = () => {
    if (riskLevel === 'high') return 'მაღალი';
    if (riskLevel === 'medium') return 'საშუალო';
    if (riskLevel === 'low') return 'დაბალი';
    return '—';
  };

  const getInterventionType = () => {
    if (riskLevel === 'high') return 'მაღალი რისკის ინტერვენციების სია';
    if (riskLevel === 'medium') return 'საშუალო რისკის ინტერვენციების სია';
    if (riskLevel === 'low') return 'დაბალი რისკის ინტერვენციების სია';
    return 'ინტერვენციების სია';
  };

  const handleReset = () => {
    setScores(Object.fromEntries(MORSE_CRITERIA.map(c => [c.id, null])));
  };

  return (
    <div className="print-sheet max-w-[210mm] mx-auto bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden print:max-w-none print:shadow-none print:border-0 print:rounded-none print:overflow-visible">
      <div className="screen-only">
        {/* Header Section */}
        <div className="bg-white border-b border-slate-100 px-6 pt-6 pb-7 sm:px-8 sm:pt-8 sm:pb-8 text-center">
        <div className="flex justify-between items-start mb-6 no-print">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
          >
            <ChevronLeft size={14} /> უკან დაბრუნება
          </button>
          <div className="flex gap-3">
            <button 
              onClick={handleReset} 
              className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
            >
              <RotateCcw size={14} /> ქულების გასუფთავება
            </button>
            <button 
              onClick={() => window.print()} 
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm active:scale-95"
            >
              <Printer size={14} /> ბეჭდვა
            </button>
          </div>
        </div>

        <DocumentTitleBlock
          title="დაცემის რისკის შეფასების მორზეს შკალა"
          subtitle="Morse Fall Scale Assessment Tool"
          note="განახლებულია 2024 წლის 28 მაისს"
        />
        </div>

        <div className="p-8 sm:p-12">
        {/* Patient Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-10 gap-y-8 mb-16">
          <div className="sm:col-span-8 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">პაციენტის სახელი, გვარი</label>
            <input 
              type="text" 
              value={patientInfo.name} 
              onChange={e => setPatientInfo({...patientInfo, name: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all placeholder:text-slate-200" 
              placeholder="შეიყვანეთ სახელი..."
            />
          </div>
          <div className="sm:col-span-4 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">ასაკი</label>
            <div className="flex items-end gap-2 border-b border-slate-200 focus-within:border-slate-900 transition-all">
              <input 
                type="text" 
                value={patientInfo.age} 
                onChange={e => setPatientInfo({...patientInfo, age: e.target.value})}
                className="w-full bg-transparent outline-none py-1.5 font-bold text-slate-800" 
              />
              <span className="pb-1.5 text-[10px] font-bold text-slate-300 uppercase">წელი</span>
            </div>
          </div>

          <div className="sm:col-span-6 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">პირადი ნომერი</label>
            <input 
              type="text" 
              value={patientInfo.id} 
              onChange={e => setPatientInfo({...patientInfo, id: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>
          <div className="sm:col-span-6 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">ისტორიის ნომერი</label>
            <input 
              type="text" 
              value={patientInfo.historyNum} 
              onChange={e => setPatientInfo({...patientInfo, historyNum: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">სქესი</label>
            <div className="flex gap-2">
              {['კაცი', 'ქალი'].map((g) => (
                <button
                  key={g}
                  onClick={() => setPatientInfo({...patientInfo, gender: g})}
                  className={`flex-1 py-1.5 rounded border font-bold text-[10px] uppercase tracking-wider transition-all ${
                    patientInfo.gender === g 
                    ? 'bg-slate-900 border-slate-900 text-white' 
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-4 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">შემფასებელი</label>
            <input 
              type="text" 
              value={patientInfo.assessor} 
              onChange={e => setPatientInfo({...patientInfo, assessor: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>
          <div className="sm:col-span-4 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">შეფასების თარიღი</label>
            <input 
              type="date" 
              value={patientInfo.date} 
              onChange={e => setPatientInfo({...patientInfo, date: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>
        </div>

        {/* Criteria Section */}
        <div className="space-y-6 mb-16">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">შეფასების კრიტერიუმები</h2>
            <div className="h-[1px] flex-1 bg-slate-100"></div>
          </div>

          {MORSE_CRITERIA.map((criterion, cIdx) => {
            const selected = getMorseSelectionMeta(criterion, scores[criterion.id]);

            return (
              <div key={criterion.id} className="group rounded-[1.75rem] border border-slate-200 bg-gradient-to-r from-white via-white to-slate-50/70 p-5 shadow-sm">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-[11px] font-black text-white shadow-sm">
                      {String(cIdx + 1).padStart(2, '0')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <p className="text-sm font-black text-slate-900 leading-snug">{criterion.label}</p>
                          <div className="morse-leader mt-3 hidden xl:block text-slate-200"></div>
                        </div>
                        <div className="flex items-start gap-2 xl:w-[24rem] xl:max-w-[24rem] xl:justify-end">
                          <div className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-[11px] font-semibold leading-snug ${
                            scores[criterion.id] !== null
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-400'
                          }`}>
                            {selected.label || 'აირჩიეთ პასუხი ქვემოთ'}
                          </div>
                          <span className={`inline-flex min-w-[48px] items-center justify-center rounded-xl border px-3 py-1.5 text-[10px] font-black ${
                            scores[criterion.id] !== null
                              ? 'border-slate-900 bg-slate-50 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-300'
                          }`}>
                            {selected.score}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pl-0 sm:pl-12">
                    <div className={`grid grid-cols-1 gap-2 ${criterion.options.length === 2 ? 'md:grid-cols-2' : 'xl:grid-cols-3'}`}>
                      {criterion.options.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setScores({...scores, [criterion.id]: opt.value})}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                            scores[criterion.id] === opt.value
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-[11px] font-bold leading-snug">
                              {opt.label}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              scores[criterion.id] === opt.value
                                ? 'bg-white/15 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {opt.value}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Results Summary */}
        <div className="mt-20 pt-10 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-10 items-start">
            <div className="sm:col-span-4">
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">საბოლოო ქულა</span>
                <span className="text-6xl font-black text-slate-900 block mb-3">{totalScore}</span>
                <div className={`inline-block px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest border transition-all ${getRiskColor()}`}>
                  {getRiskLabel()} რისკი
                </div>
              </div>
            </div>

            <div className="sm:col-span-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">პრევენციული ინტერვენცია</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{getInterventionType()}</p>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                {isComplete ? (
                  <div className="space-y-3">
                    {MORSE_INTERVENTIONS[riskLevel === 'none' ? 'low' : riskLevel].map((item, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0"></div>
                        <p className="text-[11px] leading-relaxed text-slate-600 font-medium">
                          {cleanInterventionItem(item)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <Info className="mx-auto text-slate-200 mb-2" size={20} />
                    <p className="text-[10px] font-bold text-slate-300 italic">გთხოვთ შეავსოთ ყველა პუნქტი რეკომენდაციების სანახავად</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 no-print">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-slate-900 flex items-center justify-center text-white font-black text-[8px]">HT</div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">HTMC Medical Center • Morse Fall Scale</p>
          </div>
          <div className="flex gap-8 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="flex flex-col gap-1">
              <span className="opacity-50">შემფასებელი</span>
              <span className="text-slate-900 border-b border-slate-200 min-w-[120px] pb-0.5"></span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="opacity-50">თარიღი</span>
              <span className="text-slate-900">{formatDisplayDate(patientInfo.date)}</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Print Version */}
      <div className="print-only bg-white text-black p-0 font-sans">
        <div className="print-break-avoid border border-black px-6 pt-4 pb-4 mb-6 text-center">
          <DocumentTitleBlock
            title="დაცემის რისკის შეფასების მორზეს შკალა"
            subtitle="Morse Fall Scale Assessment Tool"
            note="განახლებულია 2024 წლის 28 მაისს"
            print
          />
        </div>

        <div className="print-break-avoid grid grid-cols-2 gap-x-12 gap-y-4 mb-10 text-[10px]">
          <div className="border-b border-black pb-1 flex justify-between"><span>პაციენტი:</span> <span className="font-bold">{patientInfo.name || '________________'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>ასაკი:</span> <span className="font-bold">{patientInfo.age || '____'} წელი</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>პირადი №:</span> <span className="font-bold">{patientInfo.id || '________________'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>ისტორია №:</span> <span className="font-bold">{patientInfo.historyNum || '________________'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>სქესი:</span> <span className="font-bold">{patientInfo.gender || '____'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>თარიღი:</span> <span className="font-bold">{formatDisplayDate(patientInfo.date)}</span></div>
        </div>

        <table className="w-full border-collapse border border-black text-[10px] mb-10">
          <thead>
            <tr className="print-break-avoid">
              <th className="border border-black p-3 text-left uppercase tracking-widest">შეფასების კრიტერიუმი</th>
              <th className="border border-black p-3 text-center w-20 uppercase tracking-widest">ქულა</th>
            </tr>
          </thead>
          <tbody>
            {MORSE_CRITERIA.map((criterion) => {
              const selected = getMorseSelectionMeta(criterion, scores[criterion.id]);

              return (
                <tr key={criterion.id} className="print-break-avoid">
                  <td className="border border-black p-3">
                    <p className="font-bold mb-1">{criterion.label}</p>
                    <p className="text-[9px] italic font-medium">არჩეული: {selected.full || '—'}</p>
                  </td>
                  <td className="border border-black p-3 text-center font-bold text-sm">{selected.score}</td>
                </tr>
              );
            })}
            <tr className="font-black print-break-avoid">
              <td className="border border-black p-3 text-right uppercase tracking-widest">საბოლოო ქულა:</td>
              <td className="border border-black p-3 text-center text-base">{totalScore}</td>
            </tr>
          </tbody>
        </table>

        <div className="print-break-avoid border border-black p-6 mb-10">
          <div className="flex justify-between items-center mb-4 border-b border-black pb-2">
            <p className="text-[10px] font-black uppercase tracking-widest">რისკის დონე: {getRiskLabel()}</p>
          </div>
          {isComplete ? (
            <div className="space-y-2">
              {MORSE_INTERVENTIONS[riskLevel].map((item, i) => (
                <p key={i} className="text-[9px] leading-snug font-medium">• {cleanInterventionItem(item)}</p>
              ))}
            </div>
          ) : (
            <p className="text-[9px] leading-snug font-medium">გთხოვთ შეავსოთ ყველა პუნქტი რეკომენდაციების სანახავად.</p>
          )}
        </div>

        <div className="print-break-avoid flex justify-between mt-20 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex flex-col gap-2">
            <span>შემფასებელი: ________________________</span>
            <span className="text-[8px] font-medium normal-case tracking-normal">{patientInfo.assessor || '________________'}</span>
          </div>
          <p>თარიღი: {formatDisplayDate(patientInfo.date)}</p>
        </div>
      </div>
    </div>
  );
};

const BradenScale = ({
  onBack,
  patientInfo,
  setPatientInfo,
  scores,
  setScores,
}: {
  onBack: () => void;
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
  scores: Record<string, number | null>;
  setScores: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
}) => {
  const totalScore = useMemo(() => {
    return Object.keys(scores).reduce((acc, key) => acc + (scores[key] || 0), 0);
  }, [scores]);

  const riskLevel = useMemo(() => {
    if (Object.values(scores).some(v => v === null)) return 'none';
    if (totalScore <= 9) return 'veryHigh';
    if (totalScore <= 12) return 'high';
    if (totalScore <= 14) return 'moderate';
    if (totalScore <= 18) return 'low';
    return 'none';
  }, [totalScore, scores]);

  const isComplete = useMemo(() => {
    return Object.values(scores).every(v => v !== null);
  }, [scores]);

  const getRiskColor = () => {
    if (riskLevel === 'veryHigh' || riskLevel === 'high') return 'text-red-600 bg-red-50 border-red-200';
    if (riskLevel === 'moderate') return 'text-amber-600 bg-amber-50 border-amber-200';
    if (riskLevel === 'low') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    return 'text-slate-400 bg-slate-50 border-slate-200';
  };

  const getRiskLabel = () => {
    if (riskLevel === 'veryHigh') return 'ძალიან მაღალი';
    if (riskLevel === 'high') return 'მაღალი';
    if (riskLevel === 'moderate') return 'საშუალო';
    if (riskLevel === 'low') return 'დაბალი';
    return '—';
  };

  const handleReset = () => {
    setScores(Object.fromEntries(BRADEN_CRITERIA.map(c => [c.id, null])));
  };

  return (
    <div className="print-sheet max-w-[210mm] mx-auto bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden print:max-w-none print:shadow-none print:border-0 print:rounded-none print:overflow-visible">
      <div className="screen-only">
        {/* Header Section */}
        <div className="bg-white border-b border-slate-100 px-6 pt-6 pb-7 sm:px-8 sm:pt-8 sm:pb-8 text-center">
        <div className="flex justify-between items-start mb-6 no-print">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
          >
            <ChevronLeft size={14} /> უკან დაბრუნება
          </button>
          <div className="flex gap-3">
            <button 
              onClick={handleReset} 
              className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
            >
              <RotateCcw size={14} /> ქულების გასუფთავება
            </button>
            <button 
              onClick={() => window.print()} 
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm active:scale-95"
            >
              <Printer size={14} /> ბეჭდვა
            </button>
          </div>
        </div>

        <DocumentTitleBlock
          title="ბრადენის შკალა (Braden Scale)"
          subtitle="Pressure Ulcer Risk Assessment Tool"
          note="ნაწოლების განვითარების რისკის შეფასება"
        />
        </div>

        <div className="p-8 sm:p-12">
        {/* Patient Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-10 gap-y-8 mb-16">
          <div className="sm:col-span-8 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">პაციენტის სახელი, გვარი</label>
            <input 
              type="text" 
              value={patientInfo.name} 
              onChange={e => setPatientInfo({...patientInfo, name: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all placeholder:text-slate-200" 
              placeholder="შეიყვანეთ სახელი..."
            />
          </div>
          <div className="sm:col-span-4 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">ასაკი</label>
            <div className="flex items-end gap-2 border-b border-slate-200 focus-within:border-slate-900 transition-all">
              <input 
                type="text" 
                value={patientInfo.age} 
                onChange={e => setPatientInfo({...patientInfo, age: e.target.value})}
                className="w-full bg-transparent outline-none py-1.5 font-bold text-slate-800" 
              />
              <span className="pb-1.5 text-[10px] font-bold text-slate-300 uppercase">წელი</span>
            </div>
          </div>

          <div className="sm:col-span-6 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">პირადი ნომერი</label>
            <input 
              type="text" 
              value={patientInfo.id} 
              onChange={e => setPatientInfo({...patientInfo, id: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>
          <div className="sm:col-span-6 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">ისტორიის ნომერი</label>
            <input 
              type="text" 
              value={patientInfo.historyNum} 
              onChange={e => setPatientInfo({...patientInfo, historyNum: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">სქესი</label>
            <div className="flex gap-2">
              {['კაცი', 'ქალი'].map((g) => (
                <button
                  key={g}
                  onClick={() => setPatientInfo({...patientInfo, gender: g})}
                  className={`flex-1 py-1.5 rounded border font-bold text-[10px] uppercase tracking-wider transition-all ${
                    patientInfo.gender === g 
                    ? 'bg-slate-900 border-slate-900 text-white' 
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-4 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">შემფასებელი</label>
            <input 
              type="text" 
              value={patientInfo.assessor} 
              onChange={e => setPatientInfo({...patientInfo, assessor: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>
          <div className="sm:col-span-4 group">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-focus-within:text-slate-900 transition-colors">შეფასების თარიღი</label>
            <input 
              type="date" 
              value={patientInfo.date} 
              onChange={e => setPatientInfo({...patientInfo, date: e.target.value})}
              className="w-full bg-transparent border-b border-slate-200 focus:border-slate-900 outline-none py-1.5 font-bold text-slate-800 transition-all" 
            />
          </div>
        </div>

        {/* Criteria Section */}
        <div className="space-y-10 mb-16">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">შეფასების კრიტერიუმები</h2>
            <div className="h-[1px] flex-1 bg-slate-100"></div>
          </div>

          {BRADEN_CRITERIA.map((criterion, cIdx) => (
            <div key={criterion.id} className="group">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-xs font-black text-slate-300 mt-0.5">{String(cIdx + 1).padStart(2, '0')}</span>
                    <p className="text-sm font-bold text-slate-800 leading-snug">{criterion.label}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-1.5 pl-7">
                    {criterion.options.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setScores({...scores, [criterion.id]: opt.value})}
                        className={`w-full text-left px-4 py-2.5 rounded-lg border transition-all flex justify-between items-center group/btn ${
                          scores[criterion.id] === opt.value 
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                          : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-[11px] font-bold">
                          {opt.label}
                        </span>
                        <span className={`ml-4 text-[10px] font-black ${
                          scores[criterion.id] === opt.value ? 'text-white/60' : 'text-slate-300'
                        }`}>
                          {opt.value}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:w-20 flex flex-col items-center justify-center no-print pt-8 sm:pt-0">
                  <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">ქულა</div>
                  <div className={`w-12 h-10 rounded-lg border flex items-center justify-center text-sm font-black transition-all ${
                    scores[criterion.id] !== null 
                    ? 'bg-slate-50 border-slate-200 text-slate-900' 
                    : 'bg-white border-slate-50 text-slate-100'
                  }`}>
                    {scores[criterion.id] !== null ? scores[criterion.id] : '—'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Results Summary */}
        <div className="mt-20 pt-10 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-10 items-start">
            <div className="sm:col-span-4">
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">საბოლოო ქულა</span>
                <span className="text-6xl font-black text-slate-900 block mb-3">{totalScore}</span>
                <div className={`inline-block px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest border transition-all ${getRiskColor()}`}>
                  {getRiskLabel()} რისკი
                </div>
              </div>
            </div>

            <div className="sm:col-span-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-wider">პრევენციული ინტერვენცია</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">ბრადენის შკალის რეკომენდაციები</p>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                {isComplete ? (
                  <div className="space-y-3">
                    {BRADEN_INTERVENTIONS[riskLevel as keyof typeof BRADEN_INTERVENTIONS].map((item, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0"></div>
                        <p className="text-[11px] leading-relaxed text-slate-600 font-medium">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-3">
                      <Info size={20} />
                    </div>
                    <p className="text-[10px] font-bold text-slate-300 italic">გთხოვთ შეავსოთ ყველა პუნქტი რეკომენდაციების სანახავად</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 no-print">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-slate-900 flex items-center justify-center text-white font-black text-[8px]">HT</div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">HTMC Medical Center • Braden Scale</p>
          </div>
          <div className="flex gap-8 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="flex flex-col gap-1">
              <span className="opacity-50">შემფასებელი</span>
              <span className="text-slate-900 border-b border-slate-200 min-w-[120px] pb-0.5"></span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="opacity-50">თარიღი</span>
              <span className="text-slate-900">{formatDisplayDate(patientInfo.date)}</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Print Version */}
      <div className="print-only bg-white text-black p-0 font-sans">
        <div className="print-break-avoid border border-black px-6 pt-4 pb-4 mb-6 text-center">
          <DocumentTitleBlock
            title="ბრადენის შკალა (Braden Scale)"
            subtitle="Pressure Ulcer Risk Assessment Tool"
            note="ნაწოლების განვითარების რისკის შეფასება"
            print
          />
        </div>

        <div className="print-break-avoid grid grid-cols-2 gap-x-12 gap-y-4 mb-10 text-[10px]">
          <div className="border-b border-black pb-1 flex justify-between"><span>პაციენტი:</span> <span className="font-bold">{patientInfo.name || '________________'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>ასაკი:</span> <span className="font-bold">{patientInfo.age || '____'} წელი</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>პირადი №:</span> <span className="font-bold">{patientInfo.id || '________________'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>ისტორია №:</span> <span className="font-bold">{patientInfo.historyNum || '________________'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>სქესი:</span> <span className="font-bold">{patientInfo.gender || '____'}</span></div>
          <div className="border-b border-black pb-1 flex justify-between"><span>თარიღი:</span> <span className="font-bold">{formatDisplayDate(patientInfo.date)}</span></div>
        </div>

        <table className="w-full border-collapse border border-black text-[10px] mb-10">
          <thead>
            <tr className="print-break-avoid">
              <th className="border border-black p-3 text-left uppercase tracking-widest">შეფასების კრიტერიუმი</th>
              <th className="border border-black p-3 text-center w-20 uppercase tracking-widest">ქულა</th>
            </tr>
          </thead>
          <tbody>
            {BRADEN_CRITERIA.map(c => (
              <tr key={c.id} className="print-break-avoid">
                <td className="border border-black p-3">
                  <p className="font-bold mb-1">{c.label}</p>
                  <p className="text-[9px] italic font-medium">არჩეული: {c.options.find(o => o.value === scores[c.id])?.label || '—'}</p>
                </td>
                <td className="border border-black p-3 text-center font-bold text-sm">{scores[c.id] ?? '—'}</td>
              </tr>
            ))}
            <tr className="font-black print-break-avoid">
              <td className="border border-black p-3 text-right uppercase tracking-widest">საბოლოო ქულა:</td>
              <td className="border border-black p-3 text-center text-base">{totalScore}</td>
            </tr>
          </tbody>
        </table>

        <div className="print-break-avoid border border-black p-6 mb-10">
          <div className="flex justify-between items-center mb-4 border-b border-black pb-2">
            <p className="text-[10px] font-black uppercase tracking-widest">რისკის დონე: {getRiskLabel()}</p>
          </div>
          {isComplete ? (
            <div className="space-y-2">
              {BRADEN_INTERVENTIONS[riskLevel as keyof typeof BRADEN_INTERVENTIONS]?.map((item, i) => (
                <p key={i} className="text-[9px] leading-snug font-medium">• {item}</p>
              ))}
            </div>
          ) : (
            <p className="text-[9px] leading-snug font-medium">გთხოვთ შეავსოთ ყველა პუნქტი რეკომენდაციების სანახავად.</p>
          )}
        </div>

        <div className="print-break-avoid flex justify-between mt-20 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex flex-col gap-2">
            <span>შემფასებელი: ________________________</span>
            <span className="text-[8px] font-medium normal-case tracking-normal">{patientInfo.assessor || '________________'}</span>
          </div>
          <p>თარიღი: {formatDisplayDate(patientInfo.date)}</p>
        </div>
      </div>
    </div>
  );
};

const HandoverChecklist = ({
  onBack,
  patientInfo,
  setPatientInfo,
}: {
  onBack: () => void;
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
}) => {
  const { firstName, lastName } = splitPatientName(patientInfo.name);
  const defaultDate = patientInfo.date || createInitialPatientInfo().date;
  const updateSharedName = (part: 'first' | 'last', value: string) => {
    const nextFirst = part === 'first' ? value : firstName;
    const nextLast = part === 'last' ? value : lastName;
    const fullName = [nextFirst.trim(), nextLast.trim()].filter(Boolean).join(' ');

    setPatientInfo({
      ...patientInfo,
      name: fullName,
    });
  };

  return (
    <div className="print-sheet max-w-[210mm] mx-auto bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden print:max-w-none print:shadow-none print:border-0 print:rounded-none print:overflow-visible">
      <div className="handover-shell">
        <div className="handover-toolbar no-print">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
          >
            <ChevronLeft size={14} /> უკან დაბრუნება
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          >
            <Printer size={14} /> ბეჭდვა
          </button>
        </div>

        <div className="handover-page">
          <div className="page">
            <table className="header-table">
              <tbody>
                <tr>
                  <td className="logo-cell" rowSpan={3}>
                    <img src={tmCenterLogo} alt="HTMC TM Center" className="handover-logo-image" />
                  </td>
                  <td style={{ width: '150px' }}>პაციენტის სახელი</td>
                  <td><input type="text" value={firstName} onChange={(e) => updateSharedName('first', e.target.value)} /></td>
                </tr>
                <tr>
                  <td>პაციენტის გვარი</td>
                  <td><input type="text" value={lastName} onChange={(e) => updateSharedName('last', e.target.value)} /></td>
                </tr>
                <tr>
                  <td>პაციენტის ასაკი</td>
                  <td><input type="text" value={patientInfo.age} onChange={(e) => setPatientInfo({ ...patientInfo, age: e.target.value })} /></td>
                </tr>
                <tr>
                  <td>დოკუმენტის №HTMC-NMS-POL-004-1</td>
                  <td>სტაც.ისტორიის N</td>
                  <td><input type="text" value={patientInfo.historyNum} onChange={(e) => setPatientInfo({ ...patientInfo, historyNum: e.target.value })} /></td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '11px' }}>
                    დოკუმენტი განახლდა: 01.12.2024
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="title-main">პაციენტის საექთნო გადაბარების ჩექლისტი</div>

            <table className="main-table">
              <tbody>
                <tr>
                  <th className="col-name">მაჩვენებლის დასახელება</th>
                  <th className="col-value">ჩანაწერი</th>
                </tr>
                <tr><td>შევსების თარიღი</td><td><input type="date" value={defaultDate} onChange={(e) => setPatientInfo({ ...patientInfo, date: e.target.value })} /></td></tr>
                <tr><td>გადაბარების მიზანი</td><td><input type="text" /></td></tr>

                <tr className="sec-row"><td colSpan={2}>იდენტიფიკაცია /Identification</td></tr>
                <tr><td>გადააბარა: ექთანი (სახელი/გვარი)</td><td><input type="text" /></td></tr>
                <tr><td>გადაიბარა: ექთანი (სახელი/გვარი)</td><td><input type="text" /></td></tr>
                <tr><td>დეპარტამენტი</td><td><input type="text" /></td></tr>
                <tr><td>ჰოსპიტალიზაციის თარიღი</td><td><input type="date" /></td></tr>

                <tr className="sec-row"><td colSpan={2}>მდგომარეობა /Situacion</td></tr>
                <tr>
                  <td>ჩატარებული ოპერაციული ჩარევა</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="op" /> კი</label>
                      <label><input type="radio" name="op" /> არა</label>
                      <label><input type="radio" name="op" /> ემზადება ქირურგიული ჩარევისთვის</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>პაციენტის ზოგადი მდგომარეობა</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="gen" /> მძიმე ;</label>
                      <label><input type="radio" name="gen" /> საშუალო სიმძიმის;</label>
                      <label><input type="radio" name="gen" /> დამაკმაყოფილებელი;</label>
                      <label><input type="radio" name="gen" /> მზადაა გასაწერად</label>
                    </div>
                  </td>
                </tr>

                <tr className="sec-row"><td colSpan={2}>ანამნეზი /Background</td></tr>
                <tr>
                  <td>პაციენტის ძირითადი ჩივილები და სიმპტომები</td>
                  <td>
                    <div className="cr">
                      <label><input type="checkbox" /> ტკივილი ჭრილობის არეში</label>
                      <label><input type="checkbox" /> გულისრევა;</label>
                      <label><input type="checkbox" /> ღებინება;</label>
                      <label><input type="checkbox" /> ნაწლავთა გადაბერვა;</label>
                      <label><input type="checkbox" /> სითხის ბალანსის დარღვევა;</label>
                      <label><input type="checkbox" /> შეშუპება;</label>
                      <label><input type="checkbox" /> სუნთქვასთან დაკავშირებული პრობლემები</label>
                      <input type="text" style={{ width: '100%', marginTop: '2px' }} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>საექთნო დიაგნოზი</td>
                  <td>
                    1.&nbsp;<input className="ii" type="text" style={{ width: '27%' }} />
                    &nbsp;2.&nbsp;<input className="ii" type="text" style={{ width: '27%' }} />
                    &nbsp;3.&nbsp;<input className="ii" type="text" style={{ width: '27%' }} />
                  </td>
                </tr>
                <tr>
                  <td>ალერგია</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="allergy" /> კი</label>
                      <label><input type="radio" name="allergy" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>პაციენტის ფიზიკური აქტივობისა და მდებარეობის რეჟიმი</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="activity" /> იძულებით მწოლიარე;</label>
                      <label><input type="radio" name="activity" /> იძულებით მჯდომარე;</label>
                      <label><input type="radio" name="activity" /> დამხმარეს თანხლებით</label>
                      <label><input type="radio" name="activity" /> თავისუფალი</label>
                    </div>
                  </td>
                </tr>

                <tr className="sec-row"><td colSpan={2}>შეფასება /Assessment</td></tr>
                <tr><td>პულსი</td><td><input type="text" /></td></tr>
                <tr><td>არტერიული წნევა</td><td><input type="text" /></td></tr>
                <tr><td>სუნთქვის სიხშირე</td><td><input type="text" /></td></tr>
                <tr><td>ტემპერატურა</td><td><input type="text" /></td></tr>
                <tr><td>სატურაცია (SPO2)</td><td><input type="text" /></td></tr>
                <tr>
                  <td>ჟანგბადდამოკიდებულება</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="o2dep" /> კი</label>
                      <label><input type="radio" name="o2dep" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>ჟანგბადის მიწოდების წესი (O2)</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="o2" /> კი: სველი წესით</label>
                      <input className="ii" type="text" style={{ width: '70px' }} placeholder="................" />ლ/წთ
                      <label><input type="radio" name="o2" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>ტკივილის სიმძიმე</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="pain" /> 0-არ აღნიშნავს ;</label>
                      <label><input type="radio" name="pain" /> 1-3 მსუბუქი ;</label>
                      <label><input type="radio" name="pain" /> 4-6 საშუალო ტკივილი ;</label>
                      <label><input type="radio" name="pain" /> 7-9 მწვავე ტკივილი;</label>
                      <label><input type="radio" name="pain" /> 10 - გაუსაძლისი ტკივილი</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>წაქცევის რისკი</td>
                  <td><div className="cr"><label><input type="radio" name="fall" /> კი</label><label><input type="radio" name="fall" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>შარდვა</td>
                  <td><div className="cr"><label><input type="radio" name="urine" /> კი</label><label><input type="radio" name="urine" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>დეფეკაცია</td>
                  <td><div className="cr"><label><input type="radio" name="defec" /> კი</label><label><input type="radio" name="defec" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>ნუტრიცია/დიეტა (მაგიდის №)</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="nutri" /> პაციენტი უზმოდაა;</label>
                      <label><input type="radio" name="nutri" /> შაქრიანი დიაბეტი;</label>
                      შეკვეთილია კვება N<input className="ii" type="text" style={{ width: '50px' }} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>პაციენტი უზმოდაა</td>
                  <td><div className="cr"><label><input type="radio" name="fasting" /> კი</label><label><input type="radio" name="fasting" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>კათეტერი</td>
                  <td>
                    <div className="cr">
                      შ.ბ.კ-&nbsp;<label><input type="radio" name="cath1" /> კი</label>&nbsp;<label><input type="radio" name="cath1" /> არა;</label>
                      &nbsp;პ.ვ.კ&nbsp;<label><input type="radio" name="cath2" /> კი</label>&nbsp;<label><input type="radio" name="cath2" /> არა;</label>
                      &nbsp;ც.ვ.კ&nbsp;<label><input type="radio" name="cath3" /> კი</label>&nbsp;<label><input type="radio" name="cath3" /> არა;</label>
                      &nbsp;ჰ.დ.კ.&nbsp;<label><input type="radio" name="cath4" /> კი</label>&nbsp;<label><input type="radio" name="cath4" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>ზონდი</td>
                  <td>
                    <div className="cr">
                      ნაზოგასტრალური&nbsp;<label><input type="radio" name="zond1" /> კი</label>&nbsp;<label><input type="radio" name="zond1" /> არა;</label>
                      &nbsp;სხვა <input className="ii" type="text" style={{ width: '80px' }} />
                      &nbsp;<label><input type="radio" name="zond2" /> კი</label>&nbsp;<label><input type="radio" name="zond2" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>დრენაჟი</td>
                  <td>
                    <div className="cr">
                      პერიტონიუმის-<label><input type="radio" name="drain1" /> კი</label>&nbsp;<label><input type="radio" name="drain1" /> არა;</label>
                      &nbsp;რეტროპერიტონიუმი-<label><input type="radio" name="drain2" /> კი</label>&nbsp;<label><input type="radio" name="drain2" /> არა;</label>
                      &nbsp;პლევრის ღრუში-<label><input type="radio" name="drain3" /> კი</label>&nbsp;<label><input type="radio" name="drain3" /> არა;</label>
                      &nbsp;სხვა<input className="ii" type="text" style={{ width: '80px' }} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>ჭრილობის სტატუსი</td>
                  <td>
                    <div className="cr">
                      ხორცდება პირველადად-<label><input type="radio" name="w1" /> კი</label>&nbsp;<label><input type="radio" name="w1" /> არა;</label>
                      &nbsp;მეორადი დაჭიმვით-<label><input type="radio" name="w2" /> კი</label>&nbsp;<label><input type="radio" name="w2" /> არა;</label>
                      &nbsp;ჰიპერემიული-<label><input type="radio" name="w3" /> კი-</label>&nbsp;<label><input type="radio" name="w3" /> არა;</label>
                      &nbsp;ექსუდატი-<label><input type="radio" name="w4" /> კი</label>&nbsp;<label><input type="radio" name="w4" /> არა;</label>
                      &nbsp;სხვა <input className="ii" type="text" style={{ width: '80px' }} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>ნაწოლები</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="nawo" /> კი-</label> ხარისხი<input className="ii" type="text" style={{ width: '60px' }} />
                      &nbsp;<label><input type="radio" name="nawo" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>სტომები</td>
                  <td>
                    <div className="cr">
                      <label><input type="radio" name="stoma" /> კი-</label>მდებარეობა<input className="ii" type="text" style={{ width: '160px' }} />
                      &nbsp;<label><input type="radio" name="stoma" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>ენდოტრაქეული მილები</td>
                  <td><div className="cr"><label><input type="radio" name="endo" /> კი</label><label><input type="radio" name="endo" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>პაციენტის ჰიგიენა ჩატარებულია</td>
                  <td><div className="cr"><label><input type="radio" name="hygiene" /> კი</label><label><input type="radio" name="hygiene" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>საოპერაციო არე მარკირებულია</td>
                  <td><div className="cr"><label><input type="radio" name="opmark" /> კი</label><label><input type="radio" name="opmark" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>პაციენტს ანტითრომბული წინდები აცვია</td>
                  <td><div className="cr"><label><input type="radio" name="socks" /> კი</label><label><input type="radio" name="socks" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>ხელოვნური კბილები/პროთეზი,დამხმარე მოწყობილობები (თვალის კონტაქტური ლინზები,სმენის აპარატი და ა,შ) ამოღებულია</td>
                  <td><div className="cr"><label><input type="radio" name="prosth" /> კი</label><label><input type="radio" name="prosth" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>სამკაული, თმის სამაგრი მოხსნილია</td>
                  <td><div className="cr"><label><input type="radio" name="jewel" /> კი</label><label><input type="radio" name="jewel" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>ფრჩხილის ლაქი მოხსნილია</td>
                  <td><div className="cr"><label><input type="radio" name="nail" /> კი</label><label><input type="radio" name="nail" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>პაციენტს ხალათი აცვია</td>
                  <td><div className="cr"><label><input type="radio" name="gown" /> კი</label><label><input type="radio" name="gown" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>ნაწლავები მომზადებულია პროცედურისათვის (Colon prepared)</td>
                  <td><div className="cr"><label><input type="radio" name="colon" /> კი</label><label><input type="radio" name="colon" /> არა</label></div></td>
                </tr>
                <tr>
                  <td>სხვა</td>
                  <td><textarea rows={2}></textarea></td>
                </tr>

                <tr className="sec-row"><td colSpan={2}>რეკომენდაციები /Recommendations</td></tr>
                <tr>
                  <td>მიმდინარე ან დაგეგმილი ლაბორატორიული კვლევები</td>
                  <td>
                    <div className="cr">
                      <label><input type="checkbox" /> სისხლის საერთო;</label>
                      <label><input type="checkbox" /> სისხლის ბიოქიმიური სინჯები;</label>
                      <label><input type="checkbox" /> კოაგულოგრამა;</label>
                      <label><input type="checkbox" /> სისხლის იმუნოლოგიური სინჯები;</label>
                      <label><input type="checkbox" /> შარდის საერთო;</label>
                      <span className="cb-field"><input type="checkbox" /><input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /> ბაქტერიოლოგიური ანალიზი;</span>
                      <span className="cb-field"><input type="checkbox" />სხვა<input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /></span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>დაგეგმილი ინსტრუმენტული დიაგნოსტიკური კვლევები</td>
                  <td>
                    <div className="cr">
                      <span className="cb-field"><input type="checkbox" /><input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /> ექოსკოპიური კვლევა ;</span>
                      <span className="cb-field"><input type="checkbox" /><input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /> CT კვლევა;</span>
                      <span className="cb-field"><input type="checkbox" /><input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /> MRT კვლევა;</span>
                      <span className="cb-field"><input type="checkbox" /><input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /> რენტგენი;</span>
                      <span className="cb-field"><input type="checkbox" />სხვა<input className="ii" type="text" style={{ width: '100px' }} placeholder="......................" /></span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>მოვლისა და მკურნალობის გეგმა</td>
                  <td><textarea rows={3}></textarea></td>
                </tr>
                <tr>
                  <td>პაციენტის გაწერისთვის გასათვალისწინებელი საკითხები</td>
                  <td><textarea rows={3}></textarea></td>
                </tr>
              </tbody>
            </table>

            <table className="sign-table">
              <tbody>
                <tr>
                  <td colSpan={2} style={{ background: '#f2f2f2', fontWeight: 'bold', textAlign: 'center', padding: '6px' }}>
                    დავადასტუროთ მიმღებ პერსონალთან ინფორმაციის სრულყოფილად გადაბარება :
                  </td>
                </tr>
                <tr>
                  <td style={{ width: '50%' }}>გადავაბარე<br /><input className="sign-line" type="text" value={patientInfo.assessor} onChange={(e) => setPatientInfo({ ...patientInfo, assessor: e.target.value })} /></td>
                  <td style={{ width: '50%' }}>გადავიბარე<br /><input className="sign-line" type="text" /></td>
                </tr>
                <tr>
                  <td>თარიღი:<br /><input className="sign-line" type="date" value={defaultDate} onChange={(e) => setPatientInfo({ ...patientInfo, date: e.target.value })} /></td>
                  <td style={{ paddingBottom: '14px' }}>ხელმოწერა: ___________________________________</td>
                </tr>
              </tbody>
            </table>

            <button className="print-btn" onClick={() => window.print()}>დაბეჭდვა</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EmergencyAbcdfwcAssessment = ({
  onBack,
  patientInfo,
  setPatientInfo,
}: {
  onBack: () => void;
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
}) => {
  const sharedDate = getSharedDateValue(patientInfo.date);

  return (
    <div className="print-sheet max-w-[210mm] mx-auto bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden print:max-w-none print:shadow-none print:border-0 print:rounded-none print:overflow-visible">
      <div className="abcdfwc-shell">
        <div className="abcdfwc-toolbar no-print">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
          >
            <ChevronLeft size={14} /> უკან დაბრუნება
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          >
            <Printer size={14} /> ბეჭდვა
          </button>
        </div>

        <div className="abcdfwc-page">
          <div className="page">
            <div className="abcdfwc-logo-wrap">
              <ClinicLogo compact />
            </div>

            <table>
              <tbody>
                <tr className="title-row">
                  <td colSpan={10}>პაციენტის პირველადი საექთნო ABCDFWC შეფასება გადაუდებელი დახმარების დეპარტამენტში</td>
                </tr>

                <tr>
                  <td colSpan={3} style={{ fontWeight: 'bold' }}>
                    პაციენტი: <input type="text" value={patientInfo.name} onChange={(e) => setPatientInfo({ ...patientInfo, name: e.target.value })} style={{ width: '70%' }} />
                  </td>
                  <td colSpan={1} style={{ fontWeight: 'bold' }}>
                    ასაკი: <input type="text" value={patientInfo.age} onChange={(e) => setPatientInfo({ ...patientInfo, age: e.target.value })} style={{ width: '60%' }} />
                  </td>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>
                    სქესი:&nbsp;
                    <label style={{ cursor: 'pointer' }}>
                      <input type="radio" name="abcdfwc-sex" checked={isMaleGender(patientInfo.gender)} onChange={() => setPatientInfo({ ...patientInfo, gender: 'კაცი' })} style={{ cursor: 'pointer' }} /> მამრ
                    </label>
                    &nbsp;&nbsp;
                    <label style={{ cursor: 'pointer' }}>
                      <input type="radio" name="abcdfwc-sex" checked={isFemaleGender(patientInfo.gender)} onChange={() => setPatientInfo({ ...patientInfo, gender: 'ქალი' })} style={{ cursor: 'pointer' }} /> მდედრ
                    </label>
                  </td>
                  <td colSpan={4} style={{ fontWeight: 'bold' }}>
                    შემფასებელი ექთანი: <input type="text" value={patientInfo.assessor} onChange={(e) => setPatientInfo({ ...patientInfo, assessor: e.target.value })} style={{ width: '55%' }} />
                  </td>
                </tr>

                <tr>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>
                    შემოსვლის თარიღი: <input type="date" value={sharedDate} onChange={(e) => setPatientInfo({ ...patientInfo, date: e.target.value })} style={{ width: 'auto' }} />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>
                    დრო: <input type="time" style={{ width: 'auto' }} />
                  </td>
                  <td colSpan={5} style={{ fontWeight: 'bold' }}>
                    შემოსვლის გზა:&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="abcdfwc-entry" style={{ cursor: 'pointer' }} /> სდბ</label>&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="abcdfwc-entry" style={{ cursor: 'pointer' }} /> თვითდინება</label>&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="abcdfwc-entry" style={{ cursor: 'pointer' }} /> ამბულატორია</label>&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="abcdfwc-entry" style={{ cursor: 'pointer' }} /> რეფერალი</label>
                  </td>
                  <td colSpan={2}></td>
                </tr>

                <tr>
                  <td colSpan={10} className="section-header-cell">სასიცოცხლო ნიშნები და ანთროპომეტრიული მონაცემები</td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ fontWeight: 'bold' }}>
                    შეფასების თარიღი და დრო: <input type="text" value={formatDisplayDate(sharedDate)} readOnly style={{ width: '50%' }} />
                  </td>
                  <td colSpan={5} style={{ fontStyle: 'italic', color: '#555', fontSize: '10.5px' }}>
                    კომენტარი: <input type="text" style={{ width: '70%' }} />
                  </td>
                </tr>

                <tr className="vitals-header">
                  <td>ტემპ. °C</td>
                  <td>პულსი</td>
                  <td>სუნთქვა</td>
                  <td>წნევა</td>
                  <td>სატურაცია</td>
                  <td>გლუკოზა</td>
                  <td colSpan={2}>სიმაღლე</td>
                  <td colSpan={2}>წონა</td>
                </tr>
                <tr className="vitals-input">
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td colSpan={2}><input type="text" /></td>
                  <td colSpan={2}><input type="text" /></td>
                </tr>

                <tr>
                  <td rowSpan={5} className="section-label" style={{ background: '#f2f2f2' }}>სასუნთქი გზები AIRWAYS</td>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> თავისუფალი/გამტარი</label>
                      <label><input type="checkbox" /> ინჰალაციური დაზიანება</label>
                      <label><input type="checkbox" /> ნაწილობრივ გამტარი</label>
                      <label><input type="checkbox" /> ჭარბი სეკრეტი/ნერწყვდენა</label>
                      <label><input type="checkbox" /> ენდოტრაქეული მილი</label>
                      <label><input type="checkbox" /> ობსტრუქციის რისკი</label>
                      <label><input type="checkbox" /> ხმაურიანი სუნთქვა</label>
                    </div>
                  </td>
                  <td colSpan={4} className="right-header-cell">გადაუდებელი საექთნო დახმარება</td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> სასუნთქი გზების მანუალური გათავისუფლება გამტარია</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> სეკრეტის ასპირაცია</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> სასუნთქი გზების გამავლობის მექანიკური აღდგენა</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>

                <tr>
                  <td rowSpan={7} className="section-label" style={{ background: '#f2f2f2' }}>სუნთქვა BREATHING</td>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> არარეგულარული</label>
                      <label><input type="checkbox" /> ძალდატანებითი/ორთოპნოე</label>
                      <label><input type="checkbox" /> ზედაპირული</label>
                      <label><input type="checkbox" /> მშრალი ხველა</label>
                      <label><input type="checkbox" /> ღრმა</label>
                      <label><input type="checkbox" /> ჩირქოვანი ნახველი</label>
                      <label><input type="checkbox" /> აპნოე</label>
                      <label><input type="checkbox" /> სისხლიანი ნახველი</label>
                    </div>
                  </td>
                  <td colSpan={4}>
                    <div className="cr">
                      <label><input type="checkbox" /> ოქსიგენოთერაპია</label>
                      <input className="ii" type="text" style={{ width: '50px' }} placeholder="______" /> ლ/წთ სიჩქარით
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> არტერიული აირების ანალიზი</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ნებულაიზერით ინჰალაცია</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> არაინვაზიური ვენტილაციის დაწყება</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>

                <tr>
                  <td rowSpan={6} className="section-label" style={{ background: '#f2f2f2' }}>ცირკულაცია CIRCULATION</td>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> დაჭიმული პულსი</label>
                      <label><input type="checkbox" /> არეგულარული</label>
                      <label><input type="checkbox" /> სუსტი ავსების პულსი</label>
                      <label><input type="checkbox" /> საუღლე ვენების შებერვა</label>
                      <label><input type="checkbox" /> პულსი არ ისიჯება</label>
                      <label><input type="checkbox" /> გენერალიზებული შეშუპება</label>
                      <label><input type="checkbox" /> რეგულარული</label>
                      <label><input type="checkbox" /> ლოკალური შეშუპება</label>
                      <label><input type="checkbox" /> მხედველობის დარღვევა</label>
                      <label><input type="checkbox" /> სმენის დარღვევა</label>
                      <label><input type="checkbox" /> მეტყველების დარღვევა</label>
                      <label><input type="checkbox" /> კიდურების სისუსტე</label>
                      <label><input type="checkbox" /> სახის ასიმეტრია</label>
                    </div>
                  </td>
                  <td colSpan={4}><div className="cr"><label><input type="checkbox" /> მონიტორინგი</label></div></td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ეკგ გადაღება</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ივ კანულა</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> სხვა</label><input className="ii" type="text" style={{ width: '120px' }} /></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4} style={{ borderTop: '2px solid #555', fontSize: '10px', color: '#555', padding: '2px 6px' }}>─────────────────────────────────────────────────────</td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>

                <tr>
                  <td rowSpan={5} className="section-label" style={{ background: '#f2f2f2' }}>უუნარობა DISABILITY</td>
                  <td colSpan={4} style={{ verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Glasgow Coma Scale:</div>
                    <div style={{ marginBottom: '2px' }}>თვალის გახელა &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <input className="ii" type="text" style={{ width: '35px' }} placeholder="____" /> ქულა</div>
                    <div style={{ marginBottom: '2px' }}>მოტორული პასუხი &nbsp; <input className="ii" type="text" style={{ width: '35px' }} placeholder="____" /> ქულა</div>
                    <div style={{ marginBottom: '2px' }}>ვერბალური პასუხი &nbsp;&nbsp; <input className="ii" type="text" style={{ width: '35px' }} placeholder="____" /> ქულა</div>
                    <div>ჯამი &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <input className="ii" type="text" style={{ width: '60px' }} placeholder="__________" /> ქულა</div>
                  </td>
                  <td colSpan={1}></td>
                  <td colSpan={4}><div className="cr"><label><input type="checkbox" /> პაციენტის შესაბამისი პოზიციონირება</label></div></td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ჰიპოგლიკემიის კორექცია</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> რადიოლოგიური კვლევისთვის მომზადება</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr">სხვა<input className="ii" type="text" style={{ width: '160px' }} placeholder="────────────────────────────────────────────────────────────────" /></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>

                <tr>
                  <td rowSpan={5} className="section-label" style={{ background: '#f2f2f2' }}>მოტეხილობა FRACTURES</td>
                  <td colSpan={9}>ლოკალიზაცია: <input type="text" style={{ width: '80%' }} /></td>
                </tr>
                <tr>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> ღია მოტეხილობა</label>
                      <label><input type="checkbox" /> პულსი არ ისინჯება</label>
                      <label><input type="checkbox" /> დეფორმაცია</label>
                      <label><input type="checkbox" /> მგრძნობელობა ↓</label>
                      <label><input type="checkbox" /> იმობილიზებულია</label>
                    </div>
                  </td>
                  <td colSpan={4}><div className="cr"><label><input type="checkbox" /> ჭრილობის დამუშავება/მოვლა</label></div></td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ურგენტული მანიპულაციისთვის მომზადება</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr">სხვა<input className="ii" type="text" style={{ width: '160px' }} placeholder="────────────────────────────────────────────────────────────────" /></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>

                <tr>
                  <td rowSpan={5} className="section-label" style={{ background: '#f2f2f2' }}>ჭრილობა დამწვრობა WOUNDS</td>
                  <td colSpan={9}>ლოკალიზაცია: <input type="text" style={{ width: '80%' }} /></td>
                </tr>
                <tr>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> არასისხლდმენი</label>
                      <label><input type="checkbox" /> დაბინძურება</label>
                      <label><input type="checkbox" /> მცირე სისხლდენა</label>
                      <label><input type="checkbox" /> ინფიცირება</label>
                      <label><input type="checkbox" /> მასიური სისხლდენა</label>
                      <label><input type="checkbox" /> უცხო სხეული ჭრილობაში</label>
                    </div>
                  </td>
                  <td colSpan={4}><div className="cr"><label><input type="checkbox" /> დამწვრობის/ჭრილობის დამუშავება/მოვლა</label></div></td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ურგენტული მანიპულაციისთვის მომზადება</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr">სხვა<input className="ii" type="text" style={{ width: '160px' }} placeholder="────────────────────────────────────────────────────────────────" /></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>

                <tr>
                  <td rowSpan={5} className="section-label" style={{ background: '#f2f2f2' }}>კომფორტი COMFORT</td>
                  <td colSpan={3}>ტკივილი 1-10 ქ &nbsp;<input className="ii" type="text" style={{ width: '50px' }} placeholder="________" /></td>
                  <td colSpan={6}>ლოკალიზაცია: <input className="ii" type="text" style={{ width: '55%' }} placeholder="________________" /></td>
                </tr>
                <tr>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> გარდამავალი</label>
                      <label><input type="checkbox" /> უეცარი და ძლიერი</label>
                      <label><input type="checkbox" /> მუდმივი</label>
                      <label><input type="checkbox" /> ყრუ</label>
                      <label><input type="checkbox" /> მწველი</label>
                      <label><input type="checkbox" /> სხვა <input className="ii" type="text" style={{ width: '80px' }} placeholder="__________________________" /></label>
                    </div>
                  </td>
                  <td colSpan={4}><div className="cr"><label><input type="checkbox" /> ანალგეზია</label></div></td>
                </tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> კვლევისთვის/მანიპულაციისთვის მომზადება</label></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}><div className="cr">სხვა<input className="ii" type="text" style={{ width: '160px' }} placeholder="────────────────────────────────────────────────────────────────" /></div></td></tr>
                <tr><td colSpan={5}></td><td colSpan={4}></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const NursingAssessmentForm = ({
  onBack,
  patientInfo,
  setPatientInfo,
}: {
  onBack: () => void;
  patientInfo: PatientInfo;
  setPatientInfo: React.Dispatch<React.SetStateAction<PatientInfo>>;
}) => {
  const sharedDate = getSharedDateValue(patientInfo.date);

  return (
    <div className="print-sheet max-w-[210mm] mx-auto bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden print:max-w-none print:shadow-none print:border-0 print:rounded-none print:overflow-visible">
      <div className="nursing-assessment-shell">
        <div className="nursing-assessment-toolbar no-print">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-all font-bold text-[10px] uppercase tracking-wider"
          >
            <ChevronLeft size={14} /> უკან დაბრუნება
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          >
            <Printer size={14} /> ბეჭდვა
          </button>
        </div>

        <div className="nursing-assessment-page">
          <div className="page">
            <div className="nursing-assessment-logo-wrap">
              <ClinicLogo compact />
            </div>

            <table>
              <tbody>
                <tr className="title-row">
                  <td colSpan={10}>პაციენტის საექთნო შეფასების ფორმა</td>
                </tr>

                <tr>
                  <td colSpan={3} style={{ fontWeight: 'bold' }}>
                    პაციენტი: <input type="text" value={patientInfo.name} onChange={(e) => setPatientInfo({ ...patientInfo, name: e.target.value })} style={{ width: '65%' }} />
                  </td>
                  <td colSpan={1} style={{ fontWeight: 'bold' }}>
                    ასაკი: <input type="text" value={patientInfo.age} onChange={(e) => setPatientInfo({ ...patientInfo, age: e.target.value })} style={{ width: '55%' }} />
                  </td>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>
                    სქესი:&nbsp;
                    <label style={{ cursor: 'pointer' }}>
                      <input type="radio" name="nursing-sex" checked={isMaleGender(patientInfo.gender)} onChange={() => setPatientInfo({ ...patientInfo, gender: 'კაცი' })} style={{ cursor: 'pointer', accentColor: '#000' }} /> მამრ
                    </label>
                    &nbsp;&nbsp;
                    <label style={{ cursor: 'pointer' }}>
                      <input type="radio" name="nursing-sex" checked={isFemaleGender(patientInfo.gender)} onChange={() => setPatientInfo({ ...patientInfo, gender: 'ქალი' })} style={{ cursor: 'pointer', accentColor: '#000' }} /> მდედრ
                    </label>
                  </td>
                  <td colSpan={4} rowSpan={2} style={{ fontWeight: 'bold', verticalAlign: 'top' }}>
                    შემფასებელი ექთანი (სახელი, გვარი, ხელმოწერა)
                    <br />
                    <textarea rows={3} value={patientInfo.assessor} onChange={(e) => setPatientInfo({ ...patientInfo, assessor: e.target.value })}></textarea>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>
                    შემოსვლის თარიღი: <input type="date" value={sharedDate} onChange={(e) => setPatientInfo({ ...patientInfo, date: e.target.value })} style={{ width: 'auto' }} />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>
                    დრო: <input type="time" style={{ width: 'auto' }} />
                  </td>
                  <td colSpan={3} style={{ fontWeight: 'bold' }}>
                    შემოსვლის გზა:&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="nursing-entry" style={{ cursor: 'pointer', accentColor: '#000' }} /> სდბ</label>&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="nursing-entry" style={{ cursor: 'pointer', accentColor: '#000' }} /> თვითდინება</label>&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="nursing-entry" style={{ cursor: 'pointer', accentColor: '#000' }} /> ამბულატორია</label>&nbsp;
                    <label style={{ cursor: 'pointer' }}><input type="radio" name="nursing-entry" style={{ cursor: 'pointer', accentColor: '#000' }} /> რეფერალი</label>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>დეპარტამენტი/პალატა:</td>
                  <td colSpan={8}><input type="text" /></td>
                </tr>

                <tr>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>მობილობა შემოსვლისას</td>
                  <td colSpan={8}>
                    <div className="cr">
                      <label><input type="radio" name="mob" /> გადაადგილება დამოუკიდებლად</label>
                      <label><input type="radio" name="mob" /> სავარძლით</label>
                      <label><input type="radio" name="mob" /> სტრეტჩერით</label>
                      <label><input type="radio" name="mob" /> სხვა <input className="ii" style={{ width: '120px' }} type="text" placeholder="__________________________" /></label>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>ძირითადი ჩივილი</td>
                  <td colSpan={8}><input type="text" placeholder="_________________________________________________________________________________________________" /></td>
                </tr>

                <tr>
                  <td colSpan={2} style={{ fontWeight: 'bold' }}>ცნობიერება შემოსვლისას</td>
                  <td colSpan={8}>
                    <div className="cr">
                      <label><input type="radio" name="cons" /> ნათელი</label>
                      <label><input type="radio" name="cons" /> დაბინდული</label>
                      <label><input type="radio" name="cons" /> ძილიანობა</label>
                      <label><input type="radio" name="cons" /> სტუპორი</label>
                      <label><input type="radio" name="cons" /> კომა</label>
                    </div>
                  </td>
                </tr>

                <tr className="sec-hdr">
                  <td colSpan={10}>სასიცოცხლო ნიშნები და ანთროპომეტრიული მონაცემები</td>
                </tr>
                <tr>
                  <td colSpan={6} style={{ fontWeight: 'bold' }}>
                    შეფასების თარიღი და დრო: <input type="text" value={formatDisplayDate(sharedDate)} readOnly style={{ width: '55%' }} />
                  </td>
                  <td colSpan={4} style={{ fontWeight: 'bold' }}>
                    შემფასებელი ექთანი: <input type="text" value={patientInfo.assessor} onChange={(e) => setPatientInfo({ ...patientInfo, assessor: e.target.value })} style={{ width: '55%' }} />
                  </td>
                </tr>
                <tr className="vitals-hdr">
                  <td>ტემპ. °C</td>
                  <td>პულსი</td>
                  <td>რესპირაცია</td>
                  <td>წნევა</td>
                  <td>სატურაცია</td>
                  <td>გლუკოზა</td>
                  <td colSpan={2}>სიმაღლე</td>
                  <td colSpan={2}>წონა</td>
                </tr>
                <tr className="vitals-inp">
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td><input type="text" /></td>
                  <td colSpan={2}><input type="text" /></td>
                  <td colSpan={2}><input type="text" /></td>
                </tr>

                <tr>
                  <td rowSpan={6} className="sec-label">ანამნეზი</td>
                  <td colSpan={9} style={{ fontWeight: 'bold' }}>ალერგია: <input type="text" style={{ width: '80%' }} placeholder="_______________________________________________________________________________________________" /></td>
                </tr>
                <tr>
                  <td colSpan={9}>
                    <div className="cr">
                      <span style={{ fontWeight: 'bold' }}>მიმდინარე ორსულობა:</span>
                      <label><input type="radio" name="preg" /> კი</label>
                      <label><input type="radio" name="preg" /> არა</label>
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9} style={{ fontWeight: 'bold' }}>ქრონიკული დაავადებები: <input type="text" style={{ width: '75%' }} placeholder="_____________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={9} style={{ fontWeight: 'bold' }}>მიმდინარე მედიკამენტები: <input type="text" style={{ width: '73%' }} placeholder="____________________________________________________________________________________________________________" /></td></tr>
                <tr>
                  <td colSpan={5}>
                    <div className="cr">
                      <span style={{ fontWeight: 'bold' }}>ნარკოდამოკიდებულება:</span>
                      <label><input type="radio" name="narc" /> კი</label>
                      <label><input type="radio" name="narc" /> არა</label>
                      <input className="ii" type="text" style={{ width: '120px' }} />
                    </div>
                  </td>
                  <td colSpan={4}>
                    <span style={{ fontWeight: 'bold' }}>მწეველობა:</span>
                    <input className="ii" type="text" style={{ width: '80px' }} placeholder="__________________" /> ღერი დღეში
                  </td>
                </tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={5} className="sec-label">ნუტრიცია / მეტაბოლიზმი</td>
                  <td colSpan={5}>
                    <div className="cr" style={{ fontWeight: 'bold', marginBottom: '3px' }}>კვება:</div>
                    <div className="cr">
                      <label><input type="checkbox" /> კვება დამოუკიდებლად</label>
                      <label><input type="checkbox" /> გასტროსტომით</label>
                      <label><input type="checkbox" /> ყლაპვის გაძნელება</label>
                      <label><input type="checkbox" /> სჭირდება დახმარება</label>
                      <label><input type="checkbox" /> იეიუნოსტომით</label>
                      <label><input type="checkbox" /> გულისრევა</label>
                      <label><input type="checkbox" /> ნაზოგასტრული ზონდით</label>
                      <label><input type="checkbox" /> პარენტერალური კვება</label>
                      <label><input type="checkbox" /> ნორმული მადა</label>
                      <label><input type="checkbox" /> ოროგასტრული ზონდით</label>
                      <label><input type="checkbox" /> ღებინება</label>
                      <label><input type="checkbox" /> მადის დაქვეითება</label>
                      <label><input type="checkbox" /> NPO (არაფერი ორალურად)</label>
                      <label><input type="checkbox" /> მადის გაძლიერება</label>
                      <label><input type="checkbox" /> სხვა <input className="ii" type="text" style={{ width: '90px' }} /></label>
                    </div>
                  </td>
                  <td colSpan={4}>
                    <div className="cr" style={{ fontWeight: 'bold', marginBottom: '3px' }}>დიეტა:</div>
                    <div className="cr">
                      <label><input type="checkbox" /> ორდინარული</label>
                      <label><input type="checkbox" /> თხევადი</label>
                      <label><input type="checkbox" /> დიაბეტის დიეტა</label>
                      <label><input type="checkbox" /> დაბალნატრიუმიანი</label>
                      <label><input type="checkbox" /> ცილით მდიდარი</label>
                      <label><input type="checkbox" /> ცილით ღრიბი</label>
                      <label><input type="checkbox" /> სხვა <input className="ii" type="text" style={{ width: '90px' }} /></label>
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={9} className="sec-label">კანის შეფასება</td>
                  <td colSpan={4}>ჭრილობა (ლოკალიზაცია): <input className="ii" type="text" style={{ width: '55%' }} /></td>
                  <td colSpan={5}>დამწვრობა (ლოკალიზაცია): <input className="ii" type="text" style={{ width: '55%' }} /></td>
                </tr>
                <tr>
                  <td colSpan={4}>
                    <div className="cr">
                      <label><input type="checkbox" /> აბრაზია</label>
                      <label><input type="checkbox" /> ჰემატომა</label>
                      <label><input type="checkbox" /> ექკიმოზი</label>
                      <label><input type="checkbox" /> გამონაყარი</label>
                      <label><input type="checkbox" /> პეტექია</label>
                      <label><input type="checkbox" /> ლაცერაცია</label>
                    </div>
                  </td>
                  <td colSpan={5}>
                    ნაკერები (ლოკალიზაცია): <input className="ii" type="text" style={{ width: '70%' }} />
                    <br />
                    სიმსივნური წარმონაქმნი (ლოკალიზაცია): <input className="ii" type="text" style={{ width: '50%' }} />
                  </td>
                </tr>
                <tr>
                  <td colSpan={9}>
                    <div className="cr">
                      <label><input type="checkbox" /> დაქვეითებული ტურგორი</label>
                      <label><input type="checkbox" /> სიყვითლე</label>
                      <label><input type="checkbox" /> ციანოზი</label>
                      <label><input type="checkbox" /> ფერმკრთალი</label>
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9}>ნაწოლი (ლოკალიზაცია): <input type="text" style={{ width: '80%' }} placeholder="_____________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={9}><div className="cr"><label><input type="radio" name="nawo" /> ხარისხი 1: ლოკალური შეწითლება, კანის მთლიანობის დარღვევის გარეშე</label></div></td></tr>
                <tr><td colSpan={9}><div className="cr"><label><input type="radio" name="nawo" /> ხარისხი 2: ბუშტუკი ან კრატერის ფორმის მცირე ზომის დეფექტი</label></div></td></tr>
                <tr><td colSpan={9}><div className="cr"><label><input type="radio" name="nawo" /> ხარისხი 3: ზედაპირული/ღრმა კრატერი, ქვემდებარე ფასციაზე გავრცელების გარეშე</label></div></td></tr>
                <tr><td colSpan={9}><div className="cr"><label><input type="radio" name="nawo" /> ხარისხი 4: ღრმა კრატერი ძვლის, მყესის ანდა კუნთის ვიზუალიზაციით</label></div></td></tr>
                <tr><td colSpan={9}><div className="cr"><label><input type="checkbox" /> შეუხორცებელი ჭრილობა გამონადენით ან ფუფხით</label><label><input type="checkbox" /> ღრმა ქსოვილების დაზიანება</label></div></td></tr>

                <tr>
                  <td rowSpan={6} className="sec-label">სასუნთქი სისტემის შეფასება</td>
                  <td colSpan={6}>
                    <div className="cr">
                      <label><input type="checkbox" /> ტაქიპნოე</label>
                      <label><input type="checkbox" /> ღრმა სუნთქვა</label>
                      <label><input type="checkbox" /> მშრალი ხველა</label>
                      <label><input type="checkbox" /> ბრადიპნოე</label>
                      <label><input type="checkbox" /> ზედაპირული სუნთქვა</label>
                      <label><input type="checkbox" /> ხველა ნახველით</label>
                      <label><input type="checkbox" /> აპნოე</label>
                      <label><input type="checkbox" /> ქოშინი</label>
                      <label><input type="checkbox" /> ჩირქოვანი ნახველი</label>
                      <label><input type="checkbox" /> რეგულარული სუნთქვა</label>
                      <label><input type="checkbox" /> ორთოპნოე</label>
                      <label><input type="checkbox" /> სისხლიანი ნახველი</label>
                      <label><input type="checkbox" /> არარეგულარული სუნთქვა</label>
                      <label><input type="checkbox" /> სხვა <input className="ii" type="text" style={{ width: '80px' }} /></label>
                    </div>
                  </td>
                  <td colSpan={4}><div className="cr"><label><input type="checkbox" /> ოქსიგენოთერაპია</label></div></td>
                </tr>
                <tr><td colSpan={6}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> ტრაქეოსტომა</label></div></td></tr>
                <tr><td colSpan={6}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> არაინვაზიური ვენტილ.</label></div></td></tr>
                <tr><td colSpan={6}></td><td colSpan={4}><div className="cr"><label><input type="checkbox" /> მექანიკური ვენტილ.</label></div></td></tr>
                <tr><td colSpan={6}></td><td colSpan={4}><div className="cr">სხვა <input className="ii" type="text" style={{ width: '130px' }} /></div></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={5} className="sec-label">გულ-სისხლძარღვთა სისტემის შეფასება</td>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> რეგულარული პულსი</label>
                      <label><input type="checkbox" /> კისრის ვენების შებერვა</label>
                      <label><input type="checkbox" /> არარეგულარული პულსი</label>
                      <label><input type="checkbox" /> გენერალიზებული შეშუპება</label>
                      <label><input type="checkbox" /> დაჭიმული პულსი</label>
                      <label><input type="checkbox" /> ლოკალური შეშუპება <input className="ii" type="text" style={{ width: '60px' }} /></label>
                      <label><input type="checkbox" /> სუსტი ავსების პულსი <input className="ii" type="text" style={{ width: '60px' }} /></label>
                    </div>
                  </td>
                  <td colSpan={4}>
                    <div style={{ lineHeight: 1.9 }}>
                      ტკივილი გულმკერდში
                      <br />
                      ლოკალიზაცია: <input className="ii" type="text" style={{ width: '120px' }} placeholder="_________________________" />
                      <br />
                      ირადიაცია: <input className="ii" type="text" style={{ width: '120px' }} placeholder="____________________________" />
                      <br />
                      ხანგრძლივობა: <input className="ii" type="text" style={{ width: '110px' }} placeholder="_________________________" />
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={5} className="sec-label">ნევროლოგიური შეფასება</td>
                  <td colSpan={3} style={{ verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Glasgow Coma Scale</div>
                    <div style={{ lineHeight: 2 }}>
                      თვალის გახელა &nbsp;&nbsp;&nbsp;&nbsp; <input className="ii" type="text" style={{ width: '30px' }} placeholder="____" /> ქულა
                      <br />
                      მოტორული პასუხი &nbsp;<input className="ii" type="text" style={{ width: '30px' }} placeholder="____" /> ქულა
                      <br />
                      ვერბალური პასუხი &nbsp;<input className="ii" type="text" style={{ width: '30px' }} placeholder="____" /> ქულა
                      <br />
                      ჯამური ქულა &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<input className="ii" type="text" style={{ width: '40px' }} placeholder="_____" />
                    </div>
                  </td>
                  <td colSpan={6}>
                    <div className="cr">
                      <label><input type="checkbox" /> მხედველობის დაქვეითება — მარცხნივ</label>
                      <label><input type="checkbox" /> მარჯვნივ</label>
                      <label><input type="checkbox" /> სმენის დაქვეითება — მარცხნივ</label>
                      <label><input type="checkbox" /> მარჯვნივ</label>
                      <label><input type="checkbox" /> ყნოსვის დარღვევა</label>
                    </div>
                    მგრძნობელობის დარღვევა: <input className="ii" type="text" style={{ width: '60%' }} />
                    <br />
                    პარესთეზია: <input className="ii" type="text" style={{ width: '70%' }} />
                  </td>
                </tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={4} className="sec-label">ძვალ-კუნთოვანი სისტემის შეფასება</td>
                  <td colSpan={9}>მოძრაობის სიფართის დარღვევა: <input type="text" style={{ width: '75%' }} placeholder="_______________________________________________________________________________________________" /></td>
                </tr>
                <tr><td colSpan={9}>მოძრაობის ძალის დარღვევა: <input type="text" style={{ width: '76%' }} placeholder="____________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={9}>სისუსტე: <input type="text" style={{ width: '88%' }} placeholder="____________________________________________________________________________________________________________________________" /></td></tr>
                <tr>
                  <td colSpan={4}>მოტეხილობა: <input className="ii" type="text" style={{ width: '65%' }} placeholder="_______________________________________________________________________________________________________________________" /></td>
                  <td colSpan={5}>ლოკალური დაჭიმულობა: <input className="ii" type="text" style={{ width: '60%' }} placeholder="____________________________________________________________________" /></td>
                </tr>

                <tr>
                  <td rowSpan={4} className="sec-label">საჭმლის მომნელებელი სისტემის შეფასება</td>
                  <td colSpan={9}>
                    <div className="cr">
                      <label><input type="checkbox" /> სველი ენა</label>
                      <label><input type="checkbox" /> მშრალი ენა</label>
                      <label><input type="checkbox" /> ნადებიანი ენა</label>
                      <label><input type="checkbox" /> რბილი მუცელი</label>
                      <label><input type="checkbox" /> დიარეა</label>
                      <label><input type="checkbox" /> ყაბზობა</label>
                      <label><input type="checkbox" /> განავლის შეუკავებლობა</label>
                      <label><input type="checkbox" /> ოსტომა</label>
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={5} className="sec-label">შარდ-სასქესო სისტემის შეფასება</td>
                  <td colSpan={5}>
                    <div className="cr">
                      <label><input type="checkbox" /> ნებელობითი შარდვა</label>
                      <label><input type="checkbox" /> სუფთა შარდვა</label>
                      <label><input type="checkbox" /> შარდვის შეუკავებლობა</label>
                      <label><input type="checkbox" /> მღვრიე შარდი <input className="ii" type="text" style={{ width: '80px' }} /></label>
                      <label><input type="checkbox" /> დიზურია</label>
                      <label><input type="checkbox" /> სისხლიანი შარდი</label>
                      <label><input type="checkbox" /> ანურია</label>
                      <label><input type="checkbox" /> სხვა <input className="ii" type="text" style={{ width: '70px' }} /></label>
                      <br />
                      შბ კათეტერი: <input className="ii" type="text" style={{ width: '80px' }} placeholder="_________________" />
                    </div>
                  </td>
                  <td colSpan={4}>
                    <div style={{ lineHeight: 2 }}>
                      სასქესო ორგანოების პათოლოგია: <input className="ii" type="text" style={{ width: '50%' }} />
                      <br />
                      კონტრაცეფცია: <input className="ii" type="text" style={{ width: '65%' }} placeholder="_________________________________________" />
                      <br />
                      მენოპაუზა (დადგომის ასაკი): <input className="ii" type="text" style={{ width: '50%' }} placeholder="__________" />
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr>
                  <td rowSpan={5} className="sec-label">ტკივილის შეფასება</td>
                  <td colSpan={4}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>ტკივილის ინტენსივობის ქულა:</div>
                    <div className="pain-scale">
                      {Array.from({ length: 10 }, (_, i) => (
                        <label key={i}>
                          <input type="radio" name="pain" /> {i + 1}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td colSpan={2}>
                    ტკივილის ლოკალიზაცია:
                    <br />
                    <input type="text" placeholder="────────────────────────────────────" />
                  </td>
                  <td colSpan={3}>
                    <div style={{ lineHeight: 2 }}>
                      აღმოცენების დრო: <input className="ii" type="text" style={{ width: '80px' }} placeholder="---------" />
                      <br />
                      ხანგრძლივობა: <input className="ii" type="text" style={{ width: '80px' }} placeholder="--------------" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={9}>
                    <div className="cr">
                      <label><input type="radio" name="pain-type" /> ხანგამოშვებითი ტკივილი</label>
                      <label><input type="radio" name="pain-type" /> მუდმივი ტკივილი</label>
                      <label><input type="radio" name="pain-type" /> უეცარი, ძლიერი ტკივილი</label>
                      <label><input type="radio" name="pain-type" /> ყრუ ტკივილი</label>
                    </div>
                  </td>
                </tr>
                <tr><td colSpan={9}>სხვა: <input type="text" style={{ width: '92%' }} placeholder="____________________________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={9}></td></tr>
                <tr><td colSpan={9}></td></tr>

                <tr><td colSpan={10} style={{ fontWeight: 'bold' }}>საექთნო დიაგნოზი: <input type="text" style={{ width: '85%' }} placeholder="__________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>

                <tr><td colSpan={10} style={{ fontWeight: 'bold' }}>სამოქმედო გეგმა: <input type="text" style={{ width: '86%' }} placeholder="___________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>
                <tr><td colSpan={10}><input type="text" placeholder="___________________________________________________________________________________________________________________________________" /></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const BloodRequestForm = ({
  onBack,
  formData,
  setFormData,
}: {
  onBack: () => void;
  formData: BloodRequestFormData;
  setFormData: React.Dispatch<React.SetStateAction<BloodRequestFormData>>;
}) => {
  const updateField = (field: keyof BloodRequestFormData, value: string | boolean) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <div className="blood-request-shell">
      <div className="no-print mb-5 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <ChevronLeft size={14} />
          უკან დაბრუნება
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
        >
          <Printer size={14} />
          ბეჭდვა
        </button>
      </div>

      <div className="blood-request-card">
        <div className="blood-request-header">
          <img className="blood-request-logo" src={tmCenterLogo} alt="HTMC TM Center" />
          <div className="blood-request-org-ka">ინგოროყვას საუნივერსიტეტო კლინიკა</div>
          <div className="blood-request-org-en">Ingorokva University Clinic</div>
          <div className="blood-request-org-dept">სისხლის ბანკი და კლინიკური ტრანსფუზიოლოგიის დეპარტამენტი</div>
        </div>

        <hr className="blood-request-divider" />

        <div className="blood-request-title">მიმართვა სისხლის კომპონენტებზე</div>

        <div className="blood-request-row">
          <span className="blood-request-label">განყოფილება:</span>
          <DepartmentSearchInput
            listId={DEPARTMENT_LIST_ID}
            className="blood-request-line"
            style={{ flex: 2 }}
            value={formData.department}
            onChange={(event) => updateField('department', event.target.value)}
            placeholder="აირჩიეთ ან მოძებნეთ განყოფილება"
          />
          <span className="blood-request-label">ისტორიის №</span>
          <input
            className="blood-request-line"
            style={{ flex: 1 }}
            type="text"
            value={formData.history_number}
            onChange={(event) => updateField('history_number', event.target.value)}
          />
          <span className="blood-request-label">დრო:</span>
          <input
            className="blood-request-line"
            style={{ flex: 1 }}
            type="text"
            value={formData.time}
            onChange={(event) => updateField('time', event.target.value)}
          />
        </div>

        <div className="blood-request-row">
          <span className="blood-request-label">პაციენტის გვარი სახელი:</span>
          <input
            className="blood-request-line"
            type="text"
            value={formData.patient_name}
            onChange={(event) => updateField('patient_name', event.target.value)}
          />
        </div>

        <div className="blood-request-row">
          <span className="blood-request-label">პაციენტის ჯგუფი და რეზუს ფაქტორი:</span>
          <select
            className="blood-request-select"
            value={formData.blood_group}
            onChange={(event) => updateField('blood_group', event.target.value)}
          >
            <option value="">-- ჯგუფი --</option>
            <option value="I (O)">I (O)</option>
            <option value="II (A)">II (A)</option>
            <option value="III (B)">III (B)</option>
            <option value="IV (AB)">IV (AB)</option>
          </select>
          <select
            className="blood-request-select"
            value={formData.rhesus}
            onChange={(event) => updateField('rhesus', event.target.value)}
          >
            <option value="">-- რეზუს --</option>
            <option value="Rh+ (დადებითი)">Rh+ (დადებითი)</option>
            <option value="Rh− (უარყოფითი)">Rh− (უარყოფითი)</option>
          </select>
        </div>

        <div className="blood-request-row">
          <span className="blood-request-label">დიაგნოზი:</span>
          <input
            className="blood-request-line"
            type="text"
            value={formData.diagnosis}
            onChange={(event) => updateField('diagnosis', event.target.value)}
          />
        </div>

        <div className="blood-request-row">
          <span className="blood-request-label">ტრანსფუზიის ჩვენება:</span>
          <input
            className="blood-request-line"
            type="text"
            value={formData.transfusion_indication}
            onChange={(event) => updateField('transfusion_indication', event.target.value)}
          />
        </div>

        <div className="blood-request-transfusion">
          <div className="blood-request-checkbox-item">
            <input
              type="checkbox"
              checked={formData.eritro}
              onChange={(event) => updateField('eritro', event.target.checked)}
            />
            <span className="blood-request-checkbox-text">ერითროციტული მასა: რაოდენობა</span>
            <input
              className="blood-request-line"
              style={{ flex: 1 }}
              type="text"
              value={formData.eritro_qty}
              onChange={(event) => updateField('eritro_qty', event.target.value)}
            />
          </div>
          <div className="blood-request-checkbox-item">
            <input
              type="checkbox"
              checked={formData.plasma}
              onChange={(event) => updateField('plasma', event.target.checked)}
            />
            <span className="blood-request-checkbox-text">ახლად გაყინული პლაზმა: რაოდენობა</span>
            <input
              className="blood-request-line"
              style={{ flex: 1 }}
              type="text"
              value={formData.plasma_qty}
              onChange={(event) => updateField('plasma_qty', event.target.value)}
            />
          </div>
          <div className="blood-request-checkbox-item">
            <input
              type="checkbox"
              checked={formData.trombo}
              onChange={(event) => updateField('trombo', event.target.checked)}
            />
            <span className="blood-request-checkbox-text">თრომბოკონცენტრატი: რაოდენობა</span>
            <input
              className="blood-request-line"
              style={{ flex: 1 }}
              type="text"
              value={formData.trombo_qty}
              onChange={(event) => updateField('trombo_qty', event.target.value)}
            />
          </div>
        </div>

        <div className="blood-request-bottom">
          <div className="blood-request-bottom-field">
            <span className="blood-request-label">თარიღი:</span>
            <input
              className="blood-request-line"
              type="date"
              value={formData.request_date}
              onChange={(event) => updateField('request_date', event.target.value)}
            />
          </div>
          <div className="blood-request-bottom-field">
            <span className="blood-request-label">ექიმი:</span>
            <input
              className="blood-request-line"
              type="text"
              value={formData.doctor}
              onChange={(event) => updateField('doctor', event.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default function NursingDocumentsPage() {
  const { id: patientId, docType } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const documentRootRef = useRef<HTMLDivElement | null>(null);
  const autoPrintTriggeredRef = useRef(false);

  const currentUser = useMemo(() => getCurrentAppUser(), []);
  const currentView = useMemo(() => toDocumentView(docType), [docType]);
  const currentConfig = currentView === 'dashboard' ? null : NURSING_DOC_CONFIG[currentView];
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const prescriptionId = searchParams.get('prescriptionId');
  const autoPrint = searchParams.get('autoPrint') === '1';
  const isFresh = searchParams.get('fresh') === '1';

  const [patientInfo, setPatientInfo] = useState<PatientInfo>(createInitialPatientInfo);
  const [basePatientInfo, setBasePatientInfo] = useState<PatientInfo>(createInitialPatientInfo);
  const [morseScores, setMorseScores] = useState<Record<string, number | null>>(createInitialMorseScores);
  const [bradenScores, setBradenScores] = useState<Record<string, number | null>>(createInitialBradenScores);
  const [bloodRequestForm, setBloodRequestForm] = useState<BloodRequestFormData>(createInitialBloodRequest());
  const [pendingSerializedFields, setPendingSerializedFields] = useState<SerializedField[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [activePrescriptionId, setActivePrescriptionId] = useState<string>(prescriptionId || '');

  const navigateToView = (view: View) => {
    if (!patientId) return;
    navigate(view === 'dashboard' ? `/patients/${patientId}/nursing` : `/patients/${patientId}/nursing/${view}`);
  };

  useEffect(() => {
    if (currentView === 'dashboard' && patientId) {
      navigate(`/patients/${patientId}`, { replace: true });
    }
  }, [currentView, navigate, patientId]);

  const buildCurrentPayload = (): NursingDocumentPayload => {
    const payload: NursingDocumentPayload = {
      patientInfo,
    };

    if (currentView === 'morse') {
      payload.morseScores = morseScores;
      return payload;
    }

    if (currentView === 'braden') {
      payload.bradenScores = bradenScores;
      return payload;
    }

    if (currentView === 'bloodRequest') {
      payload.bloodRequest = bloodRequestForm;
      return payload;
    }

    payload.fields = serializeDomFields(documentRootRef.current);
    return payload;
  };

  const loadTemplates = async () => {
    if (!currentConfig) {
      setTemplates([]);
      return;
    }
    const response = await api.get('/templates');
    setTemplates(response.data.filter((template: any) => template.type === currentConfig.prescriptionType));
  };

  useEffect(() => {
    autoPrintTriggeredRef.current = false;
    setActivePrescriptionId(prescriptionId || '');
  }, [prescriptionId, currentView]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      if (!patientId) return;

      setLoading(true);
      try {
        const patientResponse = await api.get(`/patients/${patientId}`);
        if (cancelled) return;

        const basePatientInfo = buildPatientInfoFromPatient(patientResponse.data, currentUser);
        let initialPayload: NursingDocumentPayload | null = null;

        if (currentView !== 'dashboard' && prescriptionId) {
          const prescriptionResponse = await api.get(`/prescriptions/${prescriptionId}`);
          if (cancelled) return;
          initialPayload = typeof prescriptionResponse.data?.data === 'string'
            ? JSON.parse(prescriptionResponse.data.data || '{}')
            : (prescriptionResponse.data?.data || null);
        } else if (currentView !== 'dashboard' && !isFresh) {
          initialPayload = readDraftPayload(patientId, currentView);
        }

        const nextPatientInfo = mergePatientInfo(basePatientInfo, initialPayload?.patientInfo);
        setBasePatientInfo(basePatientInfo);
        setPatientInfo(nextPatientInfo);
        setMorseScores({ ...createInitialMorseScores(), ...(initialPayload?.morseScores || {}) });
        setBradenScores({ ...createInitialBradenScores(), ...(initialPayload?.bradenScores || {}) });
        setBloodRequestForm(
          mergeBloodRequestData(
            createInitialBloodRequest(nextPatientInfo, currentUser),
            initialPayload?.bloodRequest,
          ),
        );
        setPendingSerializedFields(initialPayload?.fields || []);

        if (currentConfig) {
          const templateResponse = await api.get('/templates');
          if (cancelled) return;
          setTemplates(templateResponse.data.filter((template: any) => template.type === currentConfig.prescriptionType));
        } else {
          setTemplates([]);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error('საექთნო დოკუმენტების ჩატვირთვა ვერ მოხერხდა');
          navigate(patientId ? `/patients/${patientId}` : '/', { replace: true });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [patientId, currentView, prescriptionId, currentConfig?.prescriptionType, currentUser, navigate, isFresh]);

  useEffect(() => {
    if (currentView === 'dashboard') return;
    if (!patientInfo.name && !patientInfo.historyNum) return;

    setBloodRequestForm((current) => ({
      ...current,
      department: current.department || patientInfo.department || String(currentUser?.department || ''),
      history_number: patientInfo.historyNum || current.history_number,
      patient_name: patientInfo.name || current.patient_name,
      blood_group: patientInfo.bloodGroup || current.blood_group,
      rhesus: patientInfo.rhesus || current.rhesus,
      request_date: current.request_date || patientInfo.date || createInitialPatientInfo().date,
      doctor: current.doctor || String(currentUser?.name || ''),
    }));
  }, [currentUser, currentView, patientInfo]);

  useEffect(() => {
    if (loading || currentView === 'dashboard') return;

    writeDraftPayload(patientId, currentView, buildCurrentPayload());
  }, [loading, patientId, currentView, patientInfo, morseScores, bradenScores, bloodRequestForm]);

  useEffect(() => {
    if (loading || currentView === 'dashboard') return;
    if (currentView === 'morse' || currentView === 'braden' || currentView === 'bloodRequest') return;

    const root = documentRootRef.current;
    if (!root) return;

    const persistDraft = () => {
      writeDraftPayload(patientId, currentView, buildCurrentPayload());
    };

    root.addEventListener('input', persistDraft);
    root.addEventListener('change', persistDraft);

    return () => {
      root.removeEventListener('input', persistDraft);
      root.removeEventListener('change', persistDraft);
    };
  }, [loading, patientId, currentView, patientInfo, morseScores, bradenScores, bloodRequestForm]);

  useEffect(() => {
    if (loading) return;
    if (!pendingSerializedFields.length) return;
    if (currentView === 'dashboard' || currentView === 'morse' || currentView === 'braden' || currentView === 'bloodRequest') return;

    const timer = window.setTimeout(() => {
      applySerializedDomFields(documentRootRef.current, pendingSerializedFields);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loading, pendingSerializedFields, currentView]);

  useEffect(() => {
    if (!autoPrint || loading || currentView === 'dashboard' || autoPrintTriggeredRef.current) return;

    const timer = window.setTimeout(() => {
      autoPrintTriggeredRef.current = true;
      window.print();
    }, pendingSerializedFields.length > 0 ? 260 : 180);

    return () => window.clearTimeout(timer);
  }, [autoPrint, loading, currentView, pendingSerializedFields, patientInfo, morseScores, bradenScores, bloodRequestForm]);

  const handleSaveHistory = async () => {
    if (!patientId || !currentConfig) return;

    setSaving(true);
    try {
      const payload = buildCurrentPayload();
      if (activePrescriptionId) {
        await api.put(`/prescriptions/${activePrescriptionId}`, {
          type: currentConfig.prescriptionType,
          patientHistoryNumber: patientInfo.historyNum,
          patientPersonalId: patientInfo.id,
          data: payload,
        });
        toast.success('დოკუმენტი განახლდა ისტორიაში');
      } else {
        const response = await api.post('/prescriptions', {
          type: currentConfig.prescriptionType,
          patientId,
          patientHistoryNumber: patientInfo.historyNum,
          patientPersonalId: patientInfo.id,
          data: payload,
        });
        const nextId = String(response.data.id || '');
        setActivePrescriptionId(nextId);
        const nextParams = new URLSearchParams(location.search);
        nextParams.set('prescriptionId', nextId);
        nextParams.delete('autoPrint');
        nextParams.delete('fresh');
        navigate(
          {
            pathname: `/patients/${patientId}/nursing/${currentView}`,
            search: `?${nextParams.toString()}`,
          },
          { replace: true },
        );
        toast.success('დოკუმენტი დაემატა ისტორიაში');
      }
    } catch (error) {
      toast.error('დოკუმენტის შენახვა ვერ მოხერხდა');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!currentConfig) return;

    const name = window.prompt('შაბლონის სახელი');
    if (!name || !name.trim()) return;

    try {
      await api.post('/templates', {
        name: name.trim(),
        type: currentConfig.prescriptionType,
        data: buildCurrentPayload(),
      });
      await loadTemplates();
      toast.success('შაბლონი შენახულია');
      setTemplateModalOpen(true);
    } catch (error) {
      toast.error('შაბლონის შენახვა ვერ მოხერხდა');
    }
  };

  const handleApplyTemplate = (template: any) => {
    const payload = typeof template.data === 'string' ? JSON.parse(template.data || '{}') : (template.data || {});
    if (currentView === 'morse') {
      setMorseScores({ ...createInitialMorseScores(), ...(payload?.morseScores || {}) });
    } else if (currentView === 'braden') {
      setBradenScores({ ...createInitialBradenScores(), ...(payload?.bradenScores || {}) });
    } else if (currentView === 'bloodRequest') {
      setBloodRequestForm((current) => mergeBloodRequestData(current, {
        diagnosis: payload?.bloodRequest?.diagnosis || '',
        transfusion_indication: payload?.bloodRequest?.transfusion_indication || '',
        eritro: Boolean(payload?.bloodRequest?.eritro),
        eritro_qty: payload?.bloodRequest?.eritro_qty || '',
        plasma: Boolean(payload?.bloodRequest?.plasma),
        plasma_qty: payload?.bloodRequest?.plasma_qty || '',
        trombo: Boolean(payload?.bloodRequest?.trombo),
        trombo_qty: payload?.bloodRequest?.trombo_qty || '',
        doctor: payload?.bloodRequest?.doctor || current.doctor,
        time: payload?.bloodRequest?.time || '',
      }));
    } else {
      setPendingSerializedFields(payload?.fields || []);
    }

    toast.success(`შაბლონი "${template.name}" ჩაიტვირთა`);
    setTemplateModalOpen(false);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('ნამდვილად გსურთ შაბლონის წაშლა?')) return;
    try {
      await api.delete(`/templates/${templateId}`);
      await loadTemplates();
      toast.success('შაბლონი წაიშალა');
    } catch (error) {
      toast.error('შაბლონის წაშლა ვერ მოხერხდა');
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">იტვირთება...</div>;
  }

  return (
    <div className="nursing-documents-shell min-h-screen bg-slate-50 py-8 sm:py-12 px-4 font-sans print:bg-white print:py-0 print:px-0">
      <div className="nursing-actions no-print">
        <div className="nursing-actions__group">
          <button
            type="button"
            onClick={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            className="nursing-action-btn"
          >
            <ChevronLeft size={15} />
            პაციენტი
          </button>
        </div>

        {currentConfig ? (
          <div className="nursing-actions__group">
            <button
              type="button"
              onClick={() => setTemplateModalOpen(true)}
              className="nursing-action-btn"
            >
              <Copy size={15} />
              შაბლონები
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="nursing-action-btn"
            >
              <Save size={15} />
              შაბლონის შენახვა
            </button>
            <button
              type="button"
              onClick={handleSaveHistory}
              disabled={saving}
              className="nursing-action-btn nursing-action-btn--primary"
            >
              <Save size={15} />
              {saving ? 'ინახება...' : 'ისტორიაში შენახვა'}
            </button>
          </div>
        ) : (
          <div className="text-sm font-semibold text-slate-500">
            აირჩიე საექთნო დოკუმენტი პაციენტისთვის
          </div>
        )}
      </div>

      {templateModalOpen && currentConfig ? (
        <div className="nursing-template-modal no-print" onClick={(event) => {
          if (event.target === event.currentTarget) {
            setTemplateModalOpen(false);
          }
        }}>
          <div className="nursing-template-card">
            <div className="nursing-template-card__header">
              <div>
                <h2 className="text-xl font-black text-slate-900">{currentConfig.title}</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">შენახული შაბლონები</p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="nursing-action-btn"
              >
                დახურვა
              </button>
            </div>
            <div className="nursing-template-card__body">
              {templates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
                  შაბლონები ჯერ არ არის შენახული
                </div>
              ) : (
                <div className="nursing-template-list">
                  {templates.map((template) => (
                    <div key={template.id} className="nursing-template-item">
                      <div className="nursing-template-item__meta">
                        <strong>{template.name}</strong>
                        <span>{new Date(template.createdAt).toLocaleString('ka-GE')}</span>
                      </div>
                      <div className="nursing-template-item__actions">
                        <button
                          type="button"
                          onClick={() => handleApplyTemplate(template)}
                          className="nursing-action-btn"
                        >
                          ჩატვირთვა
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(String(template.id))}
                          className="nursing-action-btn nursing-action-btn--danger"
                        >
                          წაშლა
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <DepartmentDatalist id={DEPARTMENT_LIST_ID} />

      <div ref={documentRootRef}>
        {currentView === 'dashboard' && (
          <Dashboard
            setView={navigateToView}
            patientInfo={patientInfo}
            setPatientInfo={setPatientInfo}
            onResetPatientInfo={() => {
              setPatientInfo(basePatientInfo);
              setMorseScores(createInitialMorseScores());
              setBradenScores(createInitialBradenScores());
              setBloodRequestForm(createInitialBloodRequest(basePatientInfo, currentUser));
              setPendingSerializedFields([]);
            }}
          />
        )}
        {currentView === 'morse' && (
          <MorseFallScale
            onBack={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            patientInfo={patientInfo}
            setPatientInfo={setPatientInfo}
            scores={morseScores}
            setScores={setMorseScores}
          />
        )}
        {currentView === 'braden' && (
          <BradenScale
            onBack={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            patientInfo={patientInfo}
            setPatientInfo={setPatientInfo}
            scores={bradenScores}
            setScores={setBradenScores}
          />
        )}
        {currentView === 'handover' && (
          <HandoverChecklist
            onBack={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            patientInfo={patientInfo}
            setPatientInfo={setPatientInfo}
          />
        )}
        {currentView === 'abcdfwc' && (
          <EmergencyAbcdfwcAssessment
            onBack={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            patientInfo={patientInfo}
            setPatientInfo={setPatientInfo}
          />
        )}
        {currentView === 'nursingAssessment' && (
          <NursingAssessmentForm
            onBack={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            patientInfo={patientInfo}
            setPatientInfo={setPatientInfo}
          />
        )}
        {currentView === 'bloodRequest' && (
          <BloodRequestForm
            onBack={() => navigate(patientId ? `/patients/${patientId}` : '/')}
            formData={bloodRequestForm}
            setFormData={setBloodRequestForm}
          />
        )}
      </div>
    </div>
  );
}
