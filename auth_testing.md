# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session in MongoDB
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('SESSION_TOKEN=' + sessionToken);
print('USER_ID=' + userId);
"
```

## Step 2: Test Backend
```
curl -X GET "$BASE/api/auth/me" -H "Authorization: Bearer $SESSION_TOKEN"
curl -X POST "$BASE/api/projects/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"prompt":"Create a modern restaurant website"}'
curl -X GET "$BASE/api/projects" -H "Authorization: Bearer $SESSION_TOKEN"
```

## Step 3: Browser Testing
Set cookie `session_token` (httpOnly, secure, samesite=None), path=/, domain=your app.
Then visit `/dashboard` and `/builder/:id`.

## Success Criteria
- `/api/auth/me` returns user data (200)
- `/api/projects/generate` returns project with html/css/js fields
- Dashboard renders projects list
- Builder shows live iframe preview
