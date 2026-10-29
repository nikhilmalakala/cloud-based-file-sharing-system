const { app } = require('@azure/functions');

app.http('health', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return {
            status: 200,
            jsonBody: {
                status: 'OK',
                service: 'Cloud File Sharing API',
                timestamp: new Date().toISOString()
            }
        };
    }
});