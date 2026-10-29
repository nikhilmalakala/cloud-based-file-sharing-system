const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateRequest } = require('../utils/auth');

app.http('deleteFile', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'files/{id}',

    handler: async (request, context) => {
        try {
            // 1. Authenticate user via application session
            const { user, errorResponse } = await authenticateRequest(request, context);
            if (errorResponse) {
                return errorResponse;
            }

            const fileId = request.params.id;

            if (!fileId) {
                return {
                    status: 400,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File ID is required.'
                    }
                };
            }

            const credential = new DefaultAzureCredential();

            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                aadCredentials: credential
            });

            const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);
            const container = database.container(process.env.COSMOS_DB_CONTAINER);

            // 2. Verify file ownership
            const ownerId = user.id || user.oid;

            const ownerQuerySpec = {
                query: `
                    SELECT TOP 1 *
                    FROM c
                    WHERE c.id = @fileId
                    AND c.ownerId = @ownerId
                    AND (NOT IS_DEFINED(c.type) OR (c.type != 'share' AND c.type != 'user'))
                `,
                parameters: [
                    { name: '@fileId', value: fileId },
                    { name: '@ownerId', value: ownerId }
                ]
            };

            const { resources: ownerFiles } = await container.items
                .query(ownerQuerySpec, { partitionKey: ownerId })
                .fetchAll();

            if (ownerFiles.length === 0) {
                // Check if user is a shared recipient trying to delete
                const shareCheckQuery = {
                    query: `
                        SELECT TOP 1 *
                        FROM c
                        WHERE c.type = 'share'
                        AND c.fileId = @fileId
                        AND (c.sharedWith = @userEmail OR c.sharedWith = @userOid OR c.sharedWithOid = @userOid)
                    `,
                    parameters: [
                        { name: '@fileId', value: fileId },
                        { name: '@userEmail', value: user.email.toLowerCase() },
                        { name: '@userOid', value: ownerId }
                    ]
                };

                const { resources: shareRecords } = await container.items
                    .query(shareCheckQuery)
                    .fetchAll();

                if (shareRecords.length > 0) {
                    return {
                        status: 403,
                        jsonBody: {
                            status: 'ERROR',
                            message: 'Forbidden. Shared recipients do not have permission to delete this file.'
                        }
                    };
                }

                return {
                    status: 404,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File not found.'
                    }
                };
            }

            const file = ownerFiles[0];

            // 3. Delete Blob from Azure Blob Storage
            const blobServiceClient = new BlobServiceClient(
                `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
                credential
            );

            const containerClient = blobServiceClient.getContainerClient(
                process.env.AZURE_STORAGE_CONTAINER_NAME
            );

            const blobClient = containerClient.getBlobClient(file.blobName);

            await blobClient.deleteIfExists();

            // 4. Delete file metadata from Cosmos DB
            await container.item(fileId, ownerId).delete();

            // 5. Cascade delete associated share records for this file
            try {
                const sharesQuery = {
                    query: `
                        SELECT c.id, c.ownerId
                        FROM c
                        WHERE c.type = 'share'
                        AND c.fileId = @fileId
                    `,
                    parameters: [
                        { name: '@fileId', value: fileId }
                    ]
                };

                const { resources: sharesToDelete } = await container.items
                    .query(sharesQuery)
                    .fetchAll();

                for (const shareItem of sharesToDelete) {
                    await container.item(shareItem.id, shareItem.ownerId).delete().catch(() => {});
                }
            } catch (shareCleanupErr) {
                context.warn('Share cleanup warning:', shareCleanupErr);
            }

            return {
                status: 200,
                jsonBody: {
                    status: 'OK',
                    message: 'File deleted successfully.',
                    fileId
                }
            };

        } catch (error) {
            context.error('File deletion failed:', error);

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