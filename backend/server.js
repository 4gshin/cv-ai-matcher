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
      You are an elite Technical Recruiter and Career Architect. Analyze the following resume text deeply and critically.
      
      Resume Text:
      "${resumeText}"
      
      Provide a highly professional evaluation. Follow these strict guidelines for the JSON keys:
      1. fullName & email: Extract accurately.
      2. summary: Write a powerful, 2-sentence executive value proposition tailored to their target roles. Do not use generic filler words.
      3. technicalSkills: Extract specific frameworks, databases, tools, and methodologies.
      4. softSkills: Extract or infer strong behavioral traits based on projects/roles.
      5. experienceYears: Calculate strictly based on dates.
      6. strengths: Provide 3 hyper-specific engineering strengths with context (e.g., instead of "Good at React", use "Solid understanding of component architecture and modern state management").
      7. improvements: Provide 3 strategic, actionable engineering feedback points. Do not just list what is missing; explicitly state "what to add next" to level up (e.g., specific architectures, DevOps tools, or database paradigms).
      8. matchedRoles: Provide 3 precise tech-industry job titles.
      
      Return ONLY a valid JSON object matching this exact structure, with no markdown styling:
      {
        "fullName": "Candidate's full name",
        "email": "Candidate's email or null",
        "summary": "Professional executive summary",
        "technicalSkills": ["Skills"],
        "softSkills": ["Skills"],
        "experienceYears": 0, 
        "strengths": ["Actionable strength 1", "Actionable strength 2", "Actionable strength 3"],
        "improvements": ["Strategic upgrade path 1", "Strategic upgrade path 2", "Strategic upgrade path 3"],
        "matchedRoles": ["Role 1", "Role 2", "Role 3"]
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