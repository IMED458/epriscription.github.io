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
  dates?: string[];
};

type PrintPrescriptionOptions = {
  patient?: PrintablePatient;
  prescription?: PrintablePrescription;
  formNumber?: string;
  items?: PrintableItem[];
};

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

  function buildTableBody(startIndex: number, count: number) {
    let html = "";

    for (let blockOffset = 0; blockOffset < count; blockOffset += 1) {
      const blockNum = startIndex + blockOffset;
      const item = items.find((entry) => entry.index === blockNum);
      const text = item?.text || "";

      for (let subRow = 0; subRow < SUB_ROWS; subRow += 1) {
        const isFirst = subRow === 0;
        const topBorder = isFirst ? "" : "border-top:1px solid #000;";
        const timeText = isFirst ? item?.time || "" : "";

        html += "<tr>";

        if (isFirst) {
          html += `<td rowspan="${SUB_ROWS}" style="
            border:1px solid #000;
            text-align:center;
            vertical-align:middle;
            font-size:8pt;
            padding:0;
          ">${blockNum}</td>`;

          html += `<td rowspan="${SUB_ROWS}" style="
            border:1px solid #000;
            vertical-align:top;
            font-size:8pt;
            padding:3px 5px;
          ">${text}</td>`;
        }

        html += `<td style="
          border-left:1px solid #000;
          border-right:1px solid #000;
          ${topBorder}
          height:12px;
          padding:0 3px;
          font-size:7.5pt;
          text-align:center;
          vertical-align:middle;
        ">${timeText}</td>`;

        for (let dateIndex = 0; dateIndex < DATE_COLS; dateIndex += 1) {
          const dateText = isFirst ? String(item?.dates?.[dateIndex] || "") : "";
          html += `<td style="
            border-left:1px solid #000;
            border-right:1px solid #000;
            ${topBorder}
            height:12px;
            padding:0;
            font-size:7.5pt;
            text-align:center;
            vertical-align:middle;
          ">${dateText}</td>`;
        }

        html += "</tr>";
      }
    }

    return html;
  }

  function tableHTML(startIndex: number, count: number) {
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
            .map(() => `<td style="border:1px solid #000;height:10px;padding:0;"></td>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${buildTableBody(startIndex, count)}
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

  const itemCount = items.length || 0;
  const pageCounts = [6];
  const extraPages = Math.max(1, Math.ceil(Math.max(itemCount - 6, 0) / 4));
  for (let pageIndex = 0; pageIndex < extraPages; pageIndex += 1) {
    pageCounts.push(4);
  }

  const pageSections = pageCounts.map((count, pageIndex) => {
    const startIndex = pageIndex === 0 ? 1 : 7 + (pageIndex - 1) * 4;
    const pageTable = tableHTML(startIndex, count);

    if (pageIndex === 0) {
      return `
      <div class="page">
        <div style="text-align:right;font-size:7pt;margin-bottom:3mm;line-height:1.6;">
          ${num}<br/>დანართი 3<br/>ფორმა №IV-300-2/ა
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
          <tr>
            <td style="border:1px solid #000;padding:3px 6px;font-size:9pt;font-weight:bold;">
              პაციენტი ${patientLine}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;border-top:none;padding:3px 6px;font-size:8pt;">
              დიაგნოზი/ქირურგიული ჩარევა&nbsp;&nbsp;${prescription.diagnosis || ""}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;border-top:none;padding:3px 6px;font-size:8pt;">
              ჰოსპიტალიზაციის თარიღი:&nbsp;${prescription.hospitalizationDate || ""}
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              ქირურგიული ჩარევის თარიღი:&nbsp;${prescription.surgeryDate || ""}
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #000;border-top:none;padding:4px 6px;font-size:8pt;height:32px;vertical-align:top;">
              ალერგია<br/>
              <span style="font-size:7pt;color:#444;">
                (პრეპარატის დასახელება, ალერგიული რეაქციის ტიპი და ფორმა)
              </span>
              ${prescription.allergy ? `<br/>${prescription.allergy}` : ""}
            </td>
          </tr>
        </table>

        <div style="text-align:center;font-size:11pt;font-weight:bold;margin:4mm 0 2mm;">
          ექიმის დანიშნულების ფურცელი
        </div>

        <div style="font-size:8pt;margin-bottom:3mm;">
          განყოფილება&nbsp;
          <span style="display:inline-block;min-width:130px;border-bottom:1px solid #000;vertical-align:bottom;">
            &nbsp;${prescription.department || ""}&nbsp;
          </span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          პალატა №&nbsp;
          <span style="display:inline-block;min-width:50px;border-bottom:1px solid #000;vertical-align:bottom;">
            &nbsp;${prescription.ward || ""}&nbsp;
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
