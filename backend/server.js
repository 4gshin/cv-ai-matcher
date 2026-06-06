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

app.post('/api/v1/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    console.log("=== [1] New Request Received ===");

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded.'
      });
    }

    console.log(`=== [2] Parsing PDF: ${req.file.originalname} ===`);

    const pdfParser = new PDFParser(null, 1);

    const resumeText = await new Promise((resolve, reject) => {
      pdfParser.on("pdfParser_dataError", errData => {
        reject(errData.parserError);
      });

      pdfParser.on("pdfParser_dataReady", () => {
        resolve(pdfParser.getRawTextContent());
      });

      pdfParser.parseBuffer(req.file.buffer);
    });

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Could not read any text from the PDF.'
      });
    }

    console.log("=== [3] PDF Parsed. Length:", resumeText.length);
    console.log("=== [4] Sending to Gemini... ===");

    const model = ai.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    });

    const prompt = `
You are an expert technical HR manager. Analyze the following resume text carefully.

Resume Text:
"""
${resumeText}
"""

Return ONLY a valid JSON object matching this exact structure. 
Do not use markdown. Do not wrap the result in triple backticks.

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

    const response = await model.generateContent(prompt);

    console.log("=== [5] Gemini API Responded Successfully ===");

    let resultText = response.response.text();

    resultText = resultText.replace(/```json|```/g, "").trim();

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Gemini did not return valid JSON.");
    }

    const analysisResult = JSON.parse(jsonMatch[0]);

    return res.status(200).json({
      success: true,
      data: analysisResult
    });

  } catch (error) {
    console.log("\n❌ ================= CRITICAL BACKEND ERROR ================= ❌");
    console.error(error);
    console.log("❌ ========================================================= ❌\n");

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error.'
    });
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});