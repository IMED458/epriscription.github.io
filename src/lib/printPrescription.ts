type PrintablePatient = {
  name?: string;
  historyNumber?: string;
  personalId?: string;
};

type PrintablePrescription = {
  diagnosis?: string;
  hospitalizationDate?: string;
  surgeryDate?: string;
  allergy?: string;
  department?: string;
  ward?: string;
};

type PrintableItem = {
  index: number;
  text?: string;
  time?: string;
  timeSlots?: string[];
  dates?: string[];
};

type PrintPrescriptionOptions = {
  patient?: PrintablePatient;
  prescription?: PrintablePrescription;
  formNumber?: string;
  items?: PrintableItem[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printPrescription({
  patient = {},
  prescription = {},
  formNumber,
  items = [],
}: PrintPrescriptionOptions) {
  const num = formNumber || "20032269103637";

  const patientLine = [
    patient.name,
    patient.historyNumber ? `ისტ # ${patient.historyNumber}` : "",
    patient.personalId ? `პ/ნ: ${patient.personalId}` : "",
  ]
    .filter(Boolean)
    .join(",  ");

  const DATE_COLS = 7;
  const SUB_ROWS = 4;
  const MAX_BLOCKS_PER_PAGE = 8;
  const ROW_HEIGHT = 18;
  const BLOCK_HEIGHT = ROW_HEIGHT * SUB_ROWS;
  const normalizedItems = (items.length > 0
    ? items
    : [{ index: 1, text: "", time: "", timeSlots: Array(SUB_ROWS).fill(""), dates: Array(DATE_COLS).fill("") }]).map((item, index) => ({
      index: Number(item.index || index + 1),
      text: String(item.text || ""),
      time: String(item.time || ""),
      timeSlots: Array.from({ length: SUB_ROWS }).map((_, timeIndex) =>
        String(item.timeSlots?.[timeIndex] || (timeIndex === 0 ? item.time || "" : ""))
      ),
      dates: Array.from({ length: DATE_COLS }).map((_, dateIndex) => String(item.dates?.[dateIndex] || "")),
    }));
  const sharedDates = Array.from({ length: DATE_COLS }).map((_, dateIndex) => {
    const firstFilledDate = normalizedItems
      .map((item) => String(item.dates?.[dateIndex] || "").trim())
      .find(Boolean);
    return escapeHtml(firstFilledDate || "");
  });

  function buildTableBody(pageItems: PrintableItem[]) {
    let html = "";

    for (const item of pageItems) {
      const blockNum = Number(item.index || 0) || 0;
      const text = escapeHtml(item.text || "");
      const timeSlots = Array.from({ length: SUB_ROWS }).map((_, timeIndex) =>
        escapeHtml(item.timeSlots?.[timeIndex] || (timeIndex === 0 ? item.time || "" : ""))
      );

      for (let subRow = 0; subRow < SUB_ROWS; subRow += 1) {
        const isFirst = subRow === 0;
        const isLast = subRow === SUB_ROWS - 1;
        const horizontalBorders = `border-top:1px solid #000;${isLast ? "border-bottom:1px solid #000;" : ""}`;

        html += `<tr style="height:${ROW_HEIGHT}px;">`;

        if (isFirst) {
          html += `<td rowspan="${SUB_ROWS}" style="
            border:1px solid #000;
            text-align:center;
            vertical-align:top;
            font-size:8pt;
            padding:0;
            height:${BLOCK_HEIGHT}px;
          "><div style="
            height:${BLOCK_HEIGHT - 2}px;
            display:flex;
            align-items:center;
            justify-content:center;
          ">${blockNum || ""}</div></td>`;

          html += `<td rowspan="${SUB_ROWS}" style="
            border:1px solid #000;
            vertical-align:top;
            font-size:8pt;
            padding:0;
            height:${BLOCK_HEIGHT}px;
          "><div style="
            height:${BLOCK_HEIGHT - 2}px;
            max-height:${BLOCK_HEIGHT - 2}px;
            padding:3px 5px;
            overflow:hidden;
            line-height:1.15;
            word-break:break-word;
            white-space:pre-wrap;
          ">${text}</div></td>`;
        }

        html += `<td style="
          border-left:1px solid #000;
          border-right:1px solid #000;
          ${horizontalBorders}
          height:${ROW_HEIGHT}px;
          padding:0;
          font-size:8pt;
        "><div style="
          height:${ROW_HEIGHT - 1}px;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
        ">${timeSlots[subRow] || ""}</div></td>`;

        for (let dateIndex = 0; dateIndex < DATE_COLS; dateIndex += 1) {
          html += `<td style="
            border-left:1px solid #000;
            border-right:1px solid #000;
            ${horizontalBorders}
            height:${ROW_HEIGHT}px;
            padding:0;
            font-size:8pt;
          "><div style="
            height:${ROW_HEIGHT - 1}px;
            display:flex;
            align-items:center;
            justify-content:center;
            text-align:center;
          "></div></td>`;
        }

        html += "</tr>";
      }
    }

    return html;
  }

  function tableHTML(pageItems: PrintableItem[], pageStartIndex: number) {
    return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:inherit;">
      <colgroup>
        <col style="width:20px"/>
        <col/>
        <col style="width:48px"/>
        ${Array.from({ length: DATE_COLS }).map(() => `<col style="width:38px"/>`).join("")}
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2" style="
            border:1px solid #000;
            font-size:9pt;
            text-align:center;
            vertical-align:middle;
            padding:4px 0;
          ">№</th>

          <th rowspan="2" style="
            border:1px solid #000;
            font-size:9pt;
            text-align:center;
            vertical-align:middle;
            padding:4px 0;
          ">დანიშნულება</th>

          <th rowspan="2" style="
            border:1px solid #000;
            font-size:9pt;
            text-align:center;
            vertical-align:middle;
            padding:4px 0;
          ">დრო</th>

          <th colspan="${DATE_COLS}" style="
            border:1px solid #000;
            font-size:9pt;
            font-weight:bold;
            text-align:center;
            padding:4px 0;
          ">რიცხვი</th>
        </tr>
        <tr>
          ${Array.from({ length: DATE_COLS })
            .map((_, dateIndex) => `<td style="border:1px solid #000;height:14px;padding:0;font-size:8pt;text-align:center;vertical-align:middle;">${pageStartIndex === 0 ? sharedDates[dateIndex] : ""}</td>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${buildTableBody(pageItems)}
      </tbody>
    </table>`;
  }

  const signaturesHTML = `
    <table style="width:100%;border-collapse:collapse;margin-top:2px;">
      <tr>
        <td style="border:1px solid #000;padding:6px 8px;font-size:8pt;height:36px;vertical-align:top;">
          დანიშნულება შევასრულე<br/>მორიგე ექთანი
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #000;padding:6px 8px;font-size:8pt;height:36px;vertical-align:top;border-top:none;">
          დანიშნულების შესრულებას ვადასტურებ<br/>მკურნალი ექიმი
        </td>
      </tr>
    </table>`;

  const pages: PrintableItem[][] = [];
  for (let index = 0; index < normalizedItems.length; index += MAX_BLOCKS_PER_PAGE) {
    pages.push(normalizedItems.slice(index, index + MAX_BLOCKS_PER_PAGE));
  }
  if (pages.length === 0) pages.push(normalizedItems);

  const pageSections = pages.map((pageItems, pageIndex) => {
    const pageTable = tableHTML(pageItems, pageIndex * MAX_BLOCKS_PER_PAGE);

    if (pageIndex === 0) {
      return `
      <div class="page">
        <div style="text-align:right;font-size:7pt;margin-bottom:3mm;line-height:1.6;">
          ${escapeHtml(num)}<br/>დანართი 3<br/>ფორმა №IV-300-2/ა
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
          <tr>
            <td style="border:1px solid #000;padding:3px 6px;font-size:9pt;font-weight:bold;">
              პაციენტი ${escapeHtml(patientLine)}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;border-top:none;padding:3px 6px;font-size:8pt;">
              დიაგნოზი/ქირურგიული ჩარევა&nbsp;&nbsp;${escapeHtml(prescription.diagnosis || "")}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;border-top:none;padding:3px 6px;font-size:8pt;">
              ჰოსპიტალიზაციის თარიღი:&nbsp;${escapeHtml(prescription.hospitalizationDate || "")}
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              ქირურგიული ჩარევის თარიღი:&nbsp;${escapeHtml(prescription.surgeryDate || "")}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;border-top:none;padding:4px 6px;font-size:8pt;height:32px;vertical-align:top;">
              ალერგია<br/>
              <span style="font-size:7pt;color:#444;">
                (პრეპარატის დასახელება, ალერგიული რეაქციის ტიპი და ფორმა)
              </span>
              ${prescription.allergy ? `<br/>${escapeHtml(prescription.allergy)}` : ""}
            </td>
          </tr>
        </table>

        <div style="text-align:center;font-size:11pt;font-weight:bold;margin:4mm 0 2mm;">
          ექიმის დანიშნულების ფურცელი
        </div>

        <div style="font-size:8pt;margin-bottom:3mm;">
          განყოფილება&nbsp;
          <span style="display:inline-block;min-width:130px;border-bottom:1px solid #000;vertical-align:bottom;">
            &nbsp;${escapeHtml(prescription.department || "")}&nbsp;
          </span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          პალატა №&nbsp;
          <span style="display:inline-block;min-width:50px;border-bottom:1px solid #000;vertical-align:bottom;">
            &nbsp;${escapeHtml(prescription.ward || "")}&nbsp;
          </span>
        </div>

        ${pageTable}
        ${signaturesHTML}
      </div>`;
    }

    return `
      <div class="page">
        ${pageTable}
        ${signaturesHTML}
      </div>`;
  });

  const html = `<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8"/>
  <title>ექიმის დანიშნულების ფურცელი</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Noto Sans Georgian', 'DejaVu Sans', Arial, sans-serif;
      font-size: 9pt;
      color: #000;
      background: #fff;
    }

    .page {
      width: 210mm;
      padding: 10mm 15mm;
      margin: 0 auto;
    }

    @media print {
      @page { size: A4 portrait; margin: 0; }
      body  { background: #fff; }
      .page {
        width: 210mm;
        padding: 10mm 15mm;
        page-break-after: always;
      }
      .page:last-child { page-break-after: auto; }
    }
  </style>
</head>
<body>
  ${pageSections.join("")}

  <script>
    document.fonts.ready.then(function() { window.print(); });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1000,height=750");
  if (!win) {
    window.alert("გთხოვთ დაუშვათ pop-up ამ გვერდისთვის, რათა დაიბეჭდოს ფურცელი.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
