/**
 * Google Drive integration service for file storage
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Google service account credentials loaded from .env
let googleCredentials = null;
try {
  // First try to load from GOOGLE_CREDENTIALS_JSON string
  if (process.env.GOOGLE_CREDENTIALS) {
    googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  } 
  // Fallback to credentials file path
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credsPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    googleCredentials = require(credsPath);
  } else {
    throw new Error('Neither GOOGLE_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS is set in .env');
  }
} catch (err) {
  console.error('Failed to load Google credentials:', err.message);
  throw new Error('Google credentials are missing or malformed.');
}

// Google Drive folder ID where files will be stored
// Replace with your actual folder ID copied from Google Drive
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1FfFhEOImZMkLm2qWiSgfmFmR1U9G_3Od';

// Initialize the Google Drive API client
const initializeDrive = () => {
  try {
    console.log('Initializing Google Drive with service account:', googleCredentials.client_email);
    console.log('Using folder ID:', FOLDER_ID);
    
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata'
      ]
    });
    
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
    throw error;
  }
};

// Drive client instance
const drive = initializeDrive();

/**
 * Uploads a file to Google Drive
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} filename - Original filename
 * @param {string} mimeType - File MIME type
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
const uploadFileToDrive = async (fileBuffer, filename, mimeType = null) => {
  if (!drive) {
    throw new Error('Google Drive client not initialized');
  }

  try {
    // Determine the MIME type based on file extension if not provided
    if (!mimeType) {
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.pdf') {
        mimeType = 'application/pdf';
      } else if (ext === '.mp4') {
        mimeType = 'video/mp4';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        mimeType = 'image/jpeg';
      } else if (ext === '.png') {
        mimeType = 'image/png';
      } else {
        mimeType = 'application/pdf'; // Default to PDF
      }
    }

    // Create file metadata with the shared folder as parent
    const fileMetadata = {
      name: `${Date.now()}-${filename}`, // Add timestamp to avoid name conflicts
      parents: [FOLDER_ID]
    };
    
    console.log('Uploading file with metadata:', JSON.stringify(fileMetadata, null, 2));

    // Create media object
    let bodyStream;
    // If fileBuffer is a Buffer, use Readable.from
    if (Buffer.isBuffer(fileBuffer)) {
      const { Readable } = require('stream');
      bodyStream = Readable.from(fileBuffer);
    } else if (fileBuffer && fileBuffer.path) {
      // If fileBuffer is a file object with a path (from multer diskStorage)
      const fs = require('fs');
      bodyStream = fs.createReadStream(fileBuffer.path);
    } else {
      throw new Error('Invalid fileBuffer provided to uploadFileToDrive');
    }
    const media = {
      mimeType,
      body: bodyStream
    };

    // Upload file with error handling
    let response;
    try {
      console.log('Attempting to upload file to Google Drive...');
      response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,webViewLink,mimeType',
        supportsAllDrives: true,  // Important for shared drives
        supportsTeamDrives: true  // For backward compatibility
      });
      console.log('Upload successful, file ID:', response.data.id);
    } catch (uploadError) {
      console.error('Upload failed with error:', {
        message: uploadError.message,
        code: uploadError.code,
        errors: uploadError.errors,
        response: uploadError.response?.data
      });
      throw uploadError;
    }

    console.log('File uploaded to Google Drive:', response.data);

    // Make the file publicly accessible
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // Get direct download link
    const fileInfo = await drive.files.get({
      fileId: response.data.id,
      fields: 'webContentLink,webViewLink,mimeType'
    });

    // Create a direct download URL that forces the correct content type
    let downloadUrl = fileInfo.data.webContentLink;
    
    // Make sure the download URL has the correct parameters
    if (downloadUrl && !downloadUrl.includes('export=download')) {
      downloadUrl = downloadUrl.includes('?') 
        ? `${downloadUrl}&export=download` 
        : `${downloadUrl}?export=download`;
    }

    // Return download link
    return {
      fileId: response.data.id,
      downloadUrl: downloadUrl,
      viewUrl: fileInfo.data.webViewLink,
      fileName: response.data.name,
      mimeType: fileInfo.data.mimeType || mimeType
    };
  } catch (error) {
    console.error('Detailed error uploading to Google Drive:', {
      message: error.message,
      code: error.code,
      errors: error.errors,
      response: error.response?.data,
      stack: error.stack
    });
    throw new Error(`Failed to upload file to Google Drive: ${error.message}`);
  }
};

/**
 * Deletes a file from Google Drive
 * @param {string} fileId - The ID of the file to delete
 * @returns {Promise<boolean>} - True if deletion was successful
 */
const deleteFileFromDrive = async (fileId) => {
  if (!drive) {
    throw new Error('Google Drive client not initialized');
  }

  try {
    await drive.files.delete({
      fileId: fileId
    });
    return true;
  } catch (error) {
    console.error('Error deleting file from Google Drive:', error);
    throw new Error('Failed to delete file from Google Drive');
  }
};

module.exports = {
  uploadFileToDrive,
  deleteFileFromDrive
}; 