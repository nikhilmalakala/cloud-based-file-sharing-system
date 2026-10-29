/**
 * Cloud File Sharing — 2026 SaaS Frontend Application
 * Simple Application-Level Registration & Login System
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    // Backend API Base URL
    apiBaseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:7071/api'
        : 'https://nikhil-file-sharing-api-2026-dygwcghfexdzhpf3.centralindia-01.azurewebsites.net/api',
    // File Limits
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    totalStorageQuota: 10 * 1024 * 1024 * 1024 // 10 GB
};

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
    user: null, // { id, email, name }
    accessToken: sessionStorage.getItem('cfs_session_token') || null,
    activeView: 'dashboard',
    files: [],
    sharedFiles: [],
    notifications: [],
    notificationFilter: 'all',
    favorites: new Set(JSON.parse(localStorage.getItem('cfs_favorites') || '[]')),
    trash: [],
    filterType: 'all',
    filterQuery: '',
    sortBy: 'date-desc',
    viewMode: localStorage.getItem('cfs_view_mode') || 'grid',
    theme: localStorage.getItem('cfs_theme') || 'dark',
    selectedFileToUpload: null,
    activeModalFile: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initEventListeners();
    await initAuth();
});

// ============================================================================
// APPLICATION AUTHENTICATION
// ============================================================================

/**
 * Checks existing session on page load.
 */
async function initAuth() {
    try {
        const headers = {};
        if (state.accessToken) {
            headers['Authorization'] = `Bearer ${state.accessToken}`;
        }

        const response = await fetch(`${CONFIG.apiBaseUrl}/auth/me`, {
            method: 'GET',
            credentials: 'include',
            headers
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'OK' && data.user) {
                state.user = data.user;
                handleAuthenticatedState();
                return;
            }
        }

        // Not authenticated
        state.user = null;
        state.accessToken = null;
        sessionStorage.removeItem('cfs_session_token');
        showLandingCard();

    } catch (error) {
        console.warn('Auth check failed:', error);
        state.user = null;
        state.accessToken = null;
        sessionStorage.removeItem('cfs_session_token');
        showLandingCard();
    }
}

/**
 * Validates Gmail format.
 */
function isValidGmailAddress(email) {
    if (!email || typeof email !== 'string') return false;
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    return gmailRegex.test(email.trim());
}

/**
 * Subcard Navigation
 */
function showLandingCard() {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';

    document.getElementById('cardLanding').classList.add('active');
    document.getElementById('cardLogin').classList.remove('active');
    document.getElementById('cardRegister').classList.remove('active');
}

function showLoginCard() {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';

    document.getElementById('cardLogin').classList.add('active');
    document.getElementById('cardLanding').classList.remove('active');
    document.getElementById('cardRegister').classList.remove('active');

    hideAuthAlert('loginAlert');
    const pwd = document.getElementById('loginPassword');
    if (pwd) pwd.value = '';
    const emailInput = document.getElementById('loginEmail');
    if (emailInput && !emailInput.value) emailInput.focus();
    else if (pwd) pwd.focus();
}

function showRegisterCard() {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';

    document.getElementById('cardRegister').classList.add('active');
    document.getElementById('cardLanding').classList.remove('active');
    document.getElementById('cardLogin').classList.remove('active');

    hideAuthAlert('registerAlert');
    const emailInput = document.getElementById('registerEmail');
    if (emailInput) emailInput.focus();
}

function showAuthAlert(elementId, message, type = 'error') {
    const alertBox = document.getElementById(elementId);
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.className = `auth-alert auth-alert-${type}`;
    alertBox.style.display = 'block';
}

function hideAuthAlert(elementId) {
    const alertBox = document.getElementById(elementId);
    if (!alertBox) return;
    alertBox.textContent = '';
    alertBox.style.display = 'none';
}

/**
 * Handle Login Form Submission
 */
async function handleLogin(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    hideAuthAlert('loginAlert');

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('btnLoginSubmit');

    const email = (emailInput?.value || '').trim();
    const password = passwordInput?.value || '';

    // Validation
    if (!email) {
        showAuthAlert('loginAlert', 'Email is required.');
        emailInput?.focus();
        return;
    }

    if (!isValidGmailAddress(email)) {
        showAuthAlert('loginAlert', 'Please enter a valid Gmail address (ending in @gmail.com).');
        emailInput?.focus();
        return;
    }

    if (!password) {
        showAuthAlert('loginAlert', 'Password is required.');
        passwordInput?.focus();
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Logging in...</span>';
        }

        const response = await fetch(`${CONFIG.apiBaseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok && data.status === 'OK') {
            state.user = data.user;
            state.accessToken = data.token;
            sessionStorage.setItem('cfs_session_token', data.token);

            showToast(`Welcome back, ${state.user.name || state.user.email}!`, 'success');
            handleAuthenticatedState();

        } else if (response.status === 401) {
            // Requirement: "Invalid email or password." Do not reveal whether an email exists during authentication failure.
            showAuthAlert('loginAlert', 'Invalid email or password.', 'error');
            passwordInput?.focus();
        } else {
            showAuthAlert('loginAlert', data?.message || 'Server error occurred. Please try again.', 'error');
            passwordInput?.focus();
        }

    } catch (error) {
        console.error('Login error:', error);
        showAuthAlert('loginAlert', 'Connection error. Please ensure the backend is running.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Login</span>';
        }
    }
}

/**
 * Handle Registration Form Submission
 */
async function handleRegister(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    hideAuthAlert('registerAlert');

    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('registerConfirmPassword');
    const submitBtn = document.getElementById('btnRegisterSubmit');

    const email = (emailInput?.value || '').trim();
    const password = passwordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    // Validation
    if (!email) {
        showAuthAlert('registerAlert', 'Email is required.');
        emailInput?.focus();
        return;
    }

    if (!isValidGmailAddress(email)) {
        showAuthAlert('registerAlert', 'Accept Gmail addresses only (ending in @gmail.com).');
        emailInput?.focus();
        return;
    }

    if (!password) {
        showAuthAlert('registerAlert', 'Password is required.');
        passwordInput?.focus();
        return;
    }

    if (password.length < 8) {
        showAuthAlert('registerAlert', 'Password must be at least 8 characters long.');
        passwordInput?.focus();
        return;
    }

    if (password !== confirmPassword) {
        showAuthAlert('registerAlert', 'Confirm password must match password.');
        confirmPasswordInput?.focus();
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Creating Account...</span>';
        }

        const response = await fetch(`${CONFIG.apiBaseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password, confirmPassword })
        });

        const data = await response.json();

        if (response.status === 201 && data.status === 'OK') {
            // Requirement: After successful registration: "Account created successfully." Then redirect to Login.
            showAuthAlert('registerAlert', 'Account created successfully. Redirecting to login...', 'success');
            showToast('Account created successfully.', 'success');

            // Clear registration password inputs
            passwordInput.value = '';
            confirmPasswordInput.value = '';

            setTimeout(() => {
                showLoginCard();
                const loginEmailInput = document.getElementById('loginEmail');
                if (loginEmailInput) {
                    loginEmailInput.value = email;
                }
                const loginPasswordInput = document.getElementById('loginPassword');
                if (loginPasswordInput) {
                    loginPasswordInput.value = '';
                    loginPasswordInput.focus();
                }
            }, 1200);

        } else if (response.status === 409) {
            showAuthAlert('registerAlert', data.message || 'An account with this email address already exists.', 'error');
            emailInput?.focus();
        } else {
            showAuthAlert('registerAlert', data.message || 'Registration failed. Please check your inputs.', 'error');
        }

    } catch (error) {
        console.error('Registration error:', error);
        showAuthAlert('registerAlert', 'Connection error. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account</span>';
        }
    }
}

/**
 * Handle User Logout
 */
async function logout() {
    try {
        const headers = {};
        if (state.accessToken) {
            headers['Authorization'] = `Bearer ${state.accessToken}`;
        }

        await fetch(`${CONFIG.apiBaseUrl}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers
        });
    } catch (err) {
        console.warn('Logout API call failed:', err);
    }

    state.user = null;
    state.accessToken = null;
    sessionStorage.removeItem('cfs_session_token');
    state.files = [];
    state.sharedFiles = [];
    state.notifications = [];
    updateNotificationBadges();

    showLandingCard();
    showToast('Signed out successfully.', 'info');
}

/**
 * Update UI for authenticated state and load data
 */
function handleAuthenticatedState() {
    if (!state.user) return;

    // Requirement: Welcome, <user email>
    const userEmail = state.user.email;
    const userName = state.user.name || userEmail.split('@')[0];

    // Update UI Elements
    const greetingHeader = document.getElementById('greetingHeader');
    if (greetingHeader) {
        greetingHeader.textContent = `Welcome, ${userEmail}`;
    }

    const userNameSidebar = document.getElementById('userNameSidebar');
    if (userNameSidebar) {
        userNameSidebar.textContent = userName;
    }

    const userEmailSidebar = document.getElementById('userEmailSidebar');
    if (userEmailSidebar) {
        userEmailSidebar.textContent = userEmail;
    }

    const initials = userName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || userEmail[0].toUpperCase() || 'U';

    const userAvatarSidebar = document.getElementById('userAvatarSidebar');
    if (userAvatarSidebar) userAvatarSidebar.textContent = initials;

    const userAvatarHeader = document.getElementById('userAvatarHeader');
    if (userAvatarHeader) userAvatarHeader.textContent = initials;

    // Show App Shell, hide Login View
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';

    // Load initial data
    refreshAllData();
}

function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

// ============================================================================
// API CLIENT WITH AUTOMATIC APPLICATION AUTH
// ============================================================================
async function apiRequest(endpoint, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = state.accessToken || sessionStorage.getItem('cfs_session_token');
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const url = `${CONFIG.apiBaseUrl}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        credentials: 'include', // Sends HttpOnly session cookie
        headers
    });

    if (response.status === 401) {
        showToast('Your session has expired. Please log in again.', 'error');
        logout();
        throw new Error('Unauthorized');
    }

    return response;
}

// ============================================================================
// DATA FETCHING & SYNCHRONIZATION
// ============================================================================
async function refreshAllData() {
    loadNotifications();
    await Promise.all([
        loadMyFiles(),
        loadSharedFiles()
    ]);
    updateDashboardStats();
    updateStorageVisualization();
    renderActiveView();
}

async function loadMyFiles() {
    showLoadingSkeleton(true);
    try {
        const response = await apiRequest('/listFiles');
        const data = await response.json();

        if (response.ok && data.status === 'OK') {
            state.files = data.files || [];
            document.getElementById('badgeMyFiles').textContent = state.files.length;
        } else {
            throw new Error(data.message || 'Failed to load files');
        }
    } catch (err) {
        console.error('Failed to load my files:', err);
        showToast(`Failed to load files: ${err.message}`, 'error');
    } finally {
        showLoadingSkeleton(false);
    }
}

async function loadSharedFiles() {
    try {
        const response = await apiRequest('/shared-files');
        const data = await response.json();

        if (response.ok && data.status === 'OK') {
            state.sharedFiles = data.sharedFiles || [];
            document.getElementById('badgeShared').textContent = state.sharedFiles.length;

            // Automatically notify for incoming shared files
            state.sharedFiles.forEach(item => {
                const notifId = `shared_${item.fileId || item.id}`;
                if (!state.notifications.some(n => n.id === notifId)) {
                    addNotification({
                        id: notifId,
                        type: 'share',
                        title: 'File shared with you',
                        message: `${item.sharedByName || item.sharedBy} shared "${item.fileName}" with you.`,
                        timestamp: item.createdAt || new Date().toISOString(),
                        read: false,
                        fileId: item.fileId || item.id
                    });
                }
            });
        } else {
            throw new Error(data.message || 'Failed to load shared files');
        }
    } catch (err) {
        console.error('Failed to load shared files:', err);
    }
}

// ============================================================================
// DASHBOARD & STORAGE VISUALIZATION (Phase 10 & 11)
// ============================================================================
function updateDashboardStats() {
    // 1. Total Files
    document.getElementById('statTotalFiles').textContent = state.files.length;

    // 2. Storage Used
    const totalBytes = state.files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    document.getElementById('statStorageUsed').textContent = formatBytes(totalBytes);

    const percentUsed = Math.min(100, ((totalBytes / CONFIG.totalStorageQuota) * 100)).toFixed(1);
    document.getElementById('statStoragePercent').textContent = `${percentUsed}%`;

    // 3. Shared Files
    document.getElementById('statSharedFiles').textContent = state.sharedFiles.length;

    // 4. Recent Uploads (past 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentCount = state.files.filter(f => new Date(f.createdAt).getTime() >= sevenDaysAgo).length;
    document.getElementById('statRecentUploads').textContent = recentCount;

    // Sidebar Storage Mini Progress
    document.getElementById('sidebarStorageUsage').textContent = `${formatBytes(totalBytes)} / 10 GB`;
    document.getElementById('sidebarStorageBarFill').style.width = `${Math.max(percentUsed, 1)}%`;
    document.getElementById('sidebarStorageSub').textContent = `${percentUsed}% of quota used`;
}

function updateStorageVisualization() {
    const totalBytes = state.files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    document.getElementById('storageDetailedUsage').textContent = `${formatBytes(totalBytes)} / 10 GB`;

    let docsBytes = 0, docsCount = 0;
    let imgBytes = 0, imgCount = 0;
    let vidBytes = 0, vidCount = 0;
    let otherBytes = 0, otherCount = 0;

    state.files.forEach(f => {
        const cat = categorizeFile(f.fileName, f.contentType);
        const size = Number(f.size) || 0;
        if (cat === 'docs') { docsBytes += size; docsCount++; }
        else if (cat === 'images') { imgBytes += size; imgCount++; }
        else if (cat === 'videos') { vidBytes += size; vidCount++; }
        else { otherBytes += size; otherCount++; }
    });

    const denom = Math.max(totalBytes, 1);
    const pDocs = ((docsBytes / denom) * 100).toFixed(1);
    const pImages = ((imgBytes / denom) * 100).toFixed(1);
    const pVideos = ((vidBytes / denom) * 100).toFixed(1);
    const pOther = ((otherBytes / denom) * 100).toFixed(1);

    document.getElementById('barSegmentDocs').style.width = totalBytes ? `${pDocs}%` : '0%';
    document.getElementById('barSegmentImages').style.width = totalBytes ? `${pImages}%` : '0%';
    document.getElementById('barSegmentVideos').style.width = totalBytes ? `${pVideos}%` : '0%';
    document.getElementById('barSegmentOther').style.width = totalBytes ? `${pOther}%` : '0%';

    document.getElementById('legendDocsSize').textContent = `${formatBytes(docsBytes)} (${docsCount})`;
    document.getElementById('legendImagesSize').textContent = `${formatBytes(imgBytes)} (${imgCount})`;
    document.getElementById('legendVideosSize').textContent = `${formatBytes(vidBytes)} (${vidCount})`;
    document.getElementById('legendOtherSize').textContent = `${formatBytes(otherBytes)} (${otherCount})`;

    // Populate Dashboard Recent List
    renderDashboardRecentList();
}

function renderDashboardRecentList() {
    const container = document.getElementById('dashboardRecentList');
    container.innerHTML = '';

    const recent = [...state.files]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 4);

    if (recent.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                No recent activity. Upload a file to get started.
            </div>
        `;
        return;
    }

    recent.forEach(file => {
        container.appendChild(createFileCard(file));
    });
}

// ============================================================================
// FILE MANAGEMENT & RENDERING (Phase 12)
// ============================================================================
function renderActiveView() {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    // Highlight active nav
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === state.activeView);
    });

    // Toggle active state on header bell icon
    const btnNotif = document.getElementById('btnNotifications');
    if (btnNotif) {
        btnNotif.classList.toggle('active', state.activeView === 'notifications');
    }

    // Update breadcrumb
    const breadcrumbNames = {
        dashboard: 'Dashboard',
        myfiles: 'My Files',
        shared: 'Shared With Me',
        recent: 'Recent Files',
        favorites: 'Favorites',
        trash: 'Trash',
        notifications: 'Notifications'
    };
    document.getElementById('currentViewBreadcrumb').textContent = breadcrumbNames[state.activeView] || 'Workspace';

    if (state.activeView === 'dashboard') {
        document.getElementById('viewDashboard').classList.add('active');
        renderDashboardRecentList();
    } else if (state.activeView === 'myfiles') {
        document.getElementById('viewMyFiles').classList.add('active');
        renderMyFiles();
    } else if (state.activeView === 'shared') {
        document.getElementById('viewShared').classList.add('active');
        renderSharedFiles();
    } else if (state.activeView === 'recent') {
        document.getElementById('viewRecent').classList.add('active');
        renderRecentFiles();
    } else if (state.activeView === 'favorites') {
        document.getElementById('viewFavorites').classList.add('active');
        renderFavoritesFiles();
    } else if (state.activeView === 'trash') {
        document.getElementById('viewTrash').classList.add('active');
        renderTrashFiles();
    } else if (state.activeView === 'notifications') {
        document.getElementById('viewNotifications').classList.add('active');
        renderNotifications();
    }
}

function renderMyFiles() {
    let filtered = [...state.files];

    // Filter by Category
    if (state.filterType !== 'all') {
        filtered = filtered.filter(f => categorizeFile(f.fileName, f.contentType) === state.filterType);
    }

    // Filter by Search Query
    if (state.filterQuery) {
        const q = state.filterQuery.toLowerCase();
        filtered = filtered.filter(f => f.fileName.toLowerCase().includes(q));
    }

    // Sort
    filtered.sort((a, b) => {
        if (state.sortBy === 'date-desc') return new Date(b.createdAt) - new Date(a.createdAt);
        if (state.sortBy === 'date-asc') return new Date(a.createdAt) - new Date(b.createdAt);
        if (state.sortBy === 'name-asc') return a.fileName.localeCompare(b.fileName);
        if (state.sortBy === 'size-desc') return (Number(b.size) || 0) - (Number(a.size) || 0);
        return 0;
    });

    const gridContainer = document.getElementById('filesGrid');
    const tableWrap = document.getElementById('filesTableWrap');
    const tableBody = document.getElementById('filesTableBody');
    const emptyState = document.getElementById('filesEmptyState');

    if (filtered.length === 0) {
        gridContainer.style.display = 'none';
        tableWrap.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    if (state.viewMode === 'grid') {
        gridContainer.style.display = 'grid';
        tableWrap.style.display = 'none';
        gridContainer.innerHTML = '';
        filtered.forEach(file => gridContainer.appendChild(createFileCard(file)));
    } else {
        gridContainer.style.display = 'none';
        tableWrap.style.display = 'block';
        tableBody.innerHTML = '';
        filtered.forEach(file => tableBody.appendChild(createTableRow(file)));
    }
}

function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';

    const cat = categorizeFile(file.fileName, file.contentType);
    const iconClass = `type-${cat}`;
    const iconLabel = getCategoryLabel(cat);
    const isFavorite = state.favorites.has(file.id);

    card.innerHTML = `
        <div class="file-card-top">
            <div class="file-type-icon ${iconClass}">${iconLabel}</div>
            <button class="btn-file-action action-fav" title="${isFavorite ? 'Remove Favorite' : 'Add to Favorites'}" aria-label="Favorite">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="${isFavorite ? 'var(--color-warning)' : 'none'}" stroke="${isFavorite ? 'var(--color-warning)' : 'currentColor'}" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            </button>
        </div>

        <div class="file-card-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</div>
        <div class="file-card-meta">
            <span>${formatBytes(file.size)}</span>
            <span>&bull;</span>
            <span>${formatDate(file.createdAt)}</span>
        </div>

        <div class="file-card-actions">
            <button class="btn-file-action action-download" title="Download file" aria-label="Download">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
            <button class="btn-file-action action-share" title="Share file" aria-label="Share">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
            </button>
            <button class="btn-file-action action-details" title="File details" aria-label="Details">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            </button>
            <button class="btn-file-action action-delete" title="Delete file" aria-label="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </div>
    `;

    // Action Listeners
    card.querySelector('.action-fav').addEventListener('click', () => toggleFavorite(file.id));
    card.querySelector('.action-download').addEventListener('click', () => downloadFile(file.id, file.fileName));
    card.querySelector('.action-share').addEventListener('click', () => openShareModal(file));
    card.querySelector('.action-details').addEventListener('click', () => openDetailsModal(file));
    card.querySelector('.action-delete').addEventListener('click', () => openDeleteModal(file));

    return card;
}

function createTableRow(file) {
    const tr = document.createElement('tr');
    const cat = categorizeFile(file.fileName, file.contentType);

    tr.innerHTML = `
        <td>
            <div class="table-file-cell">
                <div class="file-type-icon type-${cat}" style="width: 32px; height: 32px; font-size: 10px;">${getCategoryLabel(cat)}</div>
                <div class="table-file-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</div>
            </div>
        </td>
        <td style="color: var(--text-secondary);">${escapeHtml(file.contentType || 'Binary')}</td>
        <td style="font-family: var(--font-mono); font-size: 12.5px;">${formatBytes(file.size)}</td>
        <td style="color: var(--text-muted); font-size: 12.5px;">${formatDate(file.createdAt)}</td>
        <td style="text-align: right;">
            <div style="display: inline-flex; gap: 4px;">
                <button class="btn-file-action action-download" title="Download">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
                <button class="btn-file-action action-share" title="Share">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="18" cy="5" r="3"/>
                        <circle cx="6" cy="12" r="3"/>
                        <circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                </button>
                <button class="btn-file-action action-details" title="Details">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                </button>
                <button class="btn-file-action action-delete" title="Delete">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </td>
    `;

    tr.querySelector('.action-download').addEventListener('click', () => downloadFile(file.id, file.fileName));
    tr.querySelector('.action-share').addEventListener('click', () => openShareModal(file));
    tr.querySelector('.action-details').addEventListener('click', () => openDetailsModal(file));
    tr.querySelector('.action-delete').addEventListener('click', () => openDeleteModal(file));

    return tr;
}

// ============================================================================
// SHARED WITH ME VIEW (Phase 15)
// ============================================================================
function renderSharedFiles() {
    const tableWrap = document.getElementById('sharedTableWrap');
    const tableBody = document.getElementById('sharedTableBody');
    const emptyState = document.getElementById('sharedEmptyState');

    if (state.sharedFiles.length === 0) {
        tableWrap.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    tableWrap.style.display = 'block';
    tableBody.innerHTML = '';

    state.sharedFiles.forEach(item => {
        const tr = document.createElement('tr');
        const cat = categorizeFile(item.fileName, item.contentType);

        tr.innerHTML = `
            <td>
                <div class="table-file-cell">
                    <div class="file-type-icon type-${cat}" style="width: 32px; height: 32px; font-size: 10px;">${getCategoryLabel(cat)}</div>
                    <div class="table-file-name" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</div>
                </div>
            </td>
            <td>
                <div style="font-weight: 500;">${escapeHtml(item.sharedByName || item.sharedBy || 'Unknown')}</div>
                <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(item.sharedBy || '')}</div>
            </td>
            <td style="color: var(--text-muted); font-size: 12.5px;">${formatDate(item.createdAt)}</td>
            <td>
                <span class="permission-badge">${escapeHtml(item.permission || 'Viewer')}</span>
            </td>
            <td style="text-align: right;">
                <button class="btn-primary" style="padding: 6px 14px; font-size: 12.5px;" title="Download shared file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span>Download</span>
                </button>
            </td>
        `;

        tr.querySelector('button').addEventListener('click', () => downloadFile(item.fileId, item.fileName));
        tableBody.appendChild(tr);
    });
}

// ============================================================================
// RECENT / FAVORITES / TRASH VIEWS
// ============================================================================
function renderRecentFiles() {
    const container = document.getElementById('recentFilesGrid');
    container.innerHTML = '';

    const recent = [...state.files]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 12);

    if (recent.length === 0) {
        container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><p>No files uploaded yet.</p></div>`;
        return;
    }
    recent.forEach(f => container.appendChild(createFileCard(f)));
}

function renderFavoritesFiles() {
    const container = document.getElementById('favoritesFilesGrid');
    container.innerHTML = '';

    const favs = state.files.filter(f => state.favorites.has(f.id));
    if (favs.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon-wrap">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </div>
                <h3 class="empty-title">No favorites pinned</h3>
                <p class="empty-subtitle">Star any file in My Files to pin it here for rapid access.</p>
            </div>
        `;
        return;
    }
    favs.forEach(f => container.appendChild(createFileCard(f)));
}

function renderTrashFiles() {
    const container = document.getElementById('trashFilesGrid');
    container.innerHTML = '';

    if (state.trash.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon-wrap">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </div>
                <h3 class="empty-title">Trash is empty</h3>
                <p class="empty-subtitle">Files deleted from Azure are permanently removed from Blob Storage.</p>
            </div>
        `;
        return;
    }

    state.trash.forEach(f => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-card-name">${escapeHtml(f.fileName)}</div>
            <div class="file-card-meta"><span>${formatBytes(f.size)}</span> &bull; <span>Deleted recently</span></div>
        `;
        container.appendChild(card);
    });
}

function toggleFavorite(fileId) {
    if (state.favorites.has(fileId)) {
        state.favorites.delete(fileId);
        showToast('Removed from favorites', 'info');
    } else {
        state.favorites.add(fileId);
        showToast('Added to favorites', 'success');
    }
    localStorage.setItem('cfs_favorites', JSON.stringify([...state.favorites]));
    renderActiveView();
}

// ============================================================================
// FILE UPLOAD (Phase 13)
// ============================================================================
function openUploadModal() {
    state.selectedFileToUpload = null;
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const box = document.getElementById('fileSelectedBox');
    if (box) box.style.display = 'none';
    const progress = document.getElementById('uploadProgressWrapper');
    if (progress) progress.style.display = 'none';
    const btnSubmit = document.getElementById('btnSubmitUpload');
    if (btnSubmit) btnSubmit.disabled = true;
    const modal = document.getElementById('uploadModal');
    if (modal) modal.showModal();
}

function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal && modal.open) {
        modal.close();
    }
}

function handleFileSelection(file) {
    if (!file) return;

    // Client-side Validation (Phase 13)
    if (file.size > CONFIG.maxFileSize) {
        showToast(`File "${file.name}" exceeds the 10 MB limit.`, 'error');
        return;
    }

    if (file.size === 0) {
        showToast(`File "${file.name}" is empty.`, 'error');
        return;
    }

    state.selectedFileToUpload = file;
    const nameEl = document.getElementById('selectedFileName');
    const sizeEl = document.getElementById('selectedFileSize');
    const boxEl = document.getElementById('fileSelectedBox');
    const btnSubmit = document.getElementById('btnSubmitUpload');

    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = formatBytes(file.size);
    if (boxEl) boxEl.style.display = 'flex';
    if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.focus();
    }

    showToast(`File selected: ${file.name} (${formatBytes(file.size)})`, 'info');
}

async function uploadSelectedFile() {
    if (!state.selectedFileToUpload) {
        showToast('Please choose a file to upload first.', 'warning');
        return;
    }

    const file = state.selectedFileToUpload;
    const progressWrapper = document.getElementById('uploadProgressWrapper');
    const progressBar = document.getElementById('uploadProgressBar');
    const statusText = document.getElementById('uploadStatusText');
    const percentText = document.getElementById('uploadPercentageText');
    const btnSubmit = document.getElementById('btnSubmitUpload');
    const btnCancel = document.getElementById('btnCancelUpload');

    if (progressWrapper) progressWrapper.style.display = 'block';
    if (btnSubmit) btnSubmit.disabled = true;
    if (btnCancel) btnCancel.disabled = true;

    // Simulated progress steps for smooth UX
    if (progressBar) progressBar.style.width = '25%';
    if (percentText) percentText.textContent = '25%';
    if (statusText) statusText.textContent = 'Transferring to Azure Blob Storage...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        setTimeout(() => {
            if (progressBar && progressWrapper.style.display !== 'none') {
                progressBar.style.width = '65%';
                if (percentText) percentText.textContent = '65%';
                if (statusText) statusText.textContent = 'Storing file metadata in Cosmos DB...';
            }
        }, 400);

        const response = await apiRequest('/uploadFile', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok || result.status !== 'OK') {
            throw new Error(result.message || 'Upload failed on server.');
        }

        if (progressBar) progressBar.style.width = '100%';
        if (percentText) percentText.textContent = '100%';
        if (statusText) statusText.textContent = 'Upload complete!';

        showToast(`"${file.name}" uploaded successfully!`, 'success');

        addNotification({
            type: 'upload',
            title: 'File uploaded successfully',
            message: `"${file.name}" (${formatBytes(file.size)}) was uploaded to Azure Blob Storage and Cosmos DB.`,
            fileId: result.file?.id
        });

        setTimeout(() => {
            closeUploadModal();
            if (btnCancel) btnCancel.disabled = false;
            refreshAllData();
        }, 500);

    } catch (error) {
        console.error('Upload error:', error);
        showToast(`Upload failed: ${error.message}`, 'error');
        if (statusText) statusText.textContent = `Upload failed: ${error.message}`;
        if (btnSubmit) btnSubmit.disabled = false;
        if (btnCancel) btnCancel.disabled = false;
    }
}

// ============================================================================
// FILE ACTIONS: DOWNLOAD, SHARE, DELETE, DETAILS (Phase 14, 17, 26)
// ============================================================================
async function downloadFile(fileId, fileName) {
    showToast(`Downloading "${fileName}"...`, 'info');

    try {
        const response = await apiRequest(`/files/${fileId}/download`);

        if (!response.ok) {
            let errorMsg = 'Download failed.';
            try {
                const errData = await response.json();
                errorMsg = errData.message || errorMsg;
            } catch (_) {}
            throw new Error(errorMsg);
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);

        showToast(`Downloaded "${fileName}" successfully.`, 'success');

    } catch (error) {
        console.error('Download error:', error);
        showToast(`Download failed: ${error.message}`, 'error');
    }
}

function openShareModal(file) {
    state.activeModalFile = file;
    document.getElementById('shareModalFileName').textContent = file.fileName;
    document.getElementById('shareEmailInput').value = '';
    document.getElementById('shareModal').showModal();
}

function closeShareModal() {
    document.getElementById('shareModal').close();
}

async function submitShare() {
    if (!state.activeModalFile) return;

    const emailInput = document.getElementById('shareEmailInput');
    const permissionSelect = document.getElementById('sharePermissionSelect');
    const recipient = emailInput.value.trim().toLowerCase();
    const permission = permissionSelect.value;

    if (!recipient) {
        showToast('Please enter a recipient email address.', 'error');
        return;
    }

    if (recipient === state.user.email.toLowerCase()) {
        showToast('You cannot share a file with yourself.', 'error');
        return;
    }

    const btnSubmit = document.getElementById('btnSubmitShare');
    btnSubmit.disabled = true;

    try {
        const response = await apiRequest(`/files/${state.activeModalFile.id}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sharedWith: recipient,
                permission
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Share operation failed.');
        }

        showToast(`File shared successfully with ${recipient}!`, 'success');

        addNotification({
            type: 'share',
            title: 'File shared successfully',
            message: `You shared "${state.activeModalFile.fileName}" with ${recipient} (${permission}).`,
            fileId: state.activeModalFile.id
        });

        closeShareModal();

    } catch (error) {
        console.error('Share error:', error);
        showToast(`Share failed: ${error.message}`, 'error');
    } finally {
        btnSubmit.disabled = false;
    }
}

function openDeleteModal(file) {
    state.activeModalFile = file;
    document.getElementById('deleteModalFileName').textContent = file.fileName;
    document.getElementById('deleteModal').showModal();
}

function closeDeleteModal() {
    document.getElementById('deleteModal').close();
}

async function confirmDelete() {
    if (!state.activeModalFile) return;

    const file = state.activeModalFile;
    const btnConfirm = document.getElementById('btnConfirmDelete');
    btnConfirm.disabled = true;

    try {
        const response = await apiRequest(`/files/${file.id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Deletion failed.');
        }

        // Add to session trash
        state.trash.unshift(file);

        showToast(`"${file.fileName}" deleted permanently.`, 'info');

        addNotification({
            type: 'delete',
            title: 'File deleted',
            message: `"${file.fileName}" was permanently deleted from Azure Blob Storage.`
        });

        closeDeleteModal();
        refreshAllData();

    } catch (error) {
        console.error('Delete error:', error);
        showToast(`Delete failed: ${error.message}`, 'error');
    } finally {
        btnConfirm.disabled = false;
    }
}

function openDetailsModal(file) {
    state.activeModalFile = file;
    document.getElementById('detailFileName').textContent = file.fileName;
    document.getElementById('detailFileSize').textContent = `${formatBytes(file.size)} (${Number(file.size).toLocaleString()} bytes)`;
    document.getElementById('detailContentType').textContent = file.contentType || 'application/octet-stream';
    document.getElementById('detailCreatedAt').textContent = formatDate(file.createdAt, true);
    document.getElementById('detailFileId').textContent = file.id;
    document.getElementById('detailOwner').textContent = file.ownerEmail || file.ownerId || 'You';
    document.getElementById('detailBlobName').textContent = file.blobName || `${file.id}-${file.fileName}`;

    document.getElementById('detailsModal').showModal();
}

function closeDetailsModal() {
    document.getElementById('detailsModal').close();
}

// ============================================================================
// COMMAND PALETTE / GLOBAL SEARCH (Phase 16)
// ============================================================================
function openCommandPalette() {
    const modal = document.getElementById('commandModal');
    const input = document.getElementById('commandSearchInput');
    input.value = '';
    renderCommandResults('');
    modal.showModal();
    input.focus();
}

function closeCommandPalette() {
    document.getElementById('commandModal').close();
}

function renderCommandResults(query) {
    const list = document.getElementById('commandResultsList');
    list.innerHTML = '';

    const q = query.trim().toLowerCase();

    // Default quick navigation commands
    const actions = [
        { label: 'Upload New File', icon: 'upload', action: () => { closeCommandPalette(); openUploadModal(); } },
        { label: 'Go to Dashboard', icon: 'grid', action: () => { closeCommandPalette(); switchView('dashboard'); } },
        { label: 'Go to My Files', icon: 'folder', action: () => { closeCommandPalette(); switchView('myfiles'); } },
        { label: 'Go to Shared With Me', icon: 'users', action: () => { closeCommandPalette(); switchView('shared'); } },
        { label: 'Toggle Light / Dark Theme', icon: 'sun', action: () => { closeCommandPalette(); toggleTheme(); } },
        { label: 'Refresh All Files', icon: 'refresh', action: () => { closeCommandPalette(); refreshAllData(); } },
        { label: 'Sign Out', icon: 'logout', action: () => { closeCommandPalette(); logout(); } }
    ];

    const matchingActions = actions.filter(a => !q || a.label.toLowerCase().includes(q));

    matchingActions.forEach(item => {
        const div = document.createElement('div');
        div.className = 'command-item';
        div.innerHTML = `
            <span>&bull;</span>
            <span style="font-weight: 500;">${item.label}</span>
            <span class="command-item-badge">Action</span>
        `;
        div.addEventListener('click', item.action);
        list.appendChild(div);
    });

    // Matching Personal Files
    const matchingFiles = state.files.filter(f => !q || f.fileName.toLowerCase().includes(q));
    matchingFiles.slice(0, 8).forEach(f => {
        const div = document.createElement('div');
        div.className = 'command-item';
        div.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            </svg>
            <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.fileName)}</span>
            <span class="command-item-badge">${formatBytes(f.size)}</span>
        `;
        div.addEventListener('click', () => {
            closeCommandPalette();
            openDetailsModal(f);
        });
        list.appendChild(div);
    });
}

// ============================================================================
// THEME MANAGEMENT (Phase 21)
// ============================================================================
function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('cfs_theme', state.theme);
    showToast(`Switched to ${state.theme} mode`, 'info');
}

// ============================================================================
// TOAST NOTIFICATION ENGINE (Phase 18)
// ============================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
        <span class="toast-icon">${iconSvg}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 200);
    });

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 200);
        }
    }, 4500);
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================
function formatBytes(bytes) {
    const num = Number(bytes) || 0;
    if (num === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return `${(num / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDate(isoString, includeTime = false) {
    if (!isoString) return 'Unknown';
    try {
        const d = new Date(isoString);
        if (includeTime) {
            return d.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }
        return d.toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    } catch (_) {
        return isoString;
    }
}

function formatRelativeTime(isoString) {
    if (!isoString) return '';
    try {
        const diffMs = Date.now() - new Date(isoString).getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        if (diffSecs < 60) return 'Just now';
        const diffMins = Math.floor(diffSecs / 60);
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatDate(isoString, false);
    } catch (_) {
        return formatDate(isoString, false);
    }
}

function categorizeFile(filename = '', contentType = '') {
    const ext = filename.split('.').pop().toLowerCase();
    const mime = (contentType || '').toLowerCase();

    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'md'].includes(ext) || mime.includes('text') || mime.includes('pdf')) {
        return 'docs';
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff'].includes(ext) || mime.includes('image')) {
        return 'images';
    }
    if (['mp4', 'mkv', 'mov', 'avi', 'mp3', 'wav', 'flac', 'ogg', 'webm'].includes(ext) || mime.includes('video') || mime.includes('audio')) {
        return 'videos';
    }
    if (['zip', 'rar', 'tar', 'gz', '7z', 'bz2'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
        return 'archives';
    }
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'sql'].includes(ext)) {
        return 'code';
    }
    return 'other';
}

function getCategoryLabel(cat) {
    const labels = {
        docs: 'DOC',
        images: 'IMG',
        videos: 'MED',
        archives: 'ZIP',
        code: 'DEV',
        other: 'FILE'
    };
    return labels[cat] || 'FILE';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function switchView(viewName) {
    state.activeView = viewName;
    renderActiveView();

    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

function showLoadingSkeleton(loading) {
    const skeleton = document.getElementById('filesSkeleton');
    const grid = document.getElementById('filesGrid');
    if (skeleton && grid) {
        skeleton.style.display = loading ? 'grid' : 'none';
        if (loading) grid.style.display = 'none';
    }
}

// ============================================================================
// NOTIFICATIONS SYSTEM
// ============================================================================
function getNotifStorageKey() {
    return 'cfs_notifications_' + (state.user?.id || 'guest');
}

function loadNotifications() {
    try {
        const raw = localStorage.getItem(getNotifStorageKey());
        if (raw) {
            state.notifications = JSON.parse(raw) || [];
        } else {
            // Seed initial notifications for a welcoming experience
            state.notifications = [
                {
                    id: 'notif_welcome',
                    type: 'system',
                    title: 'Welcome to Cloud File Sharing',
                    message: `Your account (${state.user?.email || 'User'}) is active. Upload, share, and manage files securely with Azure.`,
                    timestamp: state.user?.createdAt || new Date().toISOString(),
                    read: false
                },
                {
                    id: 'notif_connected',
                    type: 'system',
                    title: 'Cloud Infrastructure Connected',
                    message: 'Connected to Azure Blob Storage (files container) and Cosmos DB (Files & Users containers).',
                    timestamp: new Date().toISOString(),
                    read: false
                }
            ];
            saveNotifications();
        }
    } catch (e) {
        console.warn('Failed to load notifications:', e);
        state.notifications = [];
    }
    updateNotificationBadges();
    if (state.activeView === 'notifications') {
        renderNotifications();
    }
}

function saveNotifications() {
    try {
        localStorage.setItem(getNotifStorageKey(), JSON.stringify(state.notifications));
    } catch (e) {
        console.warn('Failed to save notifications:', e);
    }
    updateNotificationBadges();
}

function addNotification({ id, type, title, message, fileId, timestamp, read = false }) {
    const notif = {
        id: id || ('notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
        type: type || 'system',
        title: title || 'Notification',
        message: message || '',
        timestamp: timestamp || new Date().toISOString(),
        read: !!read,
        fileId: fileId || null
    };

    // Prevent duplicate notification IDs
    if (!state.notifications.some(n => n.id === notif.id)) {
        state.notifications.unshift(notif);
        if (state.notifications.length > 60) {
            state.notifications = state.notifications.slice(0, 60);
        }
        saveNotifications();
        if (state.activeView === 'notifications') {
            renderNotifications();
        }
    }
}

function updateNotificationBadges() {
    const unreadCount = state.notifications.filter(n => !n.read).length;

    // Header notification bell dot
    const headerDot = document.getElementById('headerNotificationDot');
    if (headerDot) {
        headerDot.style.display = unreadCount > 0 ? 'block' : 'none';
        headerDot.classList.toggle('pulse', unreadCount > 0);
    }

    // Sidebar navigation badge
    const sidebarBadge = document.getElementById('badgeNotifications');
    if (sidebarBadge) {
        sidebarBadge.textContent = unreadCount;
        sidebarBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }

    // Filter counts on notifications page
    const countAll = document.getElementById('notifCountAll');
    if (countAll) countAll.textContent = state.notifications.length;

    const countUploads = document.getElementById('notifCountUploads');
    if (countUploads) countUploads.textContent = state.notifications.filter(n => n.type === 'upload').length;

    const countShares = document.getElementById('notifCountShares');
    if (countShares) countShares.textContent = state.notifications.filter(n => n.type === 'share').length;

    const countSystem = document.getElementById('notifCountSystem');
    if (countSystem) countSystem.textContent = state.notifications.filter(n => n.type === 'system' || n.type === 'delete').length;
}

function markAllNotificationsRead() {
    state.notifications.forEach(n => { n.read = true; });
    saveNotifications();
    renderNotifications();
    showToast('All notifications marked as read.', 'success');
}

function clearAllNotifications() {
    state.notifications = [];
    saveNotifications();
    renderNotifications();
    showToast('All notifications cleared.', 'info');
}

function markNotificationRead(id) {
    const notif = state.notifications.find(n => n.id === id);
    if (notif && !notif.read) {
        notif.read = true;
        saveNotifications();
        renderNotifications();
    }
}

function deleteNotification(id) {
    state.notifications = state.notifications.filter(n => n.id !== id);
    saveNotifications();
    renderNotifications();
}

function renderNotifications() {
    const feed = document.getElementById('notificationsFeed');
    const empty = document.getElementById('notificationsEmptyState');
    if (!feed || !empty) return;

    let items = [...state.notifications];

    if (state.notificationFilter === 'upload') {
        items = items.filter(n => n.type === 'upload');
    } else if (state.notificationFilter === 'share') {
        items = items.filter(n => n.type === 'share');
    } else if (state.notificationFilter === 'system') {
        items = items.filter(n => n.type === 'system' || n.type === 'delete');
    }

    updateNotificationBadges();

    if (items.length === 0) {
        feed.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    feed.style.display = 'flex';
    feed.innerHTML = '';

    items.forEach(notif => {
        const card = document.createElement('div');
        card.className = `notification-card ${notif.read ? 'read' : 'unread'}`;

        let iconSvg = '';
        let iconClass = 'notif-icon-system';

        if (notif.type === 'upload') {
            iconClass = 'notif-icon-upload';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>`;
        } else if (notif.type === 'share') {
            const isIncoming = notif.title && notif.title.toLowerCase().includes('with you');
            iconClass = isIncoming ? 'notif-icon-shared-with-me' : 'notif-icon-share';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>`;
        } else if (notif.type === 'delete') {
            iconClass = 'notif-icon-delete';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>`;
        } else {
            iconClass = 'notif-icon-system';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>`;
        }

        let actionBtnHtml = '';
        if (notif.type === 'upload' || (notif.type === 'share' && !notif.title.toLowerCase().includes('with you'))) {
            actionBtnHtml = `<button class="btn-notif-action action-view-files" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span>View in My Files</span>
            </button>`;
        } else if (notif.type === 'share' && notif.title.toLowerCase().includes('with you')) {
            actionBtnHtml = `<button class="btn-notif-action action-view-shared" type="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <span>View in Shared Files</span>
            </button>`;
        }

        card.innerHTML = `
            <div class="notif-icon-box ${iconClass}">
                ${iconSvg}
            </div>
            <div class="notif-content">
                <div class="notif-header-line">
                    <span class="notif-title">${escapeHtml(notif.title)}</span>
                    ${!notif.read ? '<span class="notif-unread-dot" title="Unread"></span>' : ''}
                    <span class="notif-time">${formatRelativeTime(notif.timestamp)}</span>
                </div>
                <div class="notif-message">${escapeHtml(notif.message)}</div>
                <div class="notif-footer-actions">
                    ${actionBtnHtml}
                    ${!notif.read ? `<button class="btn-notif-action action-mark-read" type="button">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span>Mark read</span>
                    </button>` : ''}
                    <button class="btn-notif-dismiss" title="Dismiss notification" aria-label="Dismiss notification">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
        `;

        const btnViewFiles = card.querySelector('.action-view-files');
        if (btnViewFiles) {
            btnViewFiles.addEventListener('click', (e) => {
                e.stopPropagation();
                markNotificationRead(notif.id);
                switchView('myfiles');
            });
        }

        const btnViewShared = card.querySelector('.action-view-shared');
        if (btnViewShared) {
            btnViewShared.addEventListener('click', (e) => {
                e.stopPropagation();
                markNotificationRead(notif.id);
                switchView('shared');
            });
        }

        const btnMarkRead = card.querySelector('.action-mark-read');
        if (btnMarkRead) {
            btnMarkRead.addEventListener('click', (e) => {
                e.stopPropagation();
                markNotificationRead(notif.id);
            });
        }

        const btnDismiss = card.querySelector('.btn-notif-dismiss');
        if (btnDismiss) {
            btnDismiss.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNotification(notif.id);
            });
        }

        card.addEventListener('click', () => {
            if (!notif.read) {
                markNotificationRead(notif.id);
            }
        });

        feed.appendChild(card);
    });
}

// ============================================================================
// EVENT LISTENERS BINDING
// ============================================================================
function initEventListeners() {
    // Application Auth Triggers & Form Submissions
    const btnShowLogin = document.getElementById('btnShowLogin');
    if (btnShowLogin) btnShowLogin.addEventListener('click', showLoginCard);

    const btnShowRegister = document.getElementById('btnShowRegister');
    if (btnShowRegister) btnShowRegister.addEventListener('click', showRegisterCard);

    const btnGoToRegister = document.getElementById('btnGoToRegister');
    if (btnGoToRegister) btnGoToRegister.addEventListener('click', showRegisterCard);

    const btnGoToLogin = document.getElementById('btnGoToLogin');
    if (btnGoToLogin) btnGoToLogin.addEventListener('click', showLoginCard);

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const btnSidebarLogout = document.getElementById('btnSidebarLogout');
    if (btnSidebarLogout) btnSidebarLogout.addEventListener('click', logout);

    const btnHeaderLogout = document.getElementById('btnHeaderLogout');
    if (btnHeaderLogout) btnHeaderLogout.addEventListener('click', logout);

    // Navigation Switching
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // View All Files CTA
    document.getElementById('btnViewAllFiles').addEventListener('click', () => switchView('myfiles'));

    // Upload Triggers
    document.getElementById('btnHeaderUpload').addEventListener('click', openUploadModal);
    document.getElementById('btnDashboardUpload').addEventListener('click', openUploadModal);
    document.getElementById('btnMyFilesUpload').addEventListener('click', openUploadModal);
    document.getElementById('btnEmptyUploadCTA').addEventListener('click', openUploadModal);

    // Refresh Triggers
    document.getElementById('btnDashboardRefresh').addEventListener('click', refreshAllData);
    document.getElementById('btnRefreshFiles').addEventListener('click', refreshAllData);
    document.getElementById('btnRefreshShared').addEventListener('click', refreshAllData);

    // Theme Toggle
    document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);

    // Notification Header Bell Button
    const btnNotifications = document.getElementById('btnNotifications');
    if (btnNotifications) {
        btnNotifications.addEventListener('click', () => switchView('notifications'));
    }

    // Notification Action Buttons
    const btnMarkAllNotifs = document.getElementById('btnMarkAllNotificationsRead');
    if (btnMarkAllNotifs) {
        btnMarkAllNotifs.addEventListener('click', markAllNotificationsRead);
    }

    const btnClearAllNotifs = document.getElementById('btnClearAllNotifications');
    if (btnClearAllNotifs) {
        btnClearAllNotifs.addEventListener('click', clearAllNotifications);
    }

    // Notification Filter Tabs
    document.querySelectorAll('[data-notif-filter]').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('[data-notif-filter]').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.notificationFilter = pill.dataset.notifFilter;
            renderNotifications();
        });
    });

    // Sidebar Mobile Drawer Toggle
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    document.getElementById('btnSidebarToggle').addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });

    // Command Palette / Global Search
    document.getElementById('btnOpenSearch').addEventListener('click', openCommandPalette);
    document.getElementById('commandSearchInput').addEventListener('input', (e) => {
        renderCommandResults(e.target.value);
    });

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const modal = document.getElementById('commandModal');
            if (modal.open) {
                closeCommandPalette();
            } else {
                openCommandPalette();
            }
        }
    });

    // Filter Pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.filterType = pill.dataset.filter;
            renderMyFiles();
        });
    });

    // Search Input within My Files
    document.getElementById('filterFilesInput').addEventListener('input', (e) => {
        state.filterQuery = e.target.value.trim();
        renderMyFiles();
    });

    // Sort Dropdown
    document.getElementById('sortFilesSelect').addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderMyFiles();
    });

    // View Mode Toggle (Grid vs List)
    const btnGrid = document.getElementById('btnViewGrid');
    const btnList = document.getElementById('btnViewList');

    btnGrid.addEventListener('click', () => {
        state.viewMode = 'grid';
        btnGrid.classList.add('active');
        btnList.classList.remove('active');
        localStorage.setItem('cfs_view_mode', 'grid');
        renderMyFiles();
    });

    btnList.addEventListener('click', () => {
        state.viewMode = 'list';
        btnList.classList.add('active');
        btnGrid.classList.remove('active');
        localStorage.setItem('cfs_view_mode', 'list');
        renderMyFiles();
    });

    // Set initial active state on view mode buttons
    if (state.viewMode === 'list') {
        btnList.classList.add('active');
        btnGrid.classList.remove('active');
    }

    // Modal Close Buttons
    document.getElementById('btnCloseUploadModal').addEventListener('click', closeUploadModal);
    document.getElementById('btnCancelUpload').addEventListener('click', closeUploadModal);

    document.getElementById('btnCloseShareModal').addEventListener('click', closeShareModal);
    document.getElementById('btnCancelShare').addEventListener('click', closeShareModal);
    document.getElementById('btnSubmitShare').addEventListener('click', submitShare);

    document.getElementById('btnCloseDeleteModal').addEventListener('click', closeDeleteModal);
    document.getElementById('btnCancelDelete').addEventListener('click', closeDeleteModal);
    document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);

    document.getElementById('btnCloseDetailsModal').addEventListener('click', closeDetailsModal);
    document.getElementById('btnCloseDetails').addEventListener('click', closeDetailsModal);
    document.getElementById('btnDetailsDownload').addEventListener('click', () => {
        if (state.activeModalFile) {
            downloadFile(state.activeModalFile.id, state.activeModalFile.fileName);
        }
    });

    // Prevent default browser behavior on entire window for drag/drop
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // Upload Dropzone Handlers (Phase 13)
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');
    const btnBrowseFile = document.getElementById('btnBrowseFile');

    if (btnBrowseFile && fileInput) {
        btnBrowseFile.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.value = '';
            fileInput.click();
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', (e) => {
            if (!btnBrowseFile || (e.target !== btnBrowseFile && !btnBrowseFile.contains(e.target))) {
                fileInput.value = '';
                fileInput.click();
            }
        });

        // Drag and Drop Events
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-active');
            });
        });

        ['dragleave'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-active');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-active');
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                handleFileSelection(dt.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleFileSelection(e.target.files[0]);
            }
        });
    }

    document.getElementById('btnClearSelectedFile').addEventListener('click', () => {
        state.selectedFileToUpload = null;
        if (fileInput) fileInput.value = '';
        document.getElementById('fileSelectedBox').style.display = 'none';
        document.getElementById('btnSubmitUpload').disabled = true;
    });

    document.getElementById('btnSubmitUpload').addEventListener('click', uploadSelectedFile);

    // Close Modals on Backdrop Click (only when clicking the backdrop itself, e.target === diag)
    document.querySelectorAll('dialog').forEach(diag => {
        diag.addEventListener('click', (e) => {
            if (e.target === diag) {
                diag.close();
            }
        });
    });
}
