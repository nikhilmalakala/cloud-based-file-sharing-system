const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');
const { authenticateRequest } = require('../utils/auth');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

app.http('uploadFile', {
    methods: ['POST'],
    authLevel: 'anonymous',

    handler: async (request, context) => {
        let blobClient = null;

        try {
            // 1. Authenticate user via application session
            const { user, errorResponse } = await authenticateRequest(request, context);
            if (errorResponse) {
                return errorResponse;
            }

            // 2. Azure authentication via Managed Identity / Developer credential
            const credential = new DefaultAzureCredential();

            // Environment configuration
            const storageAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME;
            const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
            const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
            const cosmosDatabase = process.env.COSMOS_DB_DATABASE;
            const cosmosContainer = process.env.COSMOS_DB_CONTAINER;

            // 3. Read multipart/form-data
            const formData = await request.formData();
            const file = formData.get('file');

            if (!file || typeof file.arrayBuffer !== 'function') {
                return {
                    status: 400,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'No file was provided. Use form field "file".'
                    }
                };
            }

            // Validate file size
            if (file.size === 0) {
                return {
                    status: 400,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'The uploaded file is empty.'
                    }
                };
            }

            if (file.size > MAX_FILE_SIZE) {
                return {
                    status: 413,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File size exceeds the 10 MB limit.'
                    }
                };
            }

            // Generate unique file ID
            const fileId = crypto.randomUUID();

            // Clean the original filename
            const originalFileName = file.name || 'unnamed-file';

            const safeFileName = originalFileName
                .replace(/[^a-zA-Z0-9._-]/g, '_')
                .substring(0, 150);

            const blobName = `${fileId}-${safeFileName}`;

            const contentType = file.type || 'application/octet-stream';

            // Authoritative owner from authenticated session
            const ownerId = user.id || user.oid;
            const ownerEmail = user.email;
            const ownerName = user.name;

            // ---------------------------------------
            // 4. Upload file to Azure Blob Storage
            // ---------------------------------------
            const blobServiceClient = new BlobServiceClient(
                `https://${storageAccount}.blob.core.windows.net`,
                credential
            );

            const containerClient = blobServiceClient.getContainerClient(containerName);
            blobClient = containerClient.getBlockBlobClient(blobName);

            const fileBuffer = Buffer.from(await file.arrayBuffer());

            await blobClient.uploadData(fileBuffer, {
                blobHTTPHeaders: {
                    blobContentType: contentType
                }
            });

            // ---------------------------------------
            // 5. Save metadata to Cosmos DB
            // ---------------------------------------
            const cosmosClient = new CosmosClient({
                endpoint: cosmosEndpoint,
                aadCredentials: credential
            });

            const database = cosmosClient.database(cosmosDatabase);
            const container = database.container(cosmosContainer);

            const metadata = {
                id: fileId,
                type: 'file',
                ownerId,
                ownerEmail,
                ownerName,
                fileName: originalFileName,
                blobName,
                contentType,
                size: file.size,
                createdAt: new Date().toISOString()
            };

            try {
                await container.items.create(metadata);
            } catch (cosmosError) {
                // If Cosmos fails, clean up the uploaded blob
                try {
                    await blobClient.deleteIfExists();
                } catch (cleanupError) {
                    context.error('Blob cleanup failed:', cleanupError);
                }
                throw cosmosError;
            }

            // ---------------------------------------
            // 6. Successful response
            // ---------------------------------------
            return {
                status: 201,
                jsonBody: {
                    status: 'OK',
                    message: 'File uploaded successfully',
                    file: metadata
                }
            };

        } catch (error) {
            context.error('File upload failed:', error);

            return {
                status: 500,
                jsonBody: {
                    status: 'ERROR',
                    message: error.message
                }
            };
        }
    }
});