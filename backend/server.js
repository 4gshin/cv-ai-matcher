// backend/server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure Multer for file uploads (saving in memory)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/v1/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    // 1. Extract text from the uploaded PDF
    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text;

    // 2. Initialize the Gemini model (using gemini-1.5-flash for speed and reliability)
    const model = ai.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' } // Forces JSON output
    });

    // 3. Construct the English prompt for structured analysis
    const prompt = `
      You are an expert technical HR manager. Analyze the following resume text carefully.
      
      Resume Text:
      "${resumeText}"
      
      Provide a rigorous evaluation. Return ONLY a JSON object with the following exact keys:
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

    // 4. Call AI API
    const response = await model.generateContent(prompt);
    const resultText = response.response.text();
    
    // 5. Parse and send the structured JSON back to frontend
    const analysisResult = JSON.parse(resultText);
    return res.status(200).json({ success: true, data: analysisResult });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));