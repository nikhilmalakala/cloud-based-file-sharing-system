const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateRequest } = require('../utils/auth');

app.http('listSharedFiles', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'shared-files',

    handler: async (request, context) => {
        try {
            // 1. Authenticate user via application session
            const { user, errorResponse } = await authenticateRequest(request, context);
            if (errorResponse) {
                return errorResponse;
            }

            const credential = new DefaultAzureCredential();

            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                aadCredentials: credential
            });

            const database = cosmosClient.database(process.env.COSMOS_DB_DATABASE);
            const container = database.container(process.env.COSMOS_DB_CONTAINER);

            const userEmail = user.email.toLowerCase();
            const userOid = user.id || user.oid;

            const querySpec = {
                query: `
                    SELECT
                        c.id,
                        c.fileId,
                        c.ownerId,
                        c.ownerEmail,
                        c.sharedBy,
                        c.sharedByName,
                        c.sharedWith,
                        c.sharedWithOid,
                        c.permission,
                        c.fileName,
                        c.contentType,
                        c.size,
                        c.createdAt
                    FROM c
                    WHERE c.type = 'share'
                    AND (c.sharedWith = @userEmail OR c.sharedWith = @userOid OR c.sharedWithOid = @userOid)
                    ORDER BY c.createdAt DESC
                `,
                parameters: [
                    { name: '@userEmail', value: userEmail },
                    { name: '@userOid', value: userOid }
                ]
            };

            const { resources } = await container.items
                .query(querySpec)
                .fetchAll();

            return {
                status: 200,
                jsonBody: {
                    status: 'OK',
                    count: resources.length,
                    sharedFiles: resources
                }
            };

        } catch (error) {
            context.error('Failed to list shared files:', error);

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