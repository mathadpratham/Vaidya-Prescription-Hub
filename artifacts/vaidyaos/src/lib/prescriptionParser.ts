export interface Medicine {
  name: string;
  dosage?: string;
  frequency?: string;
  timing?: string;
  duration?: string;
  notes?: string;
}

const DOSAGE_REGEX = /(\d+\s?(?:mg|ml|mcg|g|tab|tablet|cap|capsule|drop|syrup|tsp))/i;
const DURATION_REGEX = /(\d+\s?(?:din|days|hafta|week|weeks|mahina|month))/i;

const FREQUENCY_KEYWORDS = [
  "ek baar", "do baar", "teen baar", "char baar",
  "subah", "shaam", "raat", "din mein",
  "OD", "BD", "TDS", "QID",
  "1-0-1", "1-1-1", "0-0-1", "0-1-1", "1-0-0",
  "twice", "thrice", "once daily", "every 6 hours", "every 8 hours"
];

const TIMING_KEYWORDS = [
  "khaane se pehle", "khaane ke baad", "before food", "after food",
  "khaali pet", "empty stomach", "soney se pehle", "at bedtime", "raat ko"
];

const MEDICINE_DICTIONARY = [
  "Paracetamol", "Crocin", "Dolo", "Azithromycin", "Amoxicillin", "Augmentin",
  "Pantoprazole", "Pan", "Omeprazole", "Cetirizine", "Cetzine", "Levocetirizine",
  "Montelukast", "Metformin", "Glycomet", "Telmisartan", "Amlodipine", "Atorvastatin",
  "Cefixime", "Taxim", "Ondansetron", "Emeset", "Domperidone", "Domstal", "ORS",
  "Zincovit", "Becosules", "B-complex", "Iron", "Calcium", "Vitamin D3"
];

export function parsePrescription(text: string): Medicine[] {
  if (!text) return [];

  // Split by common separators to get individual medicine chunks
  const chunks = text.split(/,|\baur\b|\band\b|\bphir\b|\bthen\b|\n|\./i).map(c => c.trim()).filter(Boolean);
  
  const medicines: Medicine[] = [];

  for (const chunk of chunks) {
    const med: Medicine = { name: "" };
    
    // Extract Dosage
    const dosageMatch = chunk.match(DOSAGE_REGEX);
    if (dosageMatch) {
      med.dosage = dosageMatch[1].trim();
    }

    // Extract Duration
    const durationMatch = chunk.match(DURATION_REGEX);
    if (durationMatch) {
      med.duration = durationMatch[1].trim();
    }

    // Extract Frequency
    const foundFreqs = FREQUENCY_KEYWORDS.filter(k => new RegExp(`\\b${k}\\b`, 'i').test(chunk));
    if (foundFreqs.length > 0) {
      med.frequency = foundFreqs.join(", ");
    }

    // Extract Timing
    const foundTimings = TIMING_KEYWORDS.filter(k => new RegExp(`\\b${k}\\b`, 'i').test(chunk));
    if (foundTimings.length > 0) {
      med.timing = foundTimings.join(", ");
    }

    // Extract Name
    // 1. Try fuzzy match from dictionary
    let foundName = MEDICINE_DICTIONARY.find(m => new RegExp(`\\b${m}\\b`, 'i').test(chunk));
    
    // 2. If not found, try getting capitalized words before the dosage
    if (!foundName) {
      let textBeforeDosage = chunk;
      if (dosageMatch) {
        textBeforeDosage = chunk.substring(0, dosageMatch.index).trim();
      }
      // Simple heuristic: just take the first word if it looks like a name
      const words = textBeforeDosage.split(" ").filter(Boolean);
      if (words.length > 0 && /^[a-zA-Z]+$/.test(words[0])) {
         foundName = words[0];
      }
    }

    if (foundName) {
      med.name = foundName.charAt(0).toUpperCase() + foundName.slice(1);
      medicines.push(med);
    }
  }

  return medicines;
}

// Sanity Checks
// console.log(parsePrescription("Patient ko Paracetamol 500 mg do baar khaane ke baad 5 din dena hai. Aur Pantoprazole 40 mg subah khaali pet 7 din."));
// console.log(parsePrescription("Crocin 650 BD after food for 3 days, Cetzine 10mg at night for 5 days, ORS sachet 1-0-1 SOS"));
