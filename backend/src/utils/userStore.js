const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

let cachedContainer = null;

function getUsersContainer() {
    if (cachedContainer) {
        return cachedContainer;
    }

    const credential = new DefaultAzureCredential();
    const endpoint = process.env.COSMOS_DB_ENDPOINT || 'https://nikhilfilesdb2026.documents.azure.com:443/';
    const databaseName = process.env.COSMOS_DB_DATABASE || 'FileSharingDB';
    const containerName = process.env.COSMOS_DB_USERS_CONTAINER || 'Users';

    const cosmosClient = new CosmosClient({
        endpoint,
        aadCredentials: credential
    });

    const database = cosmosClient.database(databaseName);
    cachedContainer = database.container(containerName);
    return cachedContainer;
}

/**
 * Normalizes email address to trimmed lowercase.
 */
function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
}

/**
 * Validates whether the email is a valid Gmail address.
 */
function isValidGmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = normalizeEmail(email);
    // Standard Gmail format validation: alphanumeric and dots/plus before @gmail.com
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    return gmailRegex.test(normalized);
}

/**
 * Finds user document by email.
 */
async function findUserByEmail(email) {
    const normalized = normalizeEmail(email);
    const container = getUsersContainer();

    const querySpec = {
        query: 'SELECT TOP 1 * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: normalized }]
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    return resources.length > 0 ? resources[0] : null;
}

/**
 * Finds user document by ID.
 */
async function findUserById(id) {
    if (!id) return null;
    const container = getUsersContainer();

    try {
        const { resource } = await container.item(id, id).read();
        return resource || null;
    } catch (err) {
        if (err.code === 404) return null;
        // Fallback to query
        const querySpec = {
            query: 'SELECT TOP 1 * FROM c WHERE c.id = @id',
            parameters: [{ name: '@id', value: id }]
        };
        const { resources } = await container.items.query(querySpec).fetchAll();
        return resources.length > 0 ? resources[0] : null;
    }
}

/**
 * Creates a new user in Cosmos DB with hashed password.
 */
async function createUser({ email, password, name }) {
    const normalized = normalizeEmail(email);
    const existing = await findUserByEmail(normalized);
    if (existing) {
        const err = new Error('An account with this email address already exists.');
        err.code = 'EMAIL_EXISTS';
        throw err;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userId = crypto.randomUUID();
    const displayName = name && name.trim() ? name.trim() : normalized.split('@')[0];

    const userDoc = {
        id: userId,
        type: 'user',
        email: normalized,
        passwordHash,
        name: displayName,
        createdAt: new Date().toISOString()
    };

    const container = getUsersContainer();
    const { resource } = await container.items.create(userDoc);

    // Return safe user object without passwordHash
    return {
        id: resource.id,
        email: resource.email,
        name: resource.name,
        createdAt: resource.createdAt
    };
}

/**
 * Verifies password against stored hash.
 */
async function verifyPassword(plainPassword, passwordHash) {
    if (!plainPassword || !passwordHash) return false;
    return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = {
    normalizeEmail,
    isValidGmail,
    findUserByEmail,
    findUserById,
    createUser,
    verifyPassword
};
