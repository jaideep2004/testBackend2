/**
 * Google Drive integration service for file storage
 */

const { google } = require('googleapis');
// Google service account credentials directly embedded
const googleCredentials = {
  type: "service_account",
  project_id: "testseries-464711",
  private_key_id: "c051dfffeb99f7155d8ab8170a845becc1dd6886",
  private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCY0u+4APNA7t1r\no2Vg2DcxJIWS6ci/6mIlk5Hf8IKgQ/iLYWFo7Z3BYeW2u7g+y+qW/H/6lfp5dfi8\ndYzoWN1zaJIyflQ9NXGaQmE/aJ27/QUW+nyeuHzPNhGVwwJwqvk+qbtenhMKMLqS\ngQqr3UaKtibCGOY6aV0oB9R8fFKXHrpp2avisRU0+JzTZ274jdSC9x/HhquwMe3N\n3FkJB79gJ3+Na0xw+Y6Deaogjt+lQ/jBvO7tbchuz9BnWteTCCnax9rNrYo0dbae\n7naTHEO7BV45TgSzyEmWSx8QFMlYbC4GEP6B4GDmUS3caCkMCYaBxQvF7Oi4kMM7\nN1sabmAvAgMBAAECggEAAjktjfPWM7CjfbmiTFR49MewZc0ow621qEut3FFYwrP8\n6chbcg6ptDLFkfEW56m/WoLVwr11imw4Q/UHFdqW92zx0HvwVLq3Kng2c6y2CnTO\nccP77nc3ktx70rQJEDTfCgvO4fchswMZtQLdSqZZQE39V3DL6UtVIRYKOvjLwUUQ\nGs3JWiXzcOlhaBeMMdxBFTJc+JjnNL5euc7XhcrhX13Qifau+KPep2V1qPmDbHkw\nQO3SfNly4dMoeRC25B86pzT6UumdHn05mXiGuWgLgb/UByLdvBAhfFp8v7mkpebG\noema6XDImz7O2G+A7IzGEzIY+xJS+Oo5zJCWlnhSQQKBgQDQvsqOkgTFAGB5FWwo\neeiWq/YzT2MOATeprXlTd73LNTTph/PSXGaJMf0iFDG7q91tLivDrxQJ9r/9LeUD\nvQk+/EWvIHZRhDrgXln2b73R6BiN/CijHBaws8il0PePNbHsL3EiDmVrzr/6q0e3\n1PyUydi0K5EHwDT7yEzMF3DXTwKBgQC7a2ST/Kfrze6yD/ev8fUP2O22U5MtTKgq\nl6HX8FoaEAb0gjdNpoNjxyO6GVmAds81MVGWwCIs9CMePWqvsecKWhhC9j4XLnRF\naI1X5w+NCdshxImV2CCgqkG9Hmrtt1GguLdkLG5zDMcvORZ+ddCndOsThmNCzbJ6\nA2L9TmuxIQKBgEUNB9Y3iSpdoIwNQRT2lrDYu31nol2sm2wefUbWEktZE2K43TfV\n5vk1NwYB5h2tkXafUkzN6nQNUp7+goZFDvzt2GNA+sKmWg+ERoAVoJYCD7VQF2U1\nUnArWJE5WdreqTd2zha06mnKH4ldBUFTTCYvyuZ2juggdaZgML9GdcZTAoGBAKzf\n84c5nx639nvSlLJ7aYOzohjy4CgBtICNG2EWt9WggPnafu6mMD3B+2d2aINBlAHJ\nuytlkGCM1TPYjOcBH08CKazifAVf+Snota+mV0bOF43/PrW0BOyN/1NVkmYxGR86\nIxdIkJyY5cXeT6xYOh2skAWTiU2edQlsxEtIobdhAoGAHEu9ipJ1k7+Qkb7HRH95\nMA7HwszBaW68qw9HeHfCpimtMFsZgE9h9kTWhnfk5SqRvEueDeGCyXNZrXwaNgbD\nRlcyqkwBhn5EoSanvVyFJCPvNYJ1SYQowGXuIwKMGVgzDwQyRlgI+lHO11+wTfS1\n3LNRArH2twhC31SfMnlE0rY=\n-----END PRIVATE KEY-----\n`,
  client_email: "pdf-storage@testseries-464711.iam.gserviceaccount.com",
  client_id: "116304378515215682716",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/pdf-storage%40testseries-464711.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

// Google Drive folder ID where files will be stored
// Replace with your actual folder ID copied from Google Drive
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1FfFhEOImZMkLm2qWiSgfmFmR1U9G_3Od';

// Initialize the Google Drive API client
const initializeDrive = () => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
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