const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');

app.http('azureTest', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const credential = new DefaultAzureCredential();

            // Blob Storage test
            const storageAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME;
            const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

            const blobServiceClient = new BlobServiceClient(
                `https://${storageAccount}.blob.core.windows.net`,
                credential
            );

            const containerClient =
                blobServiceClient.getContainerClient(containerName);

            const blobs = [];

            for await (const blob of containerClient.listBlobsFlat()) {
                blobs.push(blob.name);
            }

            // Cosmos DB test
            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                aadCredentials: credential
            });

            const database = cosmosClient.database(
                process.env.COSMOS_DB_DATABASE
            );

            const container = database.container(
                process.env.COSMOS_DB_CONTAINER
            );

            const { resources } = await container.items
                .query('SELECT TOP 5 c.id FROM c')
                .fetchAll();

            return {
                status: 200,
                jsonBody: {
                    status: 'OK',
                    authentication: 'DefaultAzureCredential',
                    blobStorage: {
                        status: 'Connected',
                        container: containerName,
                        blobCount: blobs.length,
                        blobs
                    },
                    cosmosDb: {
                        status: 'Connected',
                        database: process.env.COSMOS_DB_DATABASE,
                        container: process.env.COSMOS_DB_CONTAINER,
                        itemsFound: resources.length
                    }
                }
            };
        } catch (error) {
            context.error('Azure connectivity test failed:', error);

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