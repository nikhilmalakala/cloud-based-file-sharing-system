const { app } = require('@azure/functions');
const {
    isValidGmail,
    normalizeEmail,
    findUserByEmail,
    createUser,
    verifyPassword
} = require('../utils/userStore');
const {
    createSessionToken,
    authenticateRequest,
    buildAuthCookieHeader
} = require('../utils/auth');

const MIN_PASSWORD_LENGTH = 8;

/**
 * Helper to build standard JSON responses with optional headers.
 */
function createResponse(status, jsonBody, headers = {}) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        jsonBody
    };
}

// ============================================================================
// POST /api/auth/register
// ============================================================================
app.http('authRegister', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/register',

    handler: async (request, context) => {
        try {
            let body = {};
            try {
                body = await request.json();
            } catch (err) {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Invalid JSON request body.'
                });
            }

            const { email, password, confirmPassword } = body;

            // 1. Validate Email Presence & Format
            if (!email || typeof email !== 'string' || !email.trim()) {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Email address is required.'
                });
            }

            const normalizedEmail = normalizeEmail(email);

            if (!isValidGmail(normalizedEmail)) {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Please provide a valid Gmail address (ending in @gmail.com).'
                });
            }

            // 2. Validate Password
            if (!password || typeof password !== 'string') {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Password is required.'
                });
            }

            if (password.length < MIN_PASSWORD_LENGTH) {
                return createResponse(400, {
                    status: 'ERROR',
                    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
                });
            }

            // 3. Validate Confirm Password
            if (password !== confirmPassword) {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Password and Confirm Password do not match.'
                });
            }

            // 4. Check for duplicate email
            const existingUser = await findUserByEmail(normalizedEmail);
            if (existingUser) {
                return createResponse(409, {
                    status: 'ERROR',
                    message: 'An account with this email address already exists.'
                });
            }

            // 5. Create user with hashed password (password is never stored plaintext or logged)
            const newUser = await createUser({
                email: normalizedEmail,
                password,
                name: normalizedEmail.split('@')[0]
            });

            context.log(`User registered successfully: ${normalizedEmail} (ID: ${newUser.id})`);

            return createResponse(201, {
                status: 'OK',
                message: 'Account created successfully.',
                user: {
                    id: newUser.id,
                    email: newUser.email,
                    name: newUser.name
                }
            });

        } catch (error) {
            context.error('Registration error:', error.message);
            return createResponse(500, {
                status: 'ERROR',
                message: 'An unexpected error occurred during registration. Please try again.'
            });
        }
    }
});

// ============================================================================
// POST /api/auth/login
// ============================================================================
app.http('authLogin', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/login',

    handler: async (request, context) => {
        try {
            let body = {};
            try {
                body = await request.json();
            } catch (err) {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Invalid JSON request body.'
                });
            }

            const { email, password } = body;

            // Basic presence check
            if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
                return createResponse(400, {
                    status: 'ERROR',
                    message: 'Email and password are required.'
                });
            }

            const normalizedEmail = normalizeEmail(email);

            // Look up user by email
            const user = await findUserByEmail(normalizedEmail);

            // Generic error message if user not found (do not reveal if user exists)
            if (!user) {
                return createResponse(401, {
                    status: 'ERROR',
                    message: 'Invalid email or password.'
                });
            }

            // Verify password hash
            const isMatch = await verifyPassword(password, user.passwordHash);
            if (!isMatch) {
                return createResponse(401, {
                    status: 'ERROR',
                    message: 'Invalid email or password.'
                });
            }

            // Build session token
            const safeUser = {
                id: user.id,
                email: user.email,
                name: user.name || user.email.split('@')[0]
            };

            const sessionToken = createSessionToken(safeUser);
            const cookieHeader = buildAuthCookieHeader(sessionToken, false);

            context.log(`User logged in successfully: ${user.email} (ID: ${user.id})`);

            return createResponse(
                200,
                {
                    status: 'OK',
                    message: 'Login successful.',
                    token: sessionToken,
                    user: safeUser
                },
                {
                    'Set-Cookie': cookieHeader
                }
            );

        } catch (error) {
            context.error('Login error:', error.message);
            return createResponse(500, {
                status: 'ERROR',
                message: 'An error occurred during login. Please try again.'
            });
        }
    }
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================
app.http('authLogout', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/logout',

    handler: async (request, context) => {
        try {
            const clearCookie = buildAuthCookieHeader(null, true);
            return createResponse(
                200,
                {
                    status: 'OK',
                    message: 'Logged out successfully.'
                },
                {
                    'Set-Cookie': clearCookie
                }
            );
        } catch (error) {
            context.error('Logout error:', error.message);
            return createResponse(500, {
                status: 'ERROR',
                message: 'An error occurred during logout.'
            });
        }
    }
});

// ============================================================================
// GET /api/auth/me
// ============================================================================
app.http('authMe', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'auth/me',

    handler: async (request, context) => {
        try {
            const { user, errorResponse } = await authenticateRequest(request, context);
            if (errorResponse) {
                return errorResponse;
            }

            return createResponse(200, {
                status: 'OK',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name
                }
            });
        } catch (error) {
            context.error('Get current user error:', error.message);
            return createResponse(500, {
                status: 'ERROR',
                message: 'Failed to retrieve current user session.'
            });
        }
    }
});
