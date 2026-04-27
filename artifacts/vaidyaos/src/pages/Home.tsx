import React, { useState, useEffect, useRef } from "react";
import { Logo } from "@/components/Logo";
import { MicButton } from "@/components/MicButton";
import { parsePrescription, Medicine } from "@/lib/prescriptionParser";
import { generatePrescriptionPDF } from "@/lib/pdfGenerator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Download, Stethoscope, AlertCircle } from "lucide-react";

export default function Home() {
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [supportError, setSupportError] = useState("");
  
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [showPrescription, setShowPrescription] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onresult = (event: any) => {
        let final = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          setTranscript((prev) => (prev + " " + final).trim());
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== 'no-speech') {
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        if (isRecording) {
           // Restart if continuous stopped unexpectedly, but we handle it manually
           try {
              recognition.start();
           } catch(e) {
              setIsRecording(false);
           }
        }
      };

      recognitionRef.current = recognition;
    } else {
      setSupportError("Aapka browser voice support nahi karta. Chrome/Safari use karein. / कृपया Chrome या Safari खोलें");
    }
  }, [isRecording]);

  const toggleRecording = () => {
    if (supportError) return;

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setInterimTranscript("");
    } else {
      setTranscript("");
      setShowPrescription(false);
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  const handleGenerate = () => {
    if (!transcript) return;
    const parsed = parsePrescription(transcript);
    setMedicines(parsed);
    setShowPrescription(true);
  };

  const handleDownload = () => {
    generatePrescriptionPDF({
      name: patientName,
      age: patientAge,
      gender: patientGender
    }, medicines);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20">
      <div className="max-w-md mx-auto px-4 py-8 space-y-8">
        
        <header className="pt-4">
          <Logo />
        </header>

        {supportError && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{supportError}</p>
          </div>
        )}

        <div className="space-y-4 bg-card p-4 rounded-2xl border shadow-sm">
          <div>
            <Label htmlFor="name" className="text-muted-foreground mb-1 block">
              Patient Name
            </Label>
            <Input 
              id="name" 
              placeholder="Patient ka naam likhein / मरीज़ का नाम" 
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="text-lg py-6"
            />
          </div>
          <div className="flex space-x-3">
             <div className="flex-1">
               <Input 
                 placeholder="Age (Varsh)" 
                 value={patientAge}
                 onChange={(e) => setPatientAge(e.target.value)}
               />
             </div>
             <div className="flex-1">
               <Input 
                 placeholder="Gender" 
                 value={patientGender}
                 onChange={(e) => setPatientGender(e.target.value)}
               />
             </div>
          </div>
        </div>

        <MicButton isRecording={isRecording} onClick={toggleRecording} />

        <div className="space-y-2 relative">
           <Label className="text-muted-foreground font-medium">Consultation Transcript</Label>
           <Textarea 
             className="min-h-[120px] text-base resize-none p-4 rounded-xl shadow-sm border-muted focus-visible:ring-primary/20"
             placeholder="Aapki awaaz yahan dikhegi… 'Rohit ko Paracetamol 500mg do baar khaane ke baad dena hai' / यहाँ बोला हुआ टेक्स्ट आएगा"
             value={transcript + (interimTranscript ? " " + interimTranscript : "")}
             onChange={(e) => setTranscript(e.target.value)}
           />
        </div>

        <Button 
          className="w-full py-6 text-lg rounded-xl shadow-md font-medium" 
          onClick={handleGenerate}
          disabled={!transcript && !interimTranscript}
        >
          Prescription banayein / प्रिस्क्रिप्शन बनाएं
        </Button>

        {showPrescription && (
          <Card className="mt-8 border-primary/20 shadow-lg overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center">
               <div className="font-serif font-bold text-xl flex items-center gap-2">
                 <Stethoscope className="w-5 h-5" />
                 VaidyaOS
               </div>
               <div className="text-sm font-medium opacity-90">Digital Rx</div>
            </div>
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-lg flex justify-between">
                 <span>{patientName || "Patient Name"}</span>
                 <span className="text-sm font-normal text-muted-foreground">
                   {new Date().toLocaleDateString('en-IN')}
                 </span>
              </CardTitle>
              {(patientAge || patientGender) && (
                <div className="text-sm text-muted-foreground">
                  {patientAge && `Age: ${patientAge} `} 
                  {patientGender && `| ${patientGender}`}
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-6">
              <div className="text-3xl font-serif text-primary italic mb-6">Rx</div>
              
              {medicines.length > 0 ? (
                <div className="space-y-6">
                  {medicines.map((med, idx) => (
                    <div key={idx} className="flex gap-4 border-b border-border/50 pb-4 last:border-0">
                      <div className="font-bold text-muted-foreground">{idx + 1}.</div>
                      <div className="flex-1 space-y-1">
                        <div className="font-bold text-lg">{med.name || "Unknown Medicine"} {med.dosage && <span className="text-sm font-medium text-muted-foreground ml-2">{med.dosage}</span>}</div>
                        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                           {med.frequency && <span><span className="font-medium text-foreground">Freq:</span> {med.frequency}</span>}
                           {med.timing && <span><span className="font-medium text-foreground">When:</span> {med.timing}</span>}
                           {med.duration && <span><span className="font-medium text-foreground">For:</span> {med.duration}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  Kuch saaf samajh nahi aaya — transcription edit karke dobara try karein / कुछ साफ़ नहीं समझा
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/10 pt-4 flex justify-between items-end border-t">
               <div className="w-32 border-b border-black/20 pb-1 text-center text-sm text-muted-foreground">
                 Doctor's Signature
               </div>
               <Button onClick={handleDownload} className="gap-2">
                 <Download className="w-4 h-4" />
                 PDF download karein
               </Button>
            </CardFooter>
          </Card>
        )}

      </div>
    </div>
  );
}
