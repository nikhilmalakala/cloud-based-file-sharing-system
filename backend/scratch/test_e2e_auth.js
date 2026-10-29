const { DefaultAzureCredential } = require('@azure/identity');
const { CosmosClient } = require('@azure/cosmos');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:7071/api';

async function runTests() {
    console.log('====================================================');
    console.log('STARTING END-TO-END VERIFICATION OF NEW AUTH SYSTEM');
    console.log('====================================================\n');

    // 16. Verify protected APIs reject unauthenticated requests
    console.log('[Test 16] Verify protected APIs reject unauthenticated requests:');
    const unauthListRes = await fetch(`${BASE_URL}/listFiles`);
    console.log(`  GET /api/listFiles unauthenticated status: ${unauthListRes.status} (expected 401)`);
    if (unauthListRes.status !== 401) throw new Error('Unauthenticated request was not rejected!');

    const unauthUploadRes = await fetch(`${BASE_URL}/uploadFile`, { method: 'POST' });
    console.log(`  POST /api/uploadFile unauthenticated status: ${unauthUploadRes.status} (expected 401)`);
    if (unauthUploadRes.status !== 401) throw new Error('Unauthenticated upload was not rejected!');

    const unauthSharedRes = await fetch(`${BASE_URL}/shared-files`);
    console.log(`  GET /api/shared-files unauthenticated status: ${unauthSharedRes.status} (expected 401)`);
    if (unauthSharedRes.status !== 401) throw new Error('Unauthenticated shared-files was not rejected!');
    console.log('  PASSED: Protected APIs reject unauthenticated callers.\n');

    // 1. Create a new Gmail account in the application
    console.log('[Test 1] Create User 1 (Alice):');
    const user1Email = `alice.${Date.now()}@gmail.com`;
    const user1Password = 'Password123!';

    // Test rejection of non-gmail
    const nonGmailRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@outlook.com', password: user1Password, confirmPassword: user1Password })
    });
    console.log(`  Non-Gmail rejection test: status ${nonGmailRes.status} (expected 400)`);
    if (nonGmailRes.status !== 400) throw new Error('Non-Gmail email was not rejected!');

    // Test password mismatch
    const mismatchRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user1Email, password: user1Password, confirmPassword: 'DifferentPassword' })
    });
    console.log(`  Password mismatch test: status ${mismatchRes.status} (expected 400)`);
    if (mismatchRes.status !== 400) throw new Error('Password mismatch was not rejected!');

    // Valid registration
    const regRes1 = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user1Email, password: user1Password, confirmPassword: user1Password })
    });
    const regData1 = await regRes1.json();
    console.log(`  User 1 registered: status ${regRes1.status}, ID: ${regData1.user.id}, email: ${regData1.user.email}`);
    if (regRes1.status !== 201) throw new Error(`User 1 registration failed: ${JSON.stringify(regData1)}`);
    console.log('  PASSED: User 1 created successfully.\n');

    // Test duplicate email rejection
    console.log('  Checking duplicate email rejection:');
    const dupRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user1Email, password: user1Password, confirmPassword: user1Password })
    });
    console.log(`  Duplicate registration status: ${dupRes.status} (expected 409)`);
    if (dupRes.status !== 409) throw new Error('Duplicate email was not rejected!');
    console.log('  PASSED: Duplicate email correctly rejected with 409.\n');

    // 2. Verify password is hashed in Cosmos DB
    console.log('[Test 2] Verify password is securely hashed in Cosmos DB:');
    const credential = new DefaultAzureCredential();
    const cosmosClient = new CosmosClient({
        endpoint: 'https://nikhilfilesdb2026.documents.azure.com:443/',
        aadCredentials: credential
    });
    const db = cosmosClient.database('FileSharingDB');
    const usersContainer = db.container('Users');
    const { resource: dbUser } = await usersContainer.item(regData1.user.id, regData1.user.id).read();

    console.log(`  Cosmos DB user record found: ID=${dbUser.id}, email=${dbUser.email}`);
    console.log(`  Stored passwordHash starts with: ${dbUser.passwordHash.substring(0, 10)}... (length: ${dbUser.passwordHash.length})`);
    if (!dbUser.passwordHash.startsWith('$2a$') && !dbUser.passwordHash.startsWith('$2b$')) {
        throw new Error('Password was not hashed with bcrypt!');
    }
    if (dbUser.passwordHash === user1Password) {
        throw new Error('FATAL: Plaintext password stored!');
    }
    console.log('  PASSED: Password is cryptographically hashed with bcrypt in Cosmos DB.\n');

    // 4. Login using the same Gmail + password
    console.log('[Test 4] Login using User 1 Gmail + password:');
    const loginRes1 = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user1Email, password: user1Password })
    });
    const loginData1 = await loginRes1.json();
    console.log(`  Login status: ${loginRes1.status}, token generated: ${!!loginData1.token}`);
    if (loginRes1.status !== 200 || !loginData1.token) throw new Error('Login failed!');
    const user1Token = loginData1.token;
    console.log(`  Authenticated User ID: ${loginData1.user.id}`);
    console.log('  PASSED: Login succeeded.\n');

    // 5. Verify /api/auth/me returns valid authenticated session
    console.log('[Test 5] Verify dashboard session with /api/auth/me:');
    const meRes1 = await fetch(`${BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${user1Token}` }
    });
    const meData1 = await meRes1.json();
    console.log(`  /api/auth/me status: ${meRes1.status}, user email: ${meData1.user.email}, id: ${meData1.user.id}`);
    if (meRes1.status !== 200 || meData1.user.email !== user1Email) throw new Error('/api/auth/me session check failed!');
    console.log('  PASSED: Authenticated session confirmed.\n');

    // 6 & 7. Upload a file and verify file is associated with logged-in user's application ID
    console.log('[Test 6 & 7] Upload a file as User 1:');
    const testFileContent = 'Hello Cloud File Sharing with Application Auth - ' + Date.now();
    const boundary = '----WebKitFormBoundaryTest123';
    const multipartBody = 
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="auth-test-document.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        `${testFileContent}\r\n` +
        `--${boundary}--\r\n`;

    const uploadRes = await fetch(`${BASE_URL}/uploadFile`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${user1Token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
    });
    const uploadData = await uploadRes.json();
    console.log(`  Upload status: ${uploadRes.status}, File ID: ${uploadData.file.id}`);
    console.log(`  File ownerId: ${uploadData.file.ownerId}`);
    if (uploadRes.status !== 201) throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
    if (uploadData.file.ownerId !== regData1.user.id) {
        throw new Error(`File ownerId ${uploadData.file.ownerId} does NOT match application user ID ${regData1.user.id}!`);
    }
    const fileId = uploadData.file.id;
    console.log('  PASSED: File uploaded and securely associated with application user ID.\n');

    // 8. List files
    console.log('[Test 8] List files for User 1:');
    const listRes = await fetch(`${BASE_URL}/listFiles`, {
        headers: { 'Authorization': `Bearer ${user1Token}` }
    });
    const listData = await listRes.json();
    console.log(`  List files status: ${listRes.status}, count: ${listData.count}`);
    const foundFile = listData.files.find(f => f.id === fileId);
    if (!foundFile) throw new Error('Uploaded file was not found in listFiles!');
    console.log(`  Found uploaded file: ${foundFile.fileName} (${foundFile.size} bytes)`);
    console.log('  PASSED: File listed successfully.\n');

    // 9. Download file
    console.log('[Test 9] Download file as User 1:');
    const downloadRes1 = await fetch(`${BASE_URL}/files/${fileId}/download`, {
        headers: { 'Authorization': `Bearer ${user1Token}` }
    });
    const downloadedText = await downloadRes1.text();
    console.log(`  Download status: ${downloadRes1.status}, content matches: ${downloadedText === testFileContent}`);
    if (downloadRes1.status !== 200 || downloadedText !== testFileContent) {
        throw new Error('Downloaded file content did not match uploaded content!');
    }
    console.log('  PASSED: File downloaded successfully with matching binary content.\n');

    // 10. Register User 2 (Bob) and Share file
    console.log('[Test 10] Register User 2 (Bob) and share file:');
    const user2Email = `bob.${Date.now()}@gmail.com`;
    const user2Password = 'Password456!';
    const regRes2 = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user2Email, password: user2Password, confirmPassword: user2Password })
    });
    const regData2 = await regRes2.json();
    console.log(`  User 2 registered: ID=${regData2.user.id}, email=${regData2.user.email}`);

    // Share file with User 2
    const shareRes = await fetch(`${BASE_URL}/files/${fileId}/share`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${user1Token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sharedWith: user2Email,
            permission: 'viewer'
        })
    });
    const shareData = await shareRes.json();
    console.log(`  Share status: ${shareRes.status}, message: ${shareData.message}`);
    console.log(`  Recipient OID stored: ${shareData.share.sharedWithOid}`);
    if (shareRes.status !== 201) throw new Error(`Sharing failed: ${JSON.stringify(shareData)}`);
    console.log('  PASSED: File shared with User 2.\n');

    // 11. Login as User 2 (Bob)
    console.log('[Test 11] Login as User 2 (Bob):');
    const loginRes2 = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user2Email, password: user2Password })
    });
    const loginData2 = await loginRes2.json();
    const user2Token = loginData2.token;
    console.log(`  User 2 login status: ${loginRes2.status}, authenticated as: ${loginData2.user.email}`);
    if (loginRes2.status !== 200 || !user2Token) throw new Error('User 2 login failed!');
    console.log('  PASSED: User 2 logged in.\n');

    // 12. Verify shared file appears in User 2 shared-files
    console.log('[Test 12] Verify shared file appears for User 2:');
    const sharedRes2 = await fetch(`${BASE_URL}/shared-files`, {
        headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    const sharedData2 = await sharedRes2.json();
    console.log(`  User 2 shared files count: ${sharedData2.count}`);
    const foundShared = sharedData2.sharedFiles.find(s => s.fileId === fileId);
    if (!foundShared) throw new Error('Shared file was not found in User 2 sharedFiles!');
    console.log(`  Found shared file: ${foundShared.fileName}, sharedBy: ${foundShared.sharedBy}`);
    console.log('  PASSED: Shared file appears for User 2.\n');

    // 13. Download shared file as User 2
    console.log('[Test 13] Download shared file as User 2:');
    const downloadRes2 = await fetch(`${BASE_URL}/files/${fileId}/download`, {
        headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    const downloadedText2 = await downloadRes2.text();
    console.log(`  User 2 download status: ${downloadRes2.status}, content matches: ${downloadedText2 === testFileContent}`);
    if (downloadRes2.status !== 200 || downloadedText2 !== testFileContent) {
        throw new Error('User 2 could not download the shared file!');
    }
    console.log('  PASSED: User 2 successfully downloaded the shared file.\n');

    // 14. Verify User 2 CANNOT delete User 1 file (must receive 403 Forbidden)
    console.log('[Test 14] Verify User 2 CANNOT delete User 1 file:');
    const deleteAttemptRes = await fetch(`${BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    console.log(`  Delete attempt status: ${deleteAttemptRes.status} (expected 403 Forbidden)`);
    if (deleteAttemptRes.status !== 403) {
        throw new Error(`Expected 403 Forbidden, but received ${deleteAttemptRes.status}!`);
    }
    console.log('  PASSED: User 2 cannot delete User 1 file (correctly 403 Forbidden).\n');

    // 15. Logout
    console.log('[Test 15] Test logout:');
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    console.log(`  Logout status: ${logoutRes.status}`);
    if (logoutRes.status !== 200) throw new Error('Logout failed!');
    console.log('  PASSED: Logout endpoint succeeded.\n');

    // Clean up test file as User 1
    console.log('Cleaning up: User 1 deletes the test file:');
    const cleanDeleteRes = await fetch(`${BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user1Token}` }
    });
    console.log(`  File deletion status: ${cleanDeleteRes.status} (expected 200)`);
    if (cleanDeleteRes.status !== 200) throw new Error('File deletion failed!');

    // Clean up users from Cosmos DB
    await usersContainer.item(regData1.user.id, regData1.user.id).delete();
    await usersContainer.item(regData2.user.id, regData2.user.id).delete();
    console.log('  Test users cleaned up.\n');

    console.log('====================================================');
    console.log('ALL 17 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('\nTEST FAILED:', err);
    process.exit(1);
});
