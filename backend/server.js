// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const PDFParser = require('pdf2json');
const path = require('path'); 
require('dotenv').config();

const app = express();

app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/v1/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    console.log("=== [1] New Request Received ===");
    
    if (!req.file) {
      console.log("!!! File missing in request !!!");
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    console.log(`=== [2] Parsing PDF: ${req.file.originalname} ===`);
    
    const pdfParser = new PDFParser(null, 1);
    const resumeText = await new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
      pdfParser.on("pdfParser_dataReady", pdfData => {
        resolve(pdfParser.getRawTextContent());
      });
      pdfParser.parseBuffer(req.file.buffer);
    });

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Could not read any text from the PDF.' });
    }

    console.log("=== [3] PDF Parsed. Length:", resumeText.length);
    console.log("=== [4] Sending to Gemini via Clean REST API (No SDK)... ===");

    const prompt = `
      You are an expert technical HR manager. Analyze the following resume text carefully.
      
      Resume Text:
      "${resumeText}"
      
      Return ONLY a valid JSON object. Do NOT include any markdown formatting, do NOT include \`\`\`json or \`\`\` brackets. Return pure JSON string.
      
      Expected JSON structure:
      {
        "fullName": "Candidate's full name",
        "email": "Candidate's email or null",
        "summary": "A concise 2-sentence professional summary",
        "technicalSkills": ["Array of core technical skills found"],
        "softSkills": ["Array of soft skills found"],
        "experienceYears": 0, 
        "strengths": ["Top 3 professional strengths"],
        "improvements": ["Areas where the candidate needs to improve or missing critical stack elements"],
        "matchedRoles": ["Top 3 job titles suited for this profile"]
      }
    `;

    const apiKey = process.env.GEMINI_API_KEY;
    
    // Direct, hardcoded stable v1 endpoint. No SDK layers to hijack our version!
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }] // Clean payload, no buggy config objects
      })
    });

    if (!googleResponse.ok) {
      const errText = await googleResponse.text();
      throw new Error(`Google API Error: ${googleResponse.status} - ${errText}`);
    }

    const googleData = await googleResponse.json();
    console.log("=== [5] Gemini API Responded Successfully ===");

    let resultText = googleData.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/```json|```/g, "").trim();

    const analysisResult = JSON.parse(resultText);
    return res.status(200).json({ success: true, data: analysisResult });

  } catch (error) {
    console.log("\n❌ ================= CRITICAL BACKEND ERROR ================= ❌");
    console.error(error.message);
    console.log("❌ ========================================================= ❌\n");
    
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`🚀 Server actually running on port ${PORT}`));