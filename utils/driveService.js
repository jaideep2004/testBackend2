const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { Readable } = require('stream');

let oauth2Client = null;
let drive = null;

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1FfFhEOImZMkLm2qWiSgfmFmR1U9G_3Od';

// Set OAuth2 tokens
const setTokens = (tokens) => {
  oauth2Client = new OAuth2Client( 
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  
  oauth2Client.setCredentials(tokens);
  
  // Initialize Google Drive client
  drive = google.drive({ 
    version: 'v3', 
    auth: oauth2Client,
    retryConfig: { 
      retry: 3,
      retryDelay: 1000
    }
  });
};

const uploadFileToDrive = async (fileBuffer, filename, mimeType = 'application/octet-stream') => {
  if (!drive) {
    throw new Error('Google Drive client not initialized. Please authenticate first.');
  }

  try {
    // Determine MIME type from filename if not provided
    if (!mimeType) {
      const ext = filename.split('.').pop().toLowerCase();
      mimeType = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }[ext] || 'application/octet-stream';
    }

    // Convert Buffer to Readable stream for Google Drive API
    const bufferStream = Readable.from(fileBuffer);
    
    // Upload file
    const response = await drive.files.create({
      requestBody: {
        name: `${Date.now()}-${filename}`,
        mimeType,
        parents: [FOLDER_ID]
      },
      media: {
        mimeType,
        body: bufferStream
      },
      fields: 'id,name,webViewLink,webContentLink',
      supportsAllDrives: true
    });

    // Make file public
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      },
      supportsAllDrives: true
    });

    return {
      id: response.data.id,
      name: response.data.name,
      url: response.data.webViewLink,
      downloadUrl: response.data.webContentLink?.replace(/\/view\?usp=drivesdk$/, '/preview')
    };
  } catch (error) {
    console.error('Google Drive upload error:', {
      message: error.message,
      code: error.code,
      details: error.errors?.[0]?.message
    });
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

const deleteFileFromDrive = async (fileId) => {
  if (!drive) {
    throw new Error('Google Drive client not initialized');
  }

  try {
    await drive.files.delete({
      fileId: fileId,
      supportsAllDrives: true
    });
    return true;
  } catch (error) {
    if (error.code === 404) {
      console.warn(`File not found, may have been already deleted: ${fileId}`);
      return true;
    }
    console.error('Error deleting file from Google Drive:', error.message);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

// Auto-initialize with refresh token from .env at startup
if (process.env.GOOGLE_REFRESH_TOKEN) {
  setTokens({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
} else {
  console.error('GOOGLE_REFRESH_TOKEN is missing in .env!');
}

module.exports = {
  drive, 
  setTokens, 
  uploadFileToDrive,
  deleteFileFromDrive
};
