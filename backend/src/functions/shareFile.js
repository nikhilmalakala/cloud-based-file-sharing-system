const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');
const { authenticateRequest } = require('../utils/auth');
const { findUserByEmail } = require('../utils/userStore');

app.http('shareFile', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'files/{id}/share',

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

            let body = {};
            try {
                body = await request.json();
            } catch (jsonErr) {
                return {
                    status: 400,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'Invalid JSON request body.'
                    }
                };
            }

            const rawSharedWith = body.sharedWith;

            if (!rawSharedWith || typeof rawSharedWith !== 'string' || !rawSharedWith.trim()) {
                return {
                    status: 400,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'sharedWith (recipient email) is required.'
                    }
                };
            }

            const sharedWith = rawSharedWith.trim().toLowerCase();

            // Prevent sharing with oneself
            if (sharedWith === user.email.toLowerCase() || sharedWith === user.oid) {
                return {
                    status: 400,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'You cannot share a file with yourself.'
                    }
                };
            }

            const permission = (body.permission && ['viewer', 'editor'].includes(body.permission.toLowerCase()))
                ? body.permission.toLowerCase()
                : 'viewer';

            const ownerId = user.id || user.oid;

            // -----------------------------
            // 2. Cosmos DB connection
            // -----------------------------
            const credential = new DefaultAzureCredential();

            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                aadCredentials: credential
            });

            const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);
            const container = database.container(process.env.COSMOS_DB_CONTAINER);

            // -----------------------------
            // 3. Verify file ownership
            // -----------------------------
            const fileQuerySpec = {
                query: `
                    SELECT TOP 1
                        c.id,
                        c.ownerId,
                        c.fileName,
                        c.contentType,
                        c.size
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
                .query(fileQuerySpec, { partitionKey: ownerId })
                .fetchAll();

            if (ownerFiles.length === 0) {
                return {
                    status: 404,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'File not found or you do not have permission to share it.'
                    }
                };
            }

            const file = ownerFiles[0];

            // -----------------------------
            // 4. Check for duplicate share
            // -----------------------------
            const existingShareQuery = {
                query: `
                    SELECT TOP 1 *
                    FROM c
                    WHERE c.type = 'share'
                    AND c.fileId = @fileId
                    AND c.ownerId = @ownerId
                    AND c.sharedWith = @sharedWith
                `,
                parameters: [
                    { name: '@fileId', value: fileId },
                    { name: '@ownerId', value: ownerId },
                    { name: '@sharedWith', value: sharedWith }
                ]
            };

            const { resources: existingShares } = await container.items
                .query(existingShareQuery, { partitionKey: ownerId })
                .fetchAll();

            if (existingShares.length > 0) {
                return {
                    status: 200,
                    jsonBody: {
                        status: 'OK',
                        message: 'File is already shared with this user.',
                        share: existingShares[0]
                    }
                };
            }

            // Look up recipient in application user database if registered
            let recipientUserId = null;
            try {
                const recipientUser = await findUserByEmail(sharedWith);
                if (recipientUser) {
                    recipientUserId = recipientUser.id;
                }
            } catch (userLookupErr) {
                context.warn('Could not lookup recipient user ID:', userLookupErr.message);
            }

            // -----------------------------
            // 5. Create sharing record
            // -----------------------------
            const shareId = crypto.randomUUID();

            const shareRecord = {
                id: shareId,
                type: 'share',
                fileId,
                ownerId,
                ownerEmail: user.email,
                sharedBy: user.email,
                sharedByName: user.name,
                sharedWith,
                sharedWithOid: recipientUserId,
                permission,
                fileName: file.fileName,
                contentType: file.contentType,
                size: file.size,
                createdAt: new Date().toISOString()
            };

            await container.items.create(shareRecord);

            return {
                status: 201,
                jsonBody: {
                    status: 'OK',
                    message: 'File shared successfully.',
                    share: shareRecord
                }
            };

        } catch (error) {
            context.error('File sharing failed:', error);

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