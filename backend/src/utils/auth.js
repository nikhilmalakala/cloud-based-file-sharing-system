const jwt = require('jsonwebtoken');

const SESSION_SECRET = process.env.SESSION_SECRET || 'cfs-app-secret-session-key-2026-secure-jwt';
const SESSION_EXPIRY = '7d';

/**
 * Creates a signed application session JWT for an authenticated user.
 */
function createSessionToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            name: user.name
        },
        SESSION_SECRET,
        {
            expiresIn: SESSION_EXPIRY,
            algorithm: 'HS256'
        }
    );
}

/**
 * Parses cookies from HTTP Request headers.
 */
function parseCookies(request) {
    const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie');
    if (!cookieHeader) return {};

    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length >= 2) {
            const name = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            cookies[name] = decodeURIComponent(value);
        }
    });
    return cookies;
}

/**
 * Builds the Set-Cookie response header string.
 */
function buildAuthCookieHeader(token, isLogout = false) {
    if (isLogout) {
        return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    }
    // 7 days in seconds = 604800
    return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

/**
 * Authenticates an incoming request using the application session token.
 * Accepts token via Authorization: Bearer <token> OR HttpOnly session cookie.
 * Returns { user } on success, or { errorResponse } on failure.
 */
async function authenticateRequest(request, context) {
    let token = null;

    // 1. Try Authorization header
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    }

    // 2. Try Cookie if header not found
    if (!token) {
        const cookies = parseCookies(request);
        if (cookies.session) {
            token = cookies.session;
        }
    }

    if (!token) {
        return {
            errorResponse: {
                status: 401,
                jsonBody: {
                    status: 'ERROR',
                    message: 'Authentication required. Please log in.'
                }
            }
        };
    }

    try {
        const payload = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });

        if (!payload || !payload.userId || !payload.email) {
            return {
                errorResponse: {
                    status: 401,
                    jsonBody: {
                        status: 'ERROR',
                        message: 'Invalid session payload.'
                    }
                }
            };
        }

        // Return user with authoritative application user ID
        const user = {
            id: payload.userId,
            oid: payload.userId, // Alias for backwards-compatibility with existing queries
            email: payload.email.toLowerCase(),
            name: payload.name || payload.email.split('@')[0]
        };

        return { user, errorResponse: null };

    } catch (err) {
        if (context && typeof context.warn === 'function') {
            context.warn('Session verification failed:', err.message);
        }

        return {
            errorResponse: {
                status: 401,
                jsonBody: {
                    status: 'ERROR',
                    message: 'Invalid or expired session. Please log in again.'
                }
            }
        };
    }
}

module.exports = {
    createSessionToken,
    authenticateRequest,
    buildAuthCookieHeader,
    parseCookies
};
