const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const { GoogleAIFileManager } = require('@google/generative-ai/server'); 

const app = express();
const port = 3001; // You can choose any available port

// Enable CORS
app.use(cors());

// Enable file uploads
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/', // Or any temporary directory
}));

app.post('/upload', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  const apiKey = process.env.GEMINI_API_KEY; // Get API key from environment variable
  if (!apiKey) {
    return res.status(500).send('Gemini API key not configured.'); 
  }

  const fileManager = new GoogleAIFileManager(apiKey);
  const uploadedFile = req.files.file; // Assuming 'file' is the name attribute of your file input

  try {
    const uploadResponse = await fileManager.uploadFile(uploadedFile.tempFilePath, { // Use temp file path
      mimeType: uploadedFile.mimetype,
      displayName: uploadedFile.name,
    });

    res.send({ fileUri: uploadResponse.file.uri });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).send('File upload failed.');
  }
});

app.listen(port, () => {
  console.log(`File upload server listening on port ${port}`);
});