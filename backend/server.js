// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const PDFParser = require('pdf2json');
const path = require('path'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
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
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// INCREASED RESILIENCE: 8 retries with longer backoff to survive heavy Google server spikes
async function generateContentWithRetry(model, prompt, retries = 8, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      // If server is overloaded (503), log it and wait longer
      if (error.message.includes('503') && i < retries - 1) {
        console.log(`⏳ Google Server is slammed (503). Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Smooth exponential scaling
        continue;
      }
      throw error; 
    }
  }
}

app.post('/api/v1/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    console.log("=== [1] New Request Received ===");
    
    if (!req.file) {
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
    console.log("=== [4] Sending to Gemini 2.5 (Heavy Retry Mode)... ===");

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      You are an expert technical HR manager. Analyze the following resume text carefully.
      
      Resume Text:
      "${resumeText}"
      
      Return ONLY a valid JSON object matching this exact structure, with no markdown styling:
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

    const response = await generateContentWithRetry(model, prompt);
    console.log("=== [5] Gemini API Responded Successfully ===");

    let resultText = response.response.text();
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
app.listen(PORT, () => console.log("🚀 Server actually running on port 4000"));