/**
 * Google Drive integration service for file storage
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Path to service account credentials file
// You'll need to place your downloaded JSON key file in a secure location
const CREDENTIALS_PATH = path.join(process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                                  path.join(__dirname, '../../config/google-credentials.json'));

// Google Drive folder ID where files will be stored
// Replace with your actual folder ID copied from Google Drive
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1FfFhEOImZMkLm2qWiSgfmFmR1U9G_3Od';

// Initialize the Google Drive API client
const initializeDrive = () => {
  try {
    // Check if credentials file exists
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error('Google credentials file not found at:', CREDENTIALS_PATH);
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
    return null;
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

    // Create file metadata
    const fileMetadata = {
      name: `${Date.now()}-${filename}`, // Add timestamp to avoid name conflicts
      parents: [FOLDER_ID]
    };

    // Create media object
    const media = {
      mimeType,
      body: fs.createReadStream(fileBuffer.path) // If using multer or similar
      // If you have a buffer instead, use:
      // body: Readable.from(fileBuffer)
    };

    // Upload file
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink,mimeType'
    });

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
    console.error('Error uploading file to Google Drive:', error);
    throw new Error('Failed to upload file to Google Drive');
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