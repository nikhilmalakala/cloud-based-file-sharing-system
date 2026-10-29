const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateRequest } = require('../utils/auth');

app.http('downloadFile', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'files/{id}/download',

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

            // -----------------------------
            // 2. Authorize via Cosmos DB
            // -----------------------------
            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                aadCredentials: credential
            });

            const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);
            const container = database.container(process.env.COSMOS_DB_CONTAINER);

            let targetFile = null;
            const userId = user.id || user.oid;

            // Check if caller is the owner
            const ownerQuerySpec = {
                query: `
                    SELECT TOP 1
                        c.id,
                        c.ownerId,
                        c.fileName,
                        c.blobName,
                        c.contentType,
                        c.size
                    FROM c
                    WHERE c.id = @fileId
                    AND c.ownerId = @ownerId
                    AND (NOT IS_DEFINED(c.type) OR (c.type != 'share' AND c.type != 'user'))
                `,
                parameters: [
                    { name: '@fileId', value: fileId },
                    { name: '@ownerId', value: userId }
                ]
            };

            const { resources: ownerFiles } = await container.items
                .query(ownerQuerySpec, { partitionKey: userId })
                .fetchAll();

            if (ownerFiles.length > 0) {
                targetFile = ownerFiles[0];
            } else {
                // If not owner, check if user is an authorized shared recipient
                const shareQuerySpec = {
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
                        { name: '@userOid', value: userId }
                    ]
                };

                const { resources: shareRecords } = await container.items
                    .query(shareQuerySpec)
                    .fetchAll();

                if (shareRecords.length > 0) {
                    const share = shareRecords[0];

                    if (!share.sharedWithOid && user.oid) {
                        share.sharedWithOid = user.oid;
                        container.items.upsert(share).catch(e => context.warn('Download share OID binding warning:', e));
                    }

                    const sharedFileQuery = {
                        query: `
                            SELECT TOP 1
                                c.id,
                                c.ownerId,
                                c.fileName,
                                c.blobName,
                                c.contentType,
                                c.size
                            FROM c
                            WHERE c.id = @fileId
                            AND c.ownerId = @ownerId
                            AND (NOT IS_DEFINED(c.type) OR c.type != 'share')
                        `,
                        parameters: [
                            { name: '@fileId', value: fileId },
                            { name: '@ownerId', value: share.ownerId }
                        ]
                    };

                    const { resources: sharedFiles } = await container.items
                        .query(sharedFileQuery, { partitionKey: share.ownerId })
                        .fetchAll();

                    if (sharedFiles.length > 0) {
                        targetFile = sharedFiles[0];
                    }
                }
            }

            if (!targetFile) {
                return {
                    status: 404,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File not found or you do not have permission to download it.'
                    }
                };
            }

            // -----------------------------
            // 3. Verify and Download Blob
            // -----------------------------
            const blobServiceClient = new BlobServiceClient(
                `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
                credential
            );

            const containerClient = blobServiceClient.getContainerClient(
                process.env.AZURE_STORAGE_CONTAINER_NAME
            );

            const blobClient = containerClient.getBlobClient(targetFile.blobName);

            const exists = await blobClient.exists();
            if (!exists) {
                return {
                    status: 404,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File metadata exists, but the file was not found in storage.'
                    }
                };
            }

            const downloadResponse = await blobClient.download();

            const chunks = [];
            for await (const chunk of downloadResponse.readableStreamBody) {
                chunks.push(chunk);
            }

            const fileBuffer = Buffer.concat(chunks);

            // -----------------------------
            // 4. Return file stream
            // -----------------------------
            // RFC 5987 / ASCII-safe filename encoding for Content-Disposition header
            const safeHeaderFilename = encodeURIComponent(targetFile.fileName).replace(/['()]/g, escape);

            return {
                status: 200,
                headers: {
                    'Content-Type': targetFile.contentType || 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="${targetFile.fileName.replace(/"/g, '')}"; filename*=UTF-8''${safeHeaderFilename}`,
                    'Content-Length': fileBuffer.length.toString()
                },
                body: fileBuffer
            };

        } catch (error) {
            context.error('File download failed:', error);

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