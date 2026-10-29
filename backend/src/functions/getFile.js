const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateRequest } = require('../utils/auth');

app.http('getFile', {
    methods: ['GET'],
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

            // 2. Check if caller is the owner
            const ownerId = user.id || user.oid;
            const userOid = user.id || user.oid;

            const ownerQuerySpec = {
                query: `
                    SELECT TOP 1
                        c.id,
                        c.ownerId,
                        c.ownerEmail,
                        c.ownerName,
                        c.fileName,
                        c.blobName,
                        c.contentType,
                        c.size,
                        c.createdAt
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

            if (ownerFiles.length > 0) {
                return {
                    status: 200,
                    jsonBody: {
                        status: 'OK',
                        file: {
                            ...ownerFiles[0],
                            isOwner: true
                        }
                    }
                };
            }

            // 3. If not owner, check if the file is shared with the caller
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
                    { name: '@userOid', value: userOid }
                ]
            };

            const { resources: shareRecords } = await container.items
                .query(shareQuerySpec)
                .fetchAll();

            if (shareRecords.length === 0) {
                return {
                    status: 404,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File not found or access denied.'
                    }
                };
            }

            const share = shareRecords[0];

            // Permanently bind verified directory OID if not already bound
            if (!share.sharedWithOid && user.oid) {
                share.sharedWithOid = user.oid;
                container.items.upsert(share).catch(e => context.warn('Share OID auto-binding warning:', e));
            }

            // Retrieve the original file metadata from the owner's partition
            const sharedFileQuery = {
                query: `
                    SELECT TOP 1
                        c.id,
                        c.ownerId,
                        c.ownerEmail,
                        c.ownerName,
                        c.fileName,
                        c.blobName,
                        c.contentType,
                        c.size,
                        c.createdAt
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

            if (sharedFiles.length === 0) {
                return {
                    status: 404,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'Shared file no longer exists.'
                    }
                };
            }

            return {
                status: 200,
                jsonBody: {
                    status: 'OK',
                    file: {
                        ...sharedFiles[0],
                        isOwner: false,
                        isShared: true,
                        sharedBy: share.sharedBy,
                        sharedByName: share.sharedByName,
                        permission: share.permission || 'viewer',
                        sharedAt: share.createdAt
                    }
                }
            };

        } catch (error) {
            context.error('Failed to get file:', error);

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