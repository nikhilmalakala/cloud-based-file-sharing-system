const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const { authenticateRequest } = require('../utils/auth');

app.http('listFiles', {
    methods: ['GET'],
    authLevel: 'anonymous',

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

            const ownerId = user.id || user.oid;

            const querySpec = {
                query: `
                    SELECT
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
                    WHERE c.ownerId = @ownerId
                    AND (NOT IS_DEFINED(c.type) OR (c.type != 'share' AND c.type != 'user'))
                    ORDER BY c.createdAt DESC
                `,
                parameters: [
                    {
                        name: '@ownerId',
                        value: ownerId
                    }
                ]
            };

            const { resources } = await container.items
                .query(querySpec, {
                    partitionKey: ownerId
                })
                .fetchAll();

            return {
                status: 200,
                jsonBody: {
                    status: 'OK',
                    count: resources.length,
                    files: resources
                }
            };

        } catch (error) {
            context.error('Failed to list files:', error);

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