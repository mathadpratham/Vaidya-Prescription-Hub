import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Medicine } from "./prescriptionParser";

interface PatientDetails {
  name: string;
  age?: string;
  gender?: string;
}

export function generatePrescriptionPDF(patient: PatientDetails, medicines: Medicine[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a5"
  });

  const pageWidth = doc.internal.pageSize.width;

  // Colors
  const primaryGreen = [46, 139, 87]; // Restorative Green
  const textColor = [40, 40, 40];

  // Header Background
  doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.rect(0, 0, pageWidth, 25, 'F');

  // VaidyaOS Logo/Wordmark
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("VaidyaOS", 10, 16);

  // Clinic tag
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Digital Prescription", pageWidth - 10, 16, { align: "right" });

  // Patient Details Section
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  
  let patientInfo = `Patient: ${patient.name || "N/A"}`;
  if (patient.age) patientInfo += `  |  Age: ${patient.age}`;
  if (patient.gender) patientInfo += `  |  Gender: ${patient.gender}`;
  
  doc.text(patientInfo, 10, 35);
  
  const dateStr = new Date().toLocaleDateString('en-IN');
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${dateStr}`, pageWidth - 10, 35, { align: "right" });

  doc.setDrawColor(220, 220, 220);
  doc.line(10, 40, pageWidth - 10, 40);

  // Rx Symbol
  doc.setFont("times", "bolditalic");
  doc.setFontSize(24);
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text("Rx", 10, 52);

  // Medicine Table
  const tableData = medicines.map((m, i) => [
    (i + 1).toString(),
    m.name || "-",
    m.dosage || "-",
    m.frequency || "-",
    m.timing || "-",
    m.duration || "-"
  ]);

  autoTable(doc, {
    startY: 60,
    head: [['#', 'Medicine', 'Dosage', 'Frequency', 'Timing', 'Duration']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: primaryGreen as [number, number, number],
      textColor: 255,
      fontStyle: 'bold'
    },
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [245, 250, 245]
    }
  });

  // Footer Signature Line
  const finalY = (doc as any).lastAutoTable.finalY || 100;
  
  doc.setDrawColor(0, 0, 0);
  doc.line(pageWidth - 60, finalY + 40, pageWidth - 10, finalY + 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text("Doctor's Signature", pageWidth - 35, finalY + 45, { align: "center" });

  const fileName = `VaidyaOS_${patient.name ? patient.name.replace(/\s+/g, '_') : 'Prescription'}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}